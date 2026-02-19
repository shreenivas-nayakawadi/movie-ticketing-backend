import { HttpError } from '../../lib/http-error';
import { prisma } from '../../lib/prisma';

const SHOW_STATUS_SCHEDULED = 'SCHEDULED';

// Return show metadata + full seat inventory snapshot for seat selection screens.
export async function getShowSeatMap(showId: string) {
  const show = await prisma.show.findUnique({
    where: { id: showId },
    include: {
      auditorium: {
        select: {
          id: true,
          name: true,
          rows: true,
          cols: true,
        },
      },
    },
  });

  if (!show) {
    throw new HttpError(404, 'Show not found', 'SHOW_NOT_FOUND');
  }

  const showSeats = await prisma.showSeat.findMany({
    where: { showId },
    include: {
      seat: {
        select: {
          id: true,
          rowLabel: true,
          seatNumber: true,
        },
      },
    },
    orderBy: [{ seat: { rowLabel: 'asc' } }, { seat: { seatNumber: 'asc' } }],
  });

  type ShowSeatRow = (typeof showSeats)[number];

  return {
    show: {
      id: show.id,
      movieTitle: show.movieTitle,
      startsAt: show.startsAt,
      intervalAt: show.intervalAt,
      status: show.status,
      isBookable: show.status === SHOW_STATUS_SCHEDULED,
      auditorium: show.auditorium,
    },
    seats: showSeats.map((showSeat: ShowSeatRow) => ({
      showSeatId: showSeat.id,
      seatId: showSeat.seat.id,
      rowLabel: showSeat.seat.rowLabel,
      seatNumber: showSeat.seat.seatNumber,
      status: showSeat.status,
      price: Number(showSeat.price),
    })),
  };
}
