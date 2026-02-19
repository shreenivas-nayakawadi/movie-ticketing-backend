type TicketSeat = {
  rowLabel: string;
  seatNumber: number;
};

type TicketContext = {
  bookingId: string;
  showId: string;
  movieTitle: string;
  startsAt: Date;
  customerEmail: string;
  seats: TicketSeat[];
};

export type TicketEmailArtifact = {
  subject: string;
  text: string;
  html: string;
  attachmentFilename: string;
  attachmentBase64: string;
  qrPayload: string;
};

// Build deterministic payload that can be encoded into QR code by downstream scanners.
export function buildTicketQrPayload(context: TicketContext): string {
  return JSON.stringify({
    bookingId: context.bookingId,
    showId: context.showId,
    movieTitle: context.movieTitle,
    startsAt: context.startsAt.toISOString(),
    customerEmail: context.customerEmail,
    seats: context.seats.map((seat: TicketSeat) => `${seat.rowLabel}${seat.seatNumber}`),
  });
}

// Build a lightweight PDF-like attachment buffer for ticket delivery workflows.
function buildTicketAttachmentBuffer(context: TicketContext, qrPayload: string): Buffer {
  const seatLabels = context.seats
    .map((seat: TicketSeat) => `${seat.rowLabel}${seat.seatNumber}`)
    .join(', ');

  const content = [
    '%PDF-1.4',
    'Movie Ticket',
    `Booking ID: ${context.bookingId}`,
    `Show ID: ${context.showId}`,
    `Movie: ${context.movieTitle}`,
    `Starts At: ${context.startsAt.toISOString()}`,
    `Customer: ${context.customerEmail}`,
    `Seats: ${seatLabels}`,
    `QR Payload: ${qrPayload}`,
    '%%EOF',
  ].join('\n');

  return Buffer.from(content, 'utf-8');
}

// Produce email subject/body plus PDF attachment content for ticket notifications.
export function buildTicketEmailArtifact(context: TicketContext): TicketEmailArtifact {
  const qrPayload = buildTicketQrPayload(context);
  const attachmentBuffer = buildTicketAttachmentBuffer(context, qrPayload);
  const seatLabels = context.seats
    .map((seat: TicketSeat) => `${seat.rowLabel}${seat.seatNumber}`)
    .join(', ');

  return {
    subject: `Your ticket for ${context.movieTitle}`,
    text: [
      `Booking confirmed: ${context.bookingId}`,
      `Movie: ${context.movieTitle}`,
      `Showtime: ${context.startsAt.toISOString()}`,
      `Seats: ${seatLabels}`,
      'Your ticket attachment includes QR payload for entry and food pickup.',
    ].join('\n'),
    html: [
      `<p>Booking confirmed: <strong>${context.bookingId}</strong></p>`,
      `<p>Movie: <strong>${context.movieTitle}</strong></p>`,
      `<p>Showtime: <strong>${context.startsAt.toISOString()}</strong></p>`,
      `<p>Seats: <strong>${seatLabels}</strong></p>`,
      '<p>Ticket attachment includes QR payload for entry and food pickup.</p>',
    ].join(''),
    attachmentFilename: `ticket-${context.bookingId}.pdf`,
    attachmentBase64: attachmentBuffer.toString('base64'),
    qrPayload,
  };
}
