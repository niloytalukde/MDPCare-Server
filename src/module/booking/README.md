# Booking module: how a booking works

## The journey of one booking

```
 CUSTOMER                    SYSTEM                         PROVIDER / AGENCY
 ────────                    ──────                         ─────────────────
 1. creates booking  ──►  status PENDING
                          price is copied
                          search round 1 (3 km)  ──────►  "booking:request" notification
                          status SEARCHING_PROVIDER
                                 │
                 nobody accepts? │ every few seconds the worker
                                 │ opens round 2 (6 km), round 3 (10 km)
                                 │ still nobody → status EXPIRED
                                 ▼
                                                    2. ONE provider or agency accepts
                          status CONFIRMED  ◄─────────  (first one wins, others get 409)

                                                    3. AGENCY only: owner assigns staff,
                                                       staff accepts the assignment

                                                    4. worker presses "Start"
                          status IN_PROGRESS ◄───────
 5. asks for completion code (6 digits)
    and tells it to the worker  ─────────────────────► 6. worker enters the code
                          status COMPLETED
                          money → provider wallet OR agency wallet (only once)
```

The customer can **cancel** until the job starts (`PENDING`, `SEARCHING_PROVIDER`, `CONFIRMED`). An admin can also cancel an `IN_PROGRESS` job.

## Files: read them in this order

| # | File | What it does |
|---|---|---|
| | `booking.route.ts` | All URLs, with a list at the top |
| | `booking.controller.ts` | One small function per URL: read request → call service → reply |
| | `booking.validation.ts` | What each request body must look like (with examples) |
| | `booking.constants.ts` | Status groups and limits, all in one place |
| 1 | `booking-create.service.ts` | Customer creates a booking |
| | `booking-price.ts` | Price maths (no database) |
| 2 | `booking-matching.service.ts` | Find nearby providers / agencies, open search rounds |
| 3 | `booking-accept.service.ts` | Accept / reject, "only one can win" |
| 4 | `booking-work.service.ts` | Start, completion code, complete + wallet |
| | `booking-cancel.service.ts` | Cancel |
| | `booking-view.service.ts` | Who can see which booking; booking lists |
| | `booking-expiry.worker.ts` | Background job: next round, or EXPIRED |
| | `booking-history.ts` | Saves every status change (the booking timeline) |
| | `booking.notify.ts` | Live notifications to the apps |
| | `booking.service.ts` | Index: re-exports everything for other modules |

Agency steps (accept as agency, assign staff, staff start/complete) have their URLs in `agency/agency.route.ts`, but they call the same functions from this folder.

## The safety rules (and where they live)

| Rule | How it is guaranteed |
|---|---|
| Only one provider/agency can accept | One conditional `UPDATE ... WHERE status = 'SEARCHING_PROVIDER' AND providerId IS NULL AND agencyId IS NULL` (`booking-accept.service.ts`) + database CHECK rule |
| A status can only move forward correctly | Every status change uses `updateMany({ where: { status: <the allowed old status> } })`; 0 rows changed = 409 error |
| The completion code can't be guessed or reused | Only a hash is stored, max 5 wrong tries, marked used in the same transaction as COMPLETED |
| Money is paid into a wallet only once | `settleBooking` runs inside the COMPLETED transaction, with a unique reference per booking |
| Old bookings keep their price | Prices are copied into `BookingItem` when the booking is created |
| Strangers can't see a booking | `booking-view.service.ts` returns 404 to anyone not involved |
| Candidates don't see the customer's details | Name, phone and address are hidden until they accept |

## Settings (in `.env`)

| Setting | Default | Meaning |
|---|---|---|
| `BOOKING_ROUND_RADII_KM` | `3,6,10` | km for round 1, 2, 3 |
| `BOOKING_ROUND_TIMEOUT_SECONDS` | `60` | how long each round waits |
| `BOOKING_MAX_CANDIDATES_PER_ROUND` | `25` | max people asked per round |
| `BOOKING_SWEEP_INTERVAL_SECONDS` | `10` | how often the expiry worker runs |
| `BOOKING_COMPLETION_OTP_TTL_MINUTES` | `240` | how long a completion code works |
