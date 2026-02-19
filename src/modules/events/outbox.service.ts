import { Prisma } from '@prisma/client';

type OutboxClient = Prisma.TransactionClient;

type BookingOutboxInput = {
  bookingId: string;
  customerEmail: string;
  hasConcessions: boolean;
  showIntervalAt: Date | null;
  holdId: string;
};

// Schedule concession prep signal for 10 minutes before interval time.
function getKitchenPrepTime(showIntervalAt: Date): Date {
  return new Date(showIntervalAt.getTime() - 10 * 60 * 1000);
}

// Persist async delivery jobs in Notification table as an outbox queue.
export async function createBookingOutboxEvents(
  client: OutboxClient,
  input: BookingOutboxInput,
): Promise<void> {
  await client.notification.create({
    data: {
      bookingId: input.bookingId,
      channel: 'EMAIL',
      template: 'BOOKING_TICKET_PDF_QR',
      recipient: input.customerEmail,
      payload: {
        bookingId: input.bookingId,
        holdId: input.holdId,
      },
    },
  });

  if (input.hasConcessions && input.showIntervalAt) {
    await client.notification.create({
      data: {
        bookingId: input.bookingId,
        channel: 'SMS',
        template: 'KITCHEN_PREP_TRIGGER',
        recipient: 'KITCHEN_QUEUE',
        payload: {
          bookingId: input.bookingId,
          prepAt: getKitchenPrepTime(input.showIntervalAt).toISOString(),
        },
      },
    });
  }
}
