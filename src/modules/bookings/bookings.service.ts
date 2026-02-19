import { Prisma } from '@prisma/client';
import { HttpError } from '../../lib/http-error';
import { prisma } from '../../lib/prisma';
import { createBookingOutboxEvents } from '../events/outbox.service';
import { cancelHold } from '../holds/holds.service';
import { buildCheckoutLoyaltyEntries, getLoyaltyBalance } from '../loyalty/loyalty.service';
import { chargeWithMockGateway } from '../payments/mock-payment.client';
import {
  calculateCheckoutPricing,
  ConcessionRequest,
  PricingComboRule,
} from '../pricing/pricing.service';
import { scheduleKitchenPrepWorkflow } from '../../temporal/kitchen.scheduler';

const HOLD_STATUS_ACTIVE = 'ACTIVE';
const HOLD_STATUS_CONVERTED = 'CONVERTED';
const SHOW_STATUS_SCHEDULED = 'SCHEDULED';
const SHOW_SEAT_STATUS_HELD = 'HELD';
const SHOW_SEAT_STATUS_BOOKED = 'BOOKED';
const BOOKING_STATUS_CONFIRMED = 'CONFIRMED';
const PAYMENT_STATUS_CAPTURED = 'CAPTURED';

type CheckoutInput = {
  holdId: string;
  concessions: ConcessionRequest[];
  redeemPoints: number;
  paymentMethod: 'MOCK_CARD' | 'MOCK_UPI' | 'MOCK_NETBANKING' | 'MOCK_FAIL';
  customerPhone?: string;
  idempotencyKey?: string;
};

type CheckoutDbClient = Prisma.TransactionClient | typeof prisma;

// Keep include shape in one place so booking payloads stay consistent.
const bookingInclude = Prisma.validator<Prisma.BookingInclude>()({
  show: {
    select: {
      id: true,
      movieTitle: true,
      startsAt: true,
      intervalAt: true,
      status: true,
    },
  },
  bookingSeats: {
    include: {
      showSeat: {
        include: {
          seat: true,
        },
      },
    },
    orderBy: [{ showSeat: { seat: { rowLabel: 'asc' } } }, { showSeat: { seat: { seatNumber: 'asc' } } }],
  },
  payment: true,
  concessionOrder: {
    include: {
      items: true,
    },
  },
  loyaltyEntries: {
    orderBy: {
      createdAt: 'asc',
    },
  },
  notifications: {
    orderBy: {
      createdAt: 'asc',
    },
  },
});

// Hold shape required for checkout validation and seat updates.
const holdCheckoutInclude = Prisma.validator<Prisma.HoldInclude>()({
  show: {
    select: {
      id: true,
      status: true,
      intervalAt: true,
    },
  },
  holdSeats: {
    include: {
      showSeat: {
        include: {
          seat: true,
        },
      },
    },
  },
});

type BookingWithRelations = Prisma.BookingGetPayload<{ include: typeof bookingInclude }>;
type HoldForCheckout = Prisma.HoldGetPayload<{ include: typeof holdCheckoutInclude }>;
type HoldSeatRow = HoldForCheckout['holdSeats'][number];

// Convert decimal-like DB values into integer cents for stable calculations.
function amountToCents(amount: Prisma.Decimal | number): number {
  return Math.round(Number(amount) * 100);
}

// Convert integer cents back to decimal amount for DB writes/responses.
function centsToAmount(cents: number): number {
  return Number((cents / 100).toFixed(2));
}

// Find a booking by id with all details needed by API response.
async function findBookingById(bookingId: string) {
  return prisma.booking.findUnique({
    where: { id: bookingId },
    include: bookingInclude,
  });
}

// Find booking by hold id to support idempotent checkout retries.
async function findBookingByHoldId(holdId: string) {
  return prisma.booking.findUnique({
    where: { holdId },
    include: bookingInclude,
  });
}

// Load hold + seats in checkout shape using either root client or tx client.
async function findHoldForCheckout(holdId: string, client: CheckoutDbClient) {
  return client.hold.findUnique({
    where: { id: holdId },
    include: holdCheckoutInclude,
  });
}

