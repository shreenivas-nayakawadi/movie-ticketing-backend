# Step 2 - Local Infrastructure and Readiness

## Goal
Run required local services and make the app dependency-aware at startup.

## What Was Implemented
1. Docker stack added under `infra/`:
- PostgreSQL
- Redis
- Temporal
- Temporal UI
2. Postgres bootstrap SQL added at `infra/postgres/init/01-init.sql`.
3. New env vars added:
- `DATABASE_URL`
- `REDIS_URL`
- `TEMPORAL_ADDRESS`
- `TEMPORAL_NAMESPACE`
4. Infrastructure client modules created:
- `src/lib/postgres.ts`
- `src/lib/redis.ts`
- `src/lib/temporal.ts`
5. Startup infra bootstrap created:
- `src/bootstrap.ts`
6. App startup updated to verify dependencies before listening:
- `src/server.ts`
7. Readiness endpoint added:
- `GET /api/ready` (checks Postgres, Redis, Temporal)
8. Infra scripts added in `package.json`:
- `infra:up`
- `infra:down`
- `infra:reset`
- `infra:logs`

## Key Behavior Added
1. App logs successful connections to Postgres, Redis, and Temporal.
2. `GET /api/ready` returns dependency status and `200` only when all are reachable.

## Issues Fixed During Step
1. Temporal DB driver fixed (`DB=postgres12`).
2. Temporal dynamic config path fixed.
3. Missing `POSTGRES_SEEDS` env for Temporal fixed.

## Validation Done
1. Containers came up successfully.
2. Temporal `7233` port reachable.
3. `GET /api/ready` returned:
- `postgres: up`
- `redis: up`
- `temporal: up`

