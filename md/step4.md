# Step 4: Seat Map + Hold Lifecycle Implementation

## Goal of Step 4
Step 4 builds the first real booking flow:

1. User can view seats for a show.
2. User can place a temporary hold on selected seats.
3. User can fetch hold details.
4. User can cancel a hold.
5. Expired holds are automatically released by a worker.

This step connects **Express routes**, **controllers**, **service logic**, **Postgres (Prisma)**, and **Redis locks**.

## Routes Added

### `GET /api/shows/:showId/seats`
Flow:

1. Request enters `src/modules/shows/shows.route.ts`.
2. Router sends request to `getShowSeatsController`.
3. `getShowSeatsController` validates `showId` using Zod.
4. Controller calls `getShowSeatMap(showId)`.
5. Service loads show + auditorium from DB.
6. Service loads all `showSeat` rows for this show from DB, with seat metadata.
7. Service returns normalized response (`show` + ordered `seats` array).
8. Controller sends `200 OK`.

Output purpose:
- Seat selection screen can render current availability and pricing.

---

### `POST /api/holds`
Flow:

1. Request enters `src/modules/holds/holds.route.ts`.
2. Router sends request to `createHoldController`.
3. Controller validates body using `createHoldSchema`:
   - `showId`
   - `customerEmail`
   - `showSeatIds[]`
4. Controller calls `createHold(input)`.
5. `createHold` checks Redis connection (`checkRedisConnection`).
6. It removes duplicate seat IDs and rejects duplicates if present.
7. It checks show exists and is `SCHEDULED`.
8. It loads requested seats for that show and confirms:
   - all seats exist,
   - all are currently `AVAILABLE`.
9. It loads all seats of the show and runs single-seat-gap validation:
   - `validateSingleSeatGap` -> `hasSingleSeatGapInRow`.
10. It creates a new `holdId` and `expiresAt` (TTL based).
11. It acquires Redis locks (`acquireSeatLocks`) for each seat:
   - `SET key value NX EX`.
   - if one lock fails, already acquired locks are released.
12. It starts DB transaction:
   - updates selected `showSeat.status` from `AVAILABLE` -> `HELD`,
   - creates `hold` row (`ACTIVE`),
   - creates `holdSeat` join rows.
13. On transaction success, service maps output using `mapHold`.
14. Controller sends `201 Created`.
15. If DB fails after locks, it releases Redis locks (`releaseSeatLocks`) and throws error.

Output purpose:
- Guarantees temporary reservation with both DB state + distributed lock.

---

### `GET /api/holds/:holdId`
Flow:

1. Request enters `holds.route.ts`.
2. Router calls `getHoldController`.
3. Controller validates `holdId`.
4. Controller calls `getHoldById(holdId)`.
5. Service loads hold with related seats (`findHoldWithSeats`).
6. If not found -> `404`.
7. Service maps result with `mapHold`.
8. Controller sends `200 OK`.

Output purpose:
- Client can refresh hold state, expiry time, and held seats.

---

### `DELETE /api/holds/:holdId`
Flow:

1. Request enters `holds.route.ts`.
2. Router calls `cancelHoldController`.
3. Controller validates `holdId`.
4. Controller calls `cancelHold(holdId)`.
5. Service checks Redis connection.
6. Service loads hold + seats.
7. If hold is `ACTIVE`, transaction runs:
   - `hold.status` -> `CANCELLED`,
   - related `showSeat.status` (`HELD` -> `AVAILABLE`).
8. Service releases Redis locks for those seats.
9. Service reloads hold and maps via `mapHold`.
10. Controller sends `200 OK`.

Output purpose:
- User can explicitly release held seats before TTL expiry.

---

## Background Hold Expiry Worker

Files:
- `src/workers/hold-expiry.worker.ts`
- started/stopped from `src/server.ts`

Runtime flow:

1. On server start, `startHoldExpiryWorker()` is called.
2. Worker runs immediately once, then on fixed interval (`HOLD_CLEANUP_INTERVAL_MS`).
3. Each cycle calls `expireActiveHoldsBatch()`.
4. Service finds holds where:
   - `status = ACTIVE`
   - `expiresAt <= now`
5. For each expired hold (in transaction):
   - mark hold as `EXPIRED`,
   - release seat statuses from `HELD` -> `AVAILABLE`.
6. After DB success, Redis locks are released.
7. On shutdown signals, `stopHoldExpiryWorker()` clears interval cleanly.

Output purpose:
- Seats are automatically returned to inventory when user abandons checkout.

## Single-Seat-Gap Rule Logic

Files:
- `src/modules/holds/holds.service.ts`
- `src/modules/holds/seat-gap.rule.ts`

How it works:

1. Build row-wise seat view (`seatNumber`, `blocked`).
2. Seat is considered blocked if:
   - already unavailable in DB, or
   - included in current user selection.
3. Detect pattern: `blocked - free - blocked`.
4. If found in any row, throw `422 SINGLE_SEAT_GAP`.

Why:
- Prevents leaving isolated single seats that are hard to sell.

## Error Handling Path

1. Services throw `HttpError` for business errors.
2. Controllers pass errors to `next(error)`.
3. `errorHandler` middleware converts:
   - `HttpError` -> exact status/code/message,
   - unknown errors -> `500 INTERNAL_ERROR`.
4. Unknown routes are handled by `notFoundHandler`.

## Main Files in Step 4

- `src/modules/shows/shows.route.ts`
- `src/modules/shows/shows.controller.ts`
- `src/modules/shows/shows.service.ts`
- `src/modules/holds/holds.route.ts`
- `src/modules/holds/holds.controller.ts`
- `src/modules/holds/holds.service.ts`
- `src/modules/holds/holds.validation.ts`
- `src/modules/holds/seat-gap.rule.ts`
- `src/workers/hold-expiry.worker.ts`
- `src/server.ts`
- `src/app.ts`
- `src/lib/http-error.ts`

## Quick Mental Model

1. **Seat map route** shows current inventory.
2. **Create hold route** performs strict validation + lock + transaction.
3. **Get/cancel hold routes** manage hold lifecycle.
4. **Worker** handles auto-expiry and cleanup.
5. **Middleware** standardizes errors.
