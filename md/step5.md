# Step 5: Checkout, Booking Confirmation, Discounts, Loyalty

## What Step 5 adds
Step 5 turns a valid seat hold into a confirmed booking and persists all checkout side effects:

1. Ticket + concession pricing at checkout
2. Combo discount application from `ComboRule`
3. Mock payment capture
4. Hold-to-booking conversion
5. Loyalty redeem + earn ledger entries
6. Notification outbox records for email/kitchen

## New routes

### `POST /api/bookings/checkout`
Creates a booking from hold and returns full booking payload.

Body:

```json
{
  "holdId": "cmxxxx",
  "concessions": [
    { "itemCode": "LARGE_POPCORN", "quantity": 1 }
  ],
  "redeemPoints": 10,
  "paymentMethod": "MOCK_CARD",
  "customerPhone": "9999999999"
}
```

Header:
- Optional: `Idempotency-Key`

Response:
- `201` for first successful checkout
- `200` when same hold already converted (replay/idempotent behavior)

### `GET /api/bookings/:bookingId`
Returns booking details including seats, payment, concessions, loyalty entries, and outbox notifications.

### `GET /api/customers/:email/loyalty`
Returns loyalty balance summary and recent ledger entries.

## Workflow: `POST /api/bookings/checkout`

1. Router -> `checkoutBookingController`
2. Controller validates payload (`bookings.validation.ts`)
3. Service checks if booking already exists for hold (idempotent replay)
4. Service loads hold + seats and validates:
   - hold exists
   - hold is `ACTIVE`
   - hold not expired
   - show status is `SCHEDULED`
   - all held seats still `HELD`
5. Service calculates pricing (`pricing.service.ts`):
   - ticket subtotal
   - concession subtotal
   - combo discount
   - loyalty redeem validation
   - payable total
   - earned points
6. Service captures payment (`mock-payment.client.ts`)
   - if payment fails, hold is auto-cancelled so seats are released immediately
7. Transaction starts:
   - mark hold `ACTIVE -> CONVERTED`
   - mark show seats `HELD -> BOOKED`
   - create `Booking`
   - create `BookingSeat` rows
   - create `Payment`
   - create `ConcessionOrder` + `ConcessionItem` rows
   - create `LoyaltyLedger` rows (redeem/earn)
   - create notification outbox rows (`Notification`)
8. Service reads booking with relations and returns mapped payload.

## Discount rule behavior

Combo discount is driven by `ComboRule` rows:
- highest eligible rule is picked for requested concession SKUs
- discount applies on target SKU only
- discounted quantity = `min(targetQty, floor(ticketCount / minTickets))`

Example:
- tickets = 4
- large popcorn qty = 3
- rule = minTickets 2, target `LARGE_POPCORN`, discount 20%
- eligible qty = `min(3, floor(4/2)) = 2`
- 2 popcorns discounted, 1 full price

## Loyalty rule behavior

1. Redeem:
   - must be <= available balance
   - must be <= payable amount before loyalty
2. Redeem value:
   - `redeemPoints * LOYALTY_POINT_VALUE_CENTS`
3. Earn:
   - `floor(payable / (LOYALTY_EARN_PER_CURRENCY_UNIT * LOYALTY_POINT_VALUE_CENTS))`
4. Ledger rows:
   - `REDEEM` entry when points used
   - `EARN` entry when points earned

## Outbox behavior

Outbox events are persisted in `Notification` table:

1. Customer ticket event (`EMAIL`, template `BOOKING_TICKET_PDF_QR`)
2. Kitchen prep event (`SMS`, template `KITCHEN_PREP_TRIGGER`) when concessions exist
   - prep time = `show.intervalAt - 10 minutes`

## Files added in Step 5

- `src/modules/pricing/pricing.service.ts`
- `src/modules/loyalty/loyalty.service.ts`
- `src/modules/payments/mock-payment.client.ts`
- `src/modules/events/outbox.service.ts`
- `src/modules/bookings/bookings.validation.ts`
- `src/modules/bookings/bookings.service.ts`
- `src/modules/bookings/bookings.controller.ts`
- `src/modules/bookings/bookings.route.ts`
- `src/modules/customers/customers.validation.ts`
- `src/modules/customers/customers.service.ts`
- `src/modules/customers/customers.controller.ts`
- `src/modules/customers/customers.route.ts`
- `src/app.ts` (new route wiring)
- `src/config/env.ts` (loyalty env vars)
- `.env.example` (loyalty env vars)
