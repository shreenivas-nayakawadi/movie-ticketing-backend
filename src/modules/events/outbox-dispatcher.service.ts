import { Prisma } from '@prisma/client';
import { sendEmailWithSendGrid } from '../../integrations/email/sendgrid.client';
import { sendSms } from '../../integrations/sms/sms.client';
import { prisma } from '../../lib/prisma';
import { buildTicketEmailArtifact } from '../tickets/ticket.service';
import { markConcessionPreparingForBooking } from '../../temporal/activities/kitchen.activities';

type OutboxRow = {
  id: string;
  template: string;
  recipient: string;
  payload: Prisma.JsonValue;
  attempts: number;
  maxAttempts: number;
};

type DispatchResult = {
  success: boolean;
  externalId?: string;
  retryAt?: Date;
  error?: string;
};

// Compute retry delay with exponential backoff and cap.
function getRetryAt(attempts: number): Date {
  const delaySeconds = Math.min(60, Math.pow(2, Math.max(1, attempts)));
  return new Date(Date.now() + delaySeconds * 1000);
}

// Parse notification payload into a plain object for template-specific fields.
function asPayloadObject(payload: Prisma.JsonValue): Record<string, unknown> {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return {};
  }

  return payload as Record<string, unknown>;
}

// Build ticket email and send it through configured email gateway.
async function dispatchTicketEmail(notification: OutboxRow): Promise<DispatchResult> {
  const payload = asPayloadObject(notification.payload);
  const bookingId = typeof payload.bookingId === 'string' ? payload.bookingId : '';
  if (!bookingId) {
    return {
      success: false,
      error: 'bookingId missing in notification payload',
    };
  }

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      show: true,
      bookingSeats: {
        include: {
          showSeat: {
            include: {
              seat: true,
            },
          },
        },
      },
    },
  });

  if (!booking) {
    return {
      success: false,
      error: `booking not found: ${bookingId}`,
    };
  }

  const artifact = buildTicketEmailArtifact({
    bookingId: booking.id,
    showId: booking.showId,
    movieTitle: booking.show.movieTitle,
    startsAt: booking.show.startsAt,
    customerEmail: booking.customerEmail,
    seats: booking.bookingSeats.map((bookingSeat) => ({
      rowLabel: bookingSeat.showSeat.seat.rowLabel,
      seatNumber: bookingSeat.showSeat.seat.seatNumber,
    })),
  });

  const emailResult = await sendEmailWithSendGrid({
    to: notification.recipient,
    subject: artifact.subject,
    text: artifact.text,
    html: artifact.html,
    attachment: {
      filename: artifact.attachmentFilename,
      contentBase64: artifact.attachmentBase64,
      mimeType: 'application/pdf',
    },
    idempotencyKey: `notification-${notification.id}`,
  });

  if (!emailResult.success) {
    return {
      success: false,
      error: emailResult.error ?? 'Unknown email send failure',
    };
  }

  return {
    success: true,
    externalId: emailResult.externalId,
  };
}

// Send generic SMS notification from outbox template payload.
async function dispatchSmsNotification(notification: OutboxRow): Promise<DispatchResult> {
  const payload = asPayloadObject(notification.payload);
  const message =
    typeof payload.message === 'string' && payload.message.trim().length > 0
      ? payload.message
      : 'Your movie booking has an important update.';

  const smsResult = await sendSms({
    recipient: notification.recipient,
    message,
    idempotencyKey: `notification-${notification.id}`,
    metadata: payload,
  });

  if (!smsResult.success) {
    return {
      success: false,
      error: smsResult.error ?? 'Unknown SMS send failure',
    };
  }

  return {
    success: true,
    externalId: smsResult.externalId,
  };
}

// Process kitchen trigger only when prepAt is due; otherwise reschedule processing.
async function dispatchKitchenPrepTrigger(notification: OutboxRow): Promise<DispatchResult> {
  const payload = asPayloadObject(notification.payload);
  const bookingId = typeof payload.bookingId === 'string' ? payload.bookingId : '';
  const prepAtRaw = typeof payload.prepAt === 'string' ? payload.prepAt : '';

  if (!bookingId || !prepAtRaw) {
    return {
      success: false,
      error: 'bookingId/prepAt missing in kitchen trigger payload',
    };
  }

  const prepAt = new Date(prepAtRaw);
  if (Number.isNaN(prepAt.getTime())) {
    return {
      success: false,
      error: 'Invalid prepAt timestamp in payload',
    };
  }

  if (prepAt > new Date()) {
    return {
      success: false,
      retryAt: prepAt,
      error: 'Prep time not reached yet',
    };
  }

  await markConcessionPreparingForBooking(bookingId);

  return {
    success: true,
    externalId: `kitchen-${bookingId}`,
  };
}

// Route outbox notification to template-specific dispatcher.
async function dispatchNotification(notification: OutboxRow): Promise<DispatchResult> {
  if (notification.template === 'BOOKING_TICKET_PDF_QR') {
    return dispatchTicketEmail(notification);
  }

  if (notification.template === 'SHOW_CANCELLED_SMS') {
    return dispatchSmsNotification(notification);
  }

  if (notification.template === 'KITCHEN_PREP_TRIGGER') {
    return dispatchKitchenPrepTrigger(notification);
  }

  return {
    success: false,
    error: `Unsupported template: ${notification.template}`,
  };
}

// Process pending notification outbox rows in small batches with retry policy.
export async function processNotificationOutboxBatch(batchSize = 50): Promise<number> {
  const now = new Date();
  const pending = await prisma.notification.findMany({
    where: {
      status: 'PENDING',
      OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
    },
    orderBy: [{ createdAt: 'asc' }],
    take: batchSize,
    select: {
      id: true,
      template: true,
      recipient: true,
      payload: true,
      attempts: true,
      maxAttempts: true,
    },
  });

  let sentCount = 0;

  for (const notification of pending) {
    const result = await dispatchNotification(notification);
    if (result.success) {
      await prisma.notification.update({
        where: { id: notification.id },
        data: {
          status: 'SENT',
          externalId: result.externalId,
          sentAt: new Date(),
          attempts: {
            increment: 1,
          },
          lastError: null,
          nextAttemptAt: null,
        },
      });

      sentCount += 1;
      continue;
    }

    const nextAttempts = notification.attempts + 1;
    const shouldFail = nextAttempts >= notification.maxAttempts && !result.retryAt;

    await prisma.notification.update({
      where: { id: notification.id },
      data: {
        status: shouldFail ? 'FAILED' : 'PENDING',
        attempts: nextAttempts,
        lastError: result.error ?? 'Unknown outbox dispatch failure',
        nextAttemptAt: shouldFail ? null : result.retryAt ?? getRetryAt(nextAttempts),
      },
    });
  }

  return sentCount;
}