// Ensure hold and seats are still valid to be converted into a booking.
function assertHoldCanCheckout(hold: HoldForCheckout): void {
  if (hold.status === HOLD_STATUS_CONVERTED) {
    throw new HttpError(409, 'Hold is already converted to booking', 'HOLD_ALREADY_CONVERTED');
  }

  if (hold.status !== HOLD_STATUS_ACTIVE) {
    throw new HttpError(409, `Hold is not active (current: ${hold.status})`, 'HOLD_NOT_ACTIVE');
  }

  if (hold.expiresAt <= new Date()) {
    throw new HttpError(409, 'Hold has expired', 'HOLD_EXPIRED');
  }

  if (hold.show.status !== SHOW_STATUS_SCHEDULED) {
    throw new HttpError(409, 'Show is not bookable', 'SHOW_NOT_BOOKABLE');
  }

  if (hold.holdSeats.length === 0) {
    throw new HttpError(409, 'Hold has no seats', 'EMPTY_HOLD');
  }

  const seatConflict = hold.holdSeats.find(
    (holdSeat: HoldSeatRow) => holdSeat.showSeat.status !== SHOW_SEAT_STATUS_HELD,
  );
  if (seatConflict) {
    throw new HttpError(
      409,
      `Seat ${seatConflict.showSeatId} is not held anymore`,
      'SEAT_STATE_CONFLICT',
    );
  }
}

// Pick the best applicable combo rule based on ticket count and requested concession SKUs.
async function getApplicableComboRule(
  ticketCount: number,
  concessions: ConcessionRequest[],
): Promise<PricingComboRule> {
  if (ticketCount <= 0 || concessions.length === 0) {
    return null;
  }

  const skuSet = new Set(
    concessions.map((concession: ConcessionRequest) => concession.itemCode.trim().toUpperCase()),
  );

  const rules = await prisma.comboRule.findMany({
    where: {
      isActive: true,
      targetSku: {
        in: [...skuSet],
      },
    },
    orderBy: [{ minTickets: 'desc' }, { discountPercent: 'desc' }],
  });

  const rule = rules.find((candidate) => ticketCount >= candidate.minTickets);
  if (!rule) {
    return null;
  }

  return {
    minTickets: rule.minTickets,
    targetSku: rule.targetSku,
    discountPercent: Number(rule.discountPercent),
  };
}

// Convert DB booking object to API-safe payload with numeric amounts.
function mapBooking(booking: BookingWithRelations) {
  type SeatPayload = {
    showSeatId: string;
    seatId: string;
    rowLabel: string;
    seatNumber: number;
    price: number;
  };

  const seats = booking.bookingSeats
    .map((bookingSeat): SeatPayload => ({
      showSeatId: bookingSeat.showSeatId,
      seatId: bookingSeat.showSeat.seatId,
      rowLabel: bookingSeat.showSeat.seat.rowLabel,
      seatNumber: bookingSeat.showSeat.seat.seatNumber,
      price: Number(bookingSeat.price),
    }))
    .sort((a: SeatPayload, b: SeatPayload) => {
      if (a.rowLabel === b.rowLabel) {
        return a.seatNumber - b.seatNumber;
      }

      return a.rowLabel.localeCompare(b.rowLabel);
    });

  return {
    id: booking.id,
    showId: booking.showId,
    holdId: booking.holdId,
    customerEmail: booking.customerEmail,
    customerPhone: booking.customerPhone,
    status: booking.status,
    subtotal: Number(booking.subtotal),
    discount: Number(booking.discount),
    total: Number(booking.total),
    loyaltyPointsEarned: booking.loyaltyPointsEarned,
    show: booking.show,
    seats,
    payment: booking.payment
      ? {
          id: booking.payment.id,
          provider: booking.payment.provider,
          providerReference: booking.payment.providerReference,
          status: booking.payment.status,
          amount: Number(booking.payment.amount),
          currency: booking.payment.currency,
          capturedAt: booking.payment.capturedAt,
        }
      : null,
    concessionOrder: booking.concessionOrder
      ? {
          id: booking.concessionOrder.id,
          status: booking.concessionOrder.status,
          scheduledPrepAt: booking.concessionOrder.scheduledPrepAt,
          totalAmount: Number(booking.concessionOrder.totalAmount),
          items: booking.concessionOrder.items.map((item) => ({
            id: item.id,
            sku: item.sku,
            name: item.name,
            quantity: item.quantity,
            unitPrice: Number(item.unitPrice),
            discountPercent: Number(item.discountPercent),
          })),
        }
      : null,
    loyaltyEntries: booking.loyaltyEntries.map((entry) => ({
      id: entry.id,
      type: entry.type,
      points: entry.points,
      reason: entry.reason,
      createdAt: entry.createdAt,
    })),
    notifications: booking.notifications.map((notification) => ({
      id: notification.id,
      channel: notification.channel,
      template: notification.template,
      recipient: notification.recipient,
      status: notification.status,
      createdAt: notification.createdAt,
      sentAt: notification.sentAt,
    })),
    createdAt: booking.createdAt,
    updatedAt: booking.updatedAt,
  };
}

