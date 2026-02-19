# Step 6: Async Delivery, Kitchen Timing, Show Cancellation, Refund Orchestration

## What was implemented
Step 6 extends the backend with production-style asynchronous processing:

1. Notification outbox dispatcher with retry and backoff.
2. Ticket email delivery artifact generation (ticket payload + attachment).
3. Kitchen prep trigger handling for concession orders.
4. Admin show cancellation flow with SMS queueing and conditional refund jobs.
5. Refund processing worker with retry and status transitions.
6. Temporal scheduling hook for kitchen prep workflow.

## Schema changes

### Notification
Added retry metadata fields:
- `attempts`
- `maxAttempts`
- `nextAttemptAt`
- `lastError`

Added index:
- `(status, nextAttemptAt, createdAt)`

### RefundJob
Added retry metadata fields:
- `attempts`
- `maxAttempts`
- `nextAttemptAt`

Added index:
- `(status, nextAttemptAt, createdAt)`

Migration:
- `prisma/migrations/20260219103000_step6_async_retries/migration.sql`

## New configuration
Added env variables in `src/config/env.ts` and `.env.example`:

- `TEMPORAL_TASK_QUEUE`
- `TEMPORAL_KITCHEN_WORKFLOW_ENABLED`
- `OUTBOX_POLL_INTERVAL_MS`
- `REFUND_POLL_INTERVAL_MS`
- `SENDGRID_API_KEY`
- `SENDGRID_FROM_EMAIL`
- `SMS_GATEWAY_URL`
- `SMS_GATEWAY_API_KEY`
- `REFUND_GATEWAY_URL`
- `REFUND_GATEWAY_API_KEY`

## New integrations

### Email
- `src/integrations/email/sendgrid.client.ts`
- Uses SendGrid API if keys are configured.
- Uses mock success fallback when env is not configured.

### SMS
- `src/integrations/sms/sms.client.ts`
- Uses configured SMS gateway URL.
- Uses mock success fallback when env is not configured.

### Refund
- `src/integrations/refund/refund.client.ts`
- Calls refund gateway API.
- Uses mock success fallback when env is not configured.

## Ticket generation module
- `src/modules/tickets/ticket.service.ts`

Responsibilities:
1. Build deterministic QR payload for ticket scan.
2. Build ticket attachment content.
3. Build email subject/body + attachment base64 payload.

## Outbox processing

### New service
- `src/modules/events/outbox-dispatcher.service.ts`

Processing logic:
1. Picks pending notifications where `nextAttemptAt <= now` (or null).
2. Dispatches by template:
   - `BOOKING_TICKET_PDF_QR` -> send email with ticket attachment.
   - `SHOW_CANCELLED_SMS` -> send SMS to customer.
   - `KITCHEN_PREP_TRIGGER` -> mark concession order `PREPARING` when due.
3. On success: marks row `SENT`.
4. On failure: increments attempts and reschedules with exponential backoff.
5. After max attempts: marks row `FAILED`.

### New worker
- `src/workers/outbox.worker.ts`
- Polls outbox every `OUTBOX_POLL_INTERVAL_MS`.

## Refund processing

### New service
- `src/modules/refunds/refund-processor.service.ts`

Logic:
1. Picks pending refund jobs where due.
2. Calls refund integration.
3. On success:
   - `RefundJob -> PROCESSED`
   - `Booking -> REFUNDED`
   - `Payment -> REFUNDED`
4. On failure:
   - retries with backoff
   - marks `FAILED` after max attempts

### New worker
- `src/workers/refund.worker.ts`
- Polls refund jobs every `REFUND_POLL_INTERVAL_MS`.

## Temporal kitchen orchestration hook

Files:
- `src/temporal/kitchen.scheduler.ts`
- `src/temporal/workflows/kitchen-prep.workflow.ts`
- `src/temporal/activities/kitchen.activities.ts`
- `src/temporal/worker.ts` (entry placeholder)

Behavior:
1. After checkout creates booking with concessions, backend tries to schedule workflow:
   - workflow id: `kitchen-prep-{bookingId}`
2. Scheduling is non-blocking and guarded by env flag.
3. Kitchen prep status change is handled safely through activity/outbox flow.

## Admin show cancellation API

### New route
- `POST /api/admin/shows/:showId/cancel`

Files:
- `src/modules/admin/shows/admin-shows.route.ts`
- `src/modules/admin/shows/admin-shows.controller.ts`
- `src/modules/admin/shows/admin-shows.service.ts`
- `src/modules/admin/shows/admin-shows.validation.ts`

Request body:
```json
{
  "reason": "Technical issue"
}
```

Flow:
1. Validate input.
2. Mark show `CANCELLED` (idempotent).
3. Load confirmed bookings.
4. Queue `SHOW_CANCELLED_SMS` notifications.
5. If sold tickets > 200, queue refund jobs for each booking.
6. Return summary counts.

## Existing flow updated

### Checkout flow
- `src/modules/bookings/bookings.service.ts` now:
1. Creates outbox rows for email + kitchen trigger.
2. Attempts to schedule kitchen prep workflow in Temporal when concessions exist.
3. Continues checkout even if Temporal scheduling fails (logged as non-fatal).

## App and worker wiring

### Updated API route wiring
- `src/app.ts`
  - added `adminShowsRouter`.

### Updated server runtime
- `src/server.ts`
  - starts/stops:
    - hold expiry worker
    - outbox worker
    - refund worker

### Added standalone worker entries
- `src/workers/outbox.entry.ts`
- `src/workers/refund.entry.ts`

### Added npm scripts
- `worker:outbox`
- `worker:refund`
- `worker:temporal`

## Operational flow summary

1. Checkout confirms booking.
2. Outbox rows are created.
3. Outbox worker sends ticket email and handles kitchen prep timing.
4. Admin cancels show:
   - SMS rows queued
   - refund jobs queued if tickets > 200
5. Refund worker processes refund jobs until completion.

## Validation result
All checks pass after Step 6 changes:

- `npm run db:generate`
- `npm run typecheck`
- `npm run lint`
