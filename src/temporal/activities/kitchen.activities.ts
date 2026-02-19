import { prisma } from '../../lib/prisma';

// Mark concession order as preparing when kitchen prep trigger is fired.
export async function markConcessionPreparingForBooking(bookingId: string): Promise<void> {
  await prisma.concessionOrder.updateMany({
    where: {
      bookingId,
      status: 'PENDING',
    },
    data: {
      status: 'PREPARING',
    },
  });
}
