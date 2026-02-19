# Step 3 - Database Schema, Migration, and Seed

## Goal
Introduce a production-structured database model with Prisma and make schema changes repeatable.

## What Was Implemented
1. Prisma dependencies added:
- `@prisma/client`
- `prisma`
2. Prisma scripts added in `package.json`:
- `db:generate`
- `db:migrate`
- `db:deploy`
- `db:seed`
- `db:studio`
3. Prisma schema created:
- `prisma/schema.prisma`
4. Initial migration generated and applied:
- `prisma/migrations/20260218181532_init_schema/migration.sql`
- `prisma/migrations/migration_lock.toml`
5. Seed script created:
- `prisma/seed.ts`
6. Shared Prisma client module added:
- `src/lib/prisma.ts`
7. Postgres health check moved to Prisma:
- `src/lib/postgres.ts`
8. Postgres init updated for migration compatibility:
- user `movie_app` granted `CREATEDB` in `infra/postgres/init/01-init.sql`

## Database Coverage Added
1. Theater and seat model:
- `Auditorium`, `Seat`, `Show`, `ShowSeat`
2. Booking and payment model:
- `Hold`, `HoldSeat`, `Booking`, `BookingSeat`, `Payment`
3. Concession model:
- `ConcessionOrder`, `ConcessionItem`, `ComboRule`
4. Customer ops model:
- `LoyaltyLedger`, `Notification`, `RefundJob`
5. Enums for all key status lifecycles (show, hold, booking, payment, refund, etc.).
6. Indexes and unique constraints for seat consistency, idempotency, and query performance.

## Seed Data Added
1. `Audi 1` auditorium.
2. 60 seats (`A1` to `F10`).
3. One scheduled demo show.
4. Show-seat price map.
5. Combo rule: `TWO_TICKETS_POPCORN_20`.

## Validation Done
1. `npx prisma validate` passed.
2. `npx prisma migrate dev --name init_schema` applied successfully.
3. `npm run db:seed` completed.
4. `npm run typecheck` passed.
5. `npm run lint` passed.

