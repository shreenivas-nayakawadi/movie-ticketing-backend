import { randomUUID } from 'crypto';
import { env } from '../../config/env';
import { HttpError } from '../../lib/http-error';
import { prisma } from '../../lib/prisma';
import { checkRedisConnection, redisClient } from '../../lib/redis';
import { hasSingleSeatGapInRow } from './seat-gap.rule';

type CreateHoldInput = {
  showId: string;
  customerEmail: string;
  showSeatIds: string[];
};

const SHOW_STATUS_SCHEDULED = 'SCHEDULED';
const SHOW_SEAT_STATUS_AVAILABLE = 'AVAILABLE';
const SHOW_SEAT_STATUS_HELD = 'HELD';
const HOLD_STATUS_ACTIVE = 'ACTIVE';
const HOLD_STATUS_CANCELLED = 'CANCELLED';
const HOLD_STATUS_EXPIRED = 'EXPIRED';

// Reuse a single include shape so hold responses always include seat metadata.
const holdInclude = {
  holdSeats: {
    include: {
      showSeat: {
        include: {
          seat: true,
        },
      },
    },
  },
} as const;

// Fetch one hold and its related held seats in a consistent shape.
async function findHoldWithSeats(holdId: string) {
  return prisma.hold.findUnique({
    where: { id: holdId },
    include: holdInclude,
  });
}

type HoldWithSeats = NonNullable<Awaited<ReturnType<typeof findHoldWithSeats>>>;
type HoldSeatWithRelations = HoldWithSeats['holdSeats'][number];
type TxClient = Omit<typeof prisma, '$connect' | '$disconnect' | '$on' | '$transaction' | '$extends'>;

// Delete lock key only when lock value still belongs to current hold.
const LOCK_RELEASE_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
else
  return 0