// Load a booking by id and return normalized API payload.
export async function getBookingById(bookingId: string) {
  const booking = await findBookingById(bookingId);
  if (!booking) {
    throw new HttpError(404, 'Booking not found', 'BOOKING_NOT_FOUND');
  }

  return mapBooking(booking);
}

// Convert an active hold into a confirmed booking with payment + loyalty side effects.
export async function checkoutBooking(input: CheckoutInput) {
  const existingBooking = await findBookingByHoldId(input.holdId);
  if (existingBooking) {
    return {
      booking: mapBooking(existingBooking),
      isIdempotentReplay: true,
    };
  }

  const hold = await findHoldForCheckout(input.holdId, prisma);
  if (!hold) {
    throw new HttpError(404, 'Hold not found', 'HOLD_NOT_FOUND');
  }
  assertHoldCanCheckout(hold);

  const ticketPricesCents = hold.holdSeats.map((holdSeat: HoldSeatRow) =>
    amountToCents(holdSeat.showSeat.price),
  );
  const comboRule = await getApplicableComboRule(ticketPricesCents.length, input.concessions);
  const availableLoyaltyPoints = await getLoyaltyBalance(hold.customerEmail);

  const pricing = calculateCheckoutPricing({
    ticketPricesCents,
    concessions: input.concessions,
    comboRule,
    redeemPointsRequested: input.redeemPoints,
    availableLoyaltyPoints,
  });

  const paymentResult = await chargeWithMockGateway({
    amountCents: pricing.payableTotalCents,
    currency: 'USD',
    method: input.paymentMethod,
    idempotencyKey: input.idempotencyKey,
    holdId: hold.id,
  });

  if (!paymentResult.success) {
    // On payment failure, release held seats immediately instead of waiting for TTL.
    try {
      await cancelHold(hold.id);
    } catch (error) {
      console.error('[booking] failed to auto-cancel hold after payment failure', error);
    }

    throw new HttpError(
      402,
      paymentResult.failureReason ?? 'Payment failed',
      'PAYMENT_CAPTURE_FAILED',
    );
  }

  const bookingId = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const replayBooking = await tx.booking.findUnique({
      where: { holdId: input.holdId },
      select: { id: true },
    });
    if (replayBooking) {
      return replayBooking.id;
    }

    const holdInTx = await findHoldForCheckout(input.holdId, tx);
    if (!holdInTx) {
      throw new HttpError(404, 'Hold not found', 'HOLD_NOT_FOUND');
    }
    assertHoldCanCheckout(holdInTx);

    const showSeatIds = holdInTx.holdSeats.map(
      (holdSeat: HoldSeatRow) => holdSeat.showSeatId,
    );

    const markHoldConverted = await tx.hold.updateMany({
      where: {
        id: holdInTx.id,
        status: HOLD_STATUS_ACTIVE,
        expiresAt: { gt: new Date() },
      },
      data: {
        status: HOLD_STATUS_CONVERTED,
      },
    });

    if (markHoldConverted.count !== 1) {
      throw new HttpError(409, 'Hold state changed during checkout', 'HOLD_STATE_CONFLICT');
    }

    const markSeatsBooked = await tx.showSeat.updateMany({
      where: {
        id: { in: showSeatIds },
        status: SHOW_SEAT_STATUS_HELD,
      },
      data: {
        status: SHOW_SEAT_STATUS_BOOKED,
      },
    });

    if (markSeatsBooked.count !== showSeatIds.length) {
      throw new HttpError(409, 'Seat state changed during checkout', 'SEAT_STATE_CONFLICT');
    }

    const booking = await tx.booking.create({
      data: {
        showId: holdInTx.showId,
        holdId: holdInTx.id,
        customerEmail: holdInTx.customerEmail,
        customerPhone: input.customerPhone ?? null,
        status: BOOKING_STATUS_CONFIRMED,
        subtotal: centsToAmount(pricing.subtotalCents),
        discount: centsToAmount(pricing.totalDiscountCents),
        total: centsToAmount(pricing.payableTotalCents),
        loyaltyPointsEarned: pricing.earnedPoints,
      },
      select: {
        id: true,
      },
    });

    await tx.bookingSeat.createMany({
      data: holdInTx.holdSeats.map((holdSeat: HoldSeatRow) => ({
        bookingId: booking.id,
        showSeatId: holdSeat.showSeatId,
        price: centsToAmount(amountToCents(holdSeat.showSeat.price)),
      })),
    });

    await tx.payment.create({
      data: {
        bookingId: booking.id,
        provider: paymentResult.provider,
        providerReference: paymentResult.providerReference,
        status: PAYMENT_STATUS_CAPTURED,
        amount: centsToAmount(pricing.payableTotalCents),
        currency: 'USD',
        capturedAt: new Date(),
        metadata: paymentResult.metadata as Prisma.InputJsonValue,
      },
    });

    if (pricing.persistedConcessionItems.length > 0) {
      await tx.concessionOrder.create({
        data: {
          bookingId: booking.id,
          totalAmount: centsToAmount(pricing.concessionSubtotalCents - pricing.comboDiscountCents),
          scheduledPrepAt: new Date(holdInTx.show.intervalAt.getTime() - 10 * 60 * 1000),
          items: {
            createMany: {
              data: pricing.persistedConcessionItems.map((item) => ({
                sku: item.sku,
                name: item.name,
                quantity: item.quantity,
                unitPrice: centsToAmount(item.unitPriceCents),
                discountPercent: item.discountPercent,
              })),
            },
          },
        },
      });
    }

    const loyaltyRows = buildCheckoutLoyaltyEntries({
      bookingId: booking.id,
      customerEmail: holdInTx.customerEmail,
      redeemedPoints: pricing.loyaltyRedeemPointsUsed,
      earnedPoints: pricing.earnedPoints,
    });

    if (loyaltyRows.length > 0) {
      await tx.loyaltyLedger.createMany({
        data: loyaltyRows,
      });
    }

    await createBookingOutboxEvents(tx, {
      bookingId: booking.id,
      customerEmail: holdInTx.customerEmail,
      hasConcessions: pricing.persistedConcessionItems.length > 0,
      showIntervalAt: holdInTx.show.intervalAt,
      holdId: holdInTx.id,
    });

    return booking.id;
  });

  const createdBooking = await findBookingById(bookingId);
  if (!createdBooking) {
    throw new HttpError(500, 'Failed to load booking after checkout', 'BOOKING_READ_FAILED');
  }

  if (createdBooking.concessionOrder?.scheduledPrepAt) {
    try {
      await scheduleKitchenPrepWorkflow({
        bookingId: createdBooking.id,
        prepAtIso: createdBooking.concessionOrder.scheduledPrepAt.toISOString(),
      });
    } catch (error) {
      console.error('[booking] failed to schedule kitchen prep workflow', error);
    }
  }

  return {
    booking: mapBooking(createdBooking),
    isIdempotentReplay: false,
  };
}
