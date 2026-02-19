import { Prisma } from '@prisma/client';
import { HttpError } from '../../../lib/http-error';
import { prisma } from '../../../lib/prisma';

type CancelShowInput = {
  showId: string;
  reason: string;
};

type CancelShowResult = {
  showId: string;
  status: string;
  alreadyCancelled: boolean;
  totalBookings: number;
  totalTickets: number;
  smsQueued: number;
  refundJobsQueued: number;
};

// Cancel show and enqueue notifications/refunds based on sold ticket threshold.
export async function cancelShowAndQueueCompensation(
  input: CancelShowInput,
): Promise<CancelShowResult> {
  const show = await prisma.show.findUnique({
    where: { id: input.showId },
    select: {
      id: true,
      status: true,
      movieTitle: true,
    },
  });

  if (!show) {
    throw new HttpError(404, 'Show not found', 'SHOW_NOT_FOUND');
  }

  if (show.status === 'COMPLETED') {
    throw new HttpError(409, 'Completed show cannot be cancelled', 'SHOW_NOT_CANCELLABLE');
  }

  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const alreadyCancelled = show.status === 'CANCELLED';
    if (!alreadyCancelled) {
      await tx.show.update({
        where: { id: input.showId },
        data: { status: 'CANCELLED' },
      });
    }

    const confirmedBookings = await tx.booking.findMany({
      where: {
        showId: input.showId,
        status: 'CONFIRMED',
      },
      include: {
        bookingSeats: {
          select: {
            id: true,
          },
        },
        payment: {
          select: {
            providerReference: true,
          },
        },
      },
    });

    const totalBookings = confirmedBookings.length;
    const totalTickets = confirmedBookings.reduce(
      (sum: number, booking) => sum + booking.bookingSeats.length,
      0,
    );

    if (totalBookings > 0) {
      await tx.notification.createMany({
        data: confirmedBookings.map((booking) => ({
          bookingId: booking.id,
          channel: 'SMS',
          template: 'SHOW_CANCELLED_SMS',
          recipient: booking.customerEmail,
          payload: {
            showId: input.showId,
            reason: input.reason,
            message: `Show cancelled for booking ${booking.id}. Reason: ${input.reason}`,
          },
        })),
      });

      await tx.concessionOrder.updateMany({
        where: {
          bookingId: {
            in: confirmedBookings.map((booking) => booking.id),
          },
        },
        data: {
          status: 'CANCELLED',
        },
      });
    }

    let refundJobsQueued = 0;
    if (totalTickets > 200 && totalBookings > 0) {
      const createResult = await tx.refundJob.createMany({
        data: confirmedBookings.map((booking) => ({
          showId: input.showId,
          bookingId: booking.id,
          amount: booking.total,
          providerReference: booking.payment?.providerReference ?? null,
          status: 'PENDING',
          nextAttemptAt: new Date(),
        })),
        skipDuplicates: true,
      });

      refundJobsQueued = createResult.count;
    }

    return {
      showId: input.showId,
      status: 'CANCELLED',
      alreadyCancelled,
      totalBookings,
      totalTickets,
      smsQueued: totalBookings,
      refundJobsQueued,
    };
  });
}
