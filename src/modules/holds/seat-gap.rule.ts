type RowSeat = {
  seatNumber: number;
  blocked: boolean;
};

// Detect an isolated free seat between two blocked seats in the same row.
export function hasSingleSeatGapInRow(rowSeats: RowSeat[]): boolean {
  const sorted = [...rowSeats].sort((a, b) => a.seatNumber - b.seatNumber);

  for (let i = 1; i < sorted.length - 1; i += 1) {
    const seat = sorted[i];
    if (seat.blocked) continue;

    const leftBlocked = sorted[i - 1].blocked;
    const rightBlocked = sorted[i + 1].blocked;

    if (leftBlocked && rightBlocked) {
      return true;
    }
  }

  return false;
}