end
`;

// Build a deterministic redis key per show seat.
function getSeatLockKey(showId: string, showSeatId: string): string {
  return `hold:show:${showId}:showSeat:${showSeatId}`;
}

// Best-effort lock cleanup. A failure here should not crash the request path.
async function releaseSeatLocks(
  showId: string,
  showSeatIds: string[],
  lockValue: string,
): Promise<void> {
  for (const showSeatId of showSeatIds) {
    const key = getSeatLockKey(showId, showSeatId);
    try {
      await redisClient.eval(LOCK_RELEASE_SCRIPT, {
        keys: [key],
        arguments: [lockValue],
      });
    } catch (error) {
      console.error(`[hold] failed to release redis key ${key}`, error);
    }
  }
}

// Acquire redis locks for all requested seats. If one fails, rollback already-acquired locks.
async function acquireSeatLocks(
  showId: string,
  showSeatIds: string[],
  lockValue: string,
): Promise<void> {
  const acquired: string[] = [];

  try {
    for (const showSeatId of showSeatIds) {
      const key = getSeatLockKey(showId, showSeatId);
      const result = await redisClient.set(key, lockValue, {
        NX: true,
        EX: env.HOLD_TTL_SECONDS,
      });

      if (result !== 'OK') {
        throw new HttpError(409, `Seat lock conflict for seat ${showSeatId}`, 'SEAT_LOCK_CONFLICT');
      }

      acquired.push(showSeatId);
    }
  } catch (error) {
    if (acquired.length > 0) {
      await releaseSeatLocks(showId, acquired, lockValue);
    }

    throw error;
  }
}

// Normalize DB hold payload to API response and sort seats for predictable UI rendering.
function mapHold(hold: HoldWithSeats) {
  type SeatResponse = {
    showSeatId: string;
    seatId: string;
    rowLabel: string;
    seatNumber: number;
    status: string;
    price: number;
  };

  return {
    id: hold.id,
    showId: hold.showId,
    customerEmail: hold.customerEmail,
    status: hold.status,
    expiresAt: hold.expiresAt,
    createdAt: hold.createdAt,
    updatedAt: hold.updatedAt,
    seats: hold.holdSeats
      .map((holdSeat: HoldSeatWithRelations): SeatResponse => ({
        showSeatId: holdSeat.showSeat.id,
        seatId: holdSeat.showSeat.seatId,
        rowLabel: holdSeat.showSeat.seat.rowLabel,
        seatNumber: holdSeat.showSeat.seat.seatNumber,
        status: holdSeat.showSeat.status,
        price: Number(holdSeat.showSeat.price),
      }))
      .sort((a: SeatResponse, b: SeatResponse) => {
        if (a.rowLabel === b.rowLabel) {
          return a.seatNumber - b.seatNumber;
        }

        return a.rowLabel.localeCompare(b.rowLabel);
      }),
  };
}

// Validate selection against the "single-seat-gap" business rule row by row.
function validateSingleSeatGap(
  allShowSeats: Array<{
    id: string;
    status: string;
    seat: { rowLabel: string; seatNumber: number };
  }>,
  selectedShowSeatIds: Set<string>,
): void {
  const rows = new Map<string, Array<{ seatNumber: number; blocked: boolean }>>();

  for (const showSeat of allShowSeats) {
    const blocked =
      showSeat.status !== SHOW_SEAT_STATUS_AVAILABLE || selectedShowSeatIds.has(showSeat.id);

    const row = rows.get(showSeat.seat.rowLabel) ?? [];
    row.push({ seatNumber: showSeat.seat.seatNumber, blocked });
    rows.set(showSeat.seat.rowLabel, row);
  }

  for (const [rowLabel, rowSeats] of rows.entries()) {
    if (hasSingleSeatGapInRow(rowSeats)) {
      throw new HttpError(
        422,
        `Selection violates single-seat-gap rule in row ${rowLabel}`,
        'SINGLE_SEAT_GAP',
      );
    }
  }
}

// Create a new hold by combining redis lock + transactional DB status updates.
export async function createHold(input: CreateHoldInput) {
  await checkRedisConnection();

  const showSeatIds = [...new Set(input.showSeatIds)];
  if (showSeatIds.length !== input.showSeatIds.length) {
    throw new HttpError(400, 'Duplicate showSeatIds are not allowed', 'INVALID_INPUT');
  }

  const show = await prisma.show.findUnique({
    where: { id: input.showId },
    select: { id: true, status: true },
  });

  if (!show) {
    throw new HttpError(404, 'Show not found', 'SHOW_NOT_FOUND');
  }

  if (show.status !== SHOW_STATUS_SCHEDULED) {
    throw new HttpError(409, 'Show is not open for booking', 'SHOW_NOT_BOOKABLE');
  }

  const requestedShowSeats = await prisma.showSeat.findMany({
    where: {
      showId: input.showId,
      id: { in: showSeatIds },
    },
    include: {
      seat: true,
    },
  });

  if (requestedShowSeats.length !== showSeatIds.length) {
    throw new HttpError(404, 'One or more seats do not exist for this show', 'SEAT_NOT_FOUND');
  }

  const unavailableSeatIds = requestedShowSeats
    .filter(
      (showSeat: (typeof requestedShowSeats)[number]) =>
        showSeat.status !== SHOW_SEAT_STATUS_AVAILABLE,
    )
    .map((showSeat: (typeof requestedShowSeats)[number]) => showSeat.id);

  if (unavailableSeatIds.length > 0) {
    throw new HttpError(
      409,
      `One or more seats are unavailable: ${unavailableSeatIds.join(', ')}`,
      'SEAT_UNAVAILABLE',
    );
  }

  const allShowSeats = await prisma.showSeat.findMany({
    where: { showId: input.showId },
    include: {
      seat: true,
    },
  });

  validateSingleSeatGap(allShowSeats, new Set(showSeatIds));

  const holdId = randomUUID();
  const expiresAt = new Date(Date.now() + env.HOLD_TTL_SECONDS * 1000);

  await acquireSeatLocks(input.showId, showSeatIds, holdId);

  try {
    const hold = await prisma.$transaction(async (tx: TxClient) => {
      const updated = await tx.showSeat.updateMany({
        where: {
          showId: input.showId,
          id: { in: showSeatIds },
          status: SHOW_SEAT_STATUS_AVAILABLE,
        },
        data: {
          status: SHOW_SEAT_STATUS_HELD,
        },
      });

      if (updated.count !== showSeatIds.length) {
        throw new HttpError(409, 'Seat state changed during hold creation', 'SEAT_CONFLICT');
      }

      return tx.hold.create({
        data: {
          id: holdId,
          showId: input.showId,
          customerEmail: input.customerEmail,
          status: HOLD_STATUS_ACTIVE,
          expiresAt,
          holdSeats: {
            createMany: {
              data: showSeatIds.map((showSeatId) => ({
                showSeatId,
              })),
            },
          },
        },
        include: holdInclude,
      });
    });

    return mapHold(hold);
  } catch (error) {
    await releaseSeatLocks(input.showId, showSeatIds, holdId);
    throw error;
  }
}

// Read a hold by id, including held seat details.
export async function getHoldById(holdId: string) {
  const hold = await findHoldWithSeats(holdId);

  if (!hold) {
    throw new HttpError(404, 'Hold not found', 'HOLD_NOT_FOUND');
  }

  return mapHold(hold);
}

// Cancel an active hold, release seat statuses, and free redis locks.
export async function cancelHold(holdId: string) {
  await checkRedisConnection();

  const hold = await findHoldWithSeats(holdId);

  if (!hold) {
    throw new HttpError(404, 'Hold not found', 'HOLD_NOT_FOUND');
  }

  const showSeatIds = hold.holdSeats.map(
    (holdSeat: HoldSeatWithRelations) => holdSeat.showSeatId,
  );

  await prisma.$transaction(async (tx: TxClient) => {
    if (hold.status === HOLD_STATUS_ACTIVE) {
      await tx.hold.updateMany({
        where: {
          id: holdId,
          status: HOLD_STATUS_ACTIVE,
        },
        data: {
          status: HOLD_STATUS_CANCELLED,
        },
      });
    }

    // Always try to free any held seats for this hold as an idempotent healing step.
    if (showSeatIds.length > 0) {
      await tx.showSeat.updateMany({
        where: {
          id: { in: showSeatIds },
          status: SHOW_SEAT_STATUS_HELD,
        },
        data: {
          status: SHOW_SEAT_STATUS_AVAILABLE,
        },
      });
    }
  });

  await releaseSeatLocks(hold.showId, showSeatIds, hold.id);

  const refreshedHold = await findHoldWithSeats(holdId);

  if (!refreshedHold) {
    throw new HttpError(404, 'Hold not found after cancellation', 'HOLD_NOT_FOUND');
  }

  return mapHold(refreshedHold);
}

// Batch-expire active holds past TTL and release corresponding seats/locks.
export async function expireActiveHoldsBatch(batchSize = 100): Promise<number> {
  const now = new Date();
  const expiredHolds = await prisma.hold.findMany({
    where: {
      status: HOLD_STATUS_ACTIVE,
      expiresAt: { lte: now },
    },
    include: holdInclude,
    orderBy: {
      expiresAt: 'asc',
    },
    take: batchSize,
  });

  let expiredCount = 0;

  for (const hold of expiredHolds) {
    const showSeatIds = hold.holdSeats.map(
      (holdSeat: (typeof hold.holdSeats)[number]) => holdSeat.showSeatId,
    );
    const changed = await prisma.$transaction(async (tx: TxClient) => {
      const markExpired = await tx.hold.updateMany({
        where: {
          id: hold.id,
          status: HOLD_STATUS_ACTIVE,
          expiresAt: { lte: new Date() },
        },
        data: {
          status: HOLD_STATUS_EXPIRED,
        },
      });

      if (markExpired.count === 0) {
        return false;
      }

      if (showSeatIds.length > 0) {
        await tx.showSeat.updateMany({
          where: {
            id: { in: showSeatIds },
            status: SHOW_SEAT_STATUS_HELD,
          },
          data: {
            status: SHOW_SEAT_STATUS_AVAILABLE,
          },
        });
      }

      return true;
    });

    if (changed) {
      expiredCount += 1;
      await releaseSeatLocks(hold.showId, showSeatIds, hold.id);
    }
  }

  return expiredCount;
}
