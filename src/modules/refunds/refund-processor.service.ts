import { prisma } from '../../lib/prisma';
import { processRefund } from '../../integrations/refund/refund.client';

// Compute retry delay with exponential backoff and hard cap.
function getRetryAt(attempts: number): Date {
  const delaySeconds = Math.min(120, Math.pow(2, Math.max(1, attempts)));
  return new Date(Date.now() + delaySeconds * 1000);
}

// Process pending refund jobs and update refund/payment/booking states accordingly.
export async function processRefundJobsBatch(batchSize = 50): Promise<number> {
  const now = new Date();
  const jobs = await prisma.refundJob.findMany({
    where: {
      status: 'PENDING',
      OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
    },
    include: {
      booking: {
        include: {
          payment: true,
        },
      },
    },
    orderBy: [{ createdAt: 'asc' }],
    take: batchSize,
  });

  let processedCount = 0;

  for (const job of jobs) {
    const providerReference = job.providerReference ?? job.booking.payment?.providerReference ?? null;
    if (!providerReference) {
      const nextAttempts = job.attempts + 1;
      const shouldFail = nextAttempts >= job.maxAttempts;

      await prisma.refundJob.update({
        where: { id: job.id },
        data: {
          status: shouldFail ? 'FAILED' : 'PENDING',
          attempts: nextAttempts,
          nextAttemptAt: shouldFail ? null : getRetryAt(nextAttempts),
          lastError: 'Missing provider reference for refund',
        },
      });

      continue;
    }

    const refundResult = await processRefund({
      bookingId: job.bookingId,
      showId: job.showId,
      providerReference,
      amount: Number(job.amount),
      currency: job.booking.payment?.currency ?? 'USD',
      idempotencyKey: `refund-job-${job.id}`,
    });

    if (refundResult.success) {
      await prisma.$transaction(async (tx) => {
        await tx.refundJob.update({
          where: { id: job.id },
          data: {
            status: 'PROCESSED',
            attempts: {
              increment: 1,
            },
            nextAttemptAt: null,
            processedAt: new Date(),
            providerReference,
            lastError: null,
          },
        });

        await tx.booking.updateMany({
          where: {
            id: job.bookingId,
            status: {
              in: ['CONFIRMED', 'FAILED', 'CANCELLED'],
            },
          },
          data: {
            status: 'REFUNDED',
          },
        });

        if (job.booking.payment) {
          await tx.payment.update({
            where: { bookingId: job.bookingId },
            data: {
              status: 'REFUNDED',
            },
          });
        }
      });

      processedCount += 1;
      continue;
    }

    const nextAttempts = job.attempts + 1;
    const shouldFail = nextAttempts >= job.maxAttempts;

    await prisma.refundJob.update({
      where: { id: job.id },
      data: {
        status: shouldFail ? 'FAILED' : 'PENDING',
        attempts: nextAttempts,
        nextAttemptAt: shouldFail ? null : getRetryAt(nextAttempts),
        lastError: refundResult.error ?? 'Unknown refund failure',
      },
    });
  }

  return processedCount;
}
