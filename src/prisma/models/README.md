# MDPCare database: beginner guide

This folder holds the **whole database design** as Prisma files.
There is **one PostgreSQL database** with **46 tables**.

```
src/prisma/
├── schema.prisma          ← database connection + client generator (don't add models here)
├── migrations/            ← SQL history. NEVER edit or delete an old migration
└── models/                ← all tables, one area per folder (you are here)
    ├── user/              User, UserRole, Address, FamilyMember, DeviceToken
    ├── 02-auth/           OtpCode (+ ProviderOTP, old and unused)
    ├── 03-catalog/        Category, Service           ← only the ADMIN creates these
    ├── 04-provider/       ProviderProfile, ProviderService, ProviderDocument, ProviderAvailability
    ├── 05-agency/         Agency, AgencyMember, AgencyInvitation, AgencyDocument,
    │                      AgencyService, AgencyStaffService, AgencyAvailability
    ├── 06-booking/        Booking, BookingItem, BookingBroadcastRound, BookingProvider,
    │                      BookingAgency, BookingOTP, BookingStatusHistory, BookingCancellation,
    │                      AgencyBookingAssignment, AgencyAssignmentHistory, Review
    ├── 07-wallet/         ProviderWallet (+ WalletTransaction, WalletPayout)
    │                      AgencyWallet   (+ AgencyWalletTransaction, AgencyWalletPayout)
    ├── 08-payment/        Payment, PaymentWebhookEvent, Refund
    ├── 09-notification/   Notification
    ├── 10-support/        SupportTicket, SupportTicketMessage
    └── 11-admin/          CommissionConfig, PlatformSetting, AuditLog
```

Prisma reads every `.prisma` file in these folders automatically, so the folder names are only for people.
Every model has a `///` comment above it saying what it is for. Hover over a model in VS Code to read it.

## How the main pieces connect

```
User ──┬── ProviderProfile ── ProviderWallet ── WalletTransaction / WalletPayout
       │
       └── AgencyMember (OWNER / MANAGER / STAFF) ── Agency ── AgencyWallet ── AgencyWalletTransaction / AgencyWalletPayout

Category ── Service (price set by admin)
              ├── ProviderService     "this provider does this service"
              └── AgencyService       "this agency does this service"
                    └── AgencyStaffService  "this staff member is trained for it"

Booking (customer = User)
  ├── BookingItem             services + price copied at booking time
  ├── BookingBroadcastRound   search rounds (3 km → 6 km → 10 km ...)
  │     ├── BookingProvider   request sent to an individual provider
  │     └── BookingAgency     request sent to an agency
  ├── providerId  OR  agencyId   (never both: the database blocks it)
  ├── AgencyBookingAssignment + AgencyAssignmentHistory   (agency bookings only)
  ├── BookingOTP              start + completion codes
  ├── BookingStatusHistory / BookingCancellation
  ├── Payment ── PaymentWebhookEvent / Refund
  ├── Review                  one per booking, rating 1–5
  └── Notification / SupportTicket
```

## The rules the database itself enforces

| Rule | How |
|---|---|
| A booking belongs to a provider **or** an agency, never both | CHECK `Booking_single_assignee_chk` |
| Only one current staff member per agency booking | UNIQUE `AgencyBookingAssignment.bookingId` |
| The same gateway webhook can't be processed twice | UNIQUE `PaymentWebhookEvent(gateway, eventId)` |
| A booking settles into a wallet only once | UNIQUE `WalletTransaction.referenceId`, e.g. `booking:42:settlement` |
| One review per booking, rating 1–5 | UNIQUE `Review.bookingId` + CHECK `Review_rating_range_chk` |
| Refund can't be more than the payment | CHECK `Payment_amount_positive_chk` |
| Commission % is between 0 and 100 | CHECK `CommissionConfig_value_positive_chk` |
| Money is never a float | `Decimal(12,2)` / `Decimal(14,2)` (except `Service.price`, see below) |

## Business decisions built into the design

* **Only the admin creates services and sets prices.** `ProviderService.customPrice` and `AgencyService.customPrice` are **not used**. They stay only because deleting a column is a destructive change.
* **One provider app** for providers, agency owners, managers and staff. `DeviceToken.appType` says which app a phone uses.
* **Agency money goes to the AgencyWallet**, never to a staff member's wallet. Only the OWNER can touch the wallet; a MANAGER can accept bookings and assign staff.
* **Prices are copied** into `BookingItem` and the commission into `Booking.platformFee`, so changing a price or commission later never changes old bookings.
* **History tables are add-only**: `BookingStatusHistory`, `AgencyAssignmentHistory`, `WalletTransaction`, `AgencyWalletTransaction`, `AuditLog`. Never update or delete their rows.

## Still waiting for your approval (not changed yet)

| Item | Why it needs approval |
|---|---|
| `Service.price` / `discountPrice` from `Float` to `Decimal(12,2)` | Changes the column type and rounds existing values |
| Delete the old `ProviderOTP` table | Deleting a table is destructive |
| Remove `User.fcmToken` (replaced by `DeviceToken`) | Deleting a column is destructive |
| Remove the unused `customPrice` columns | Deleting a column is destructive |

## How to change the database safely (step by step)

1. **Back up first:**
   `docker exec mdpcare-postgres pg_dump -U niloytalukder -Fc mdpcare_db > mdpcare_$(date +%F).dump`
2. Edit or add a `.prisma` file in the right folder. Add a `///` comment above every new model.
3. Check it: `npm run prisma:validate`
4. Create the migration **without applying it**:
   `npx prisma migrate dev --create-only --name what_you_changed --config prisma.config.ts`
   (use this only on your local dev database; if Prisma asks to **reset**, answer **No** and ask for help)
5. **Open the new `migration.sql` and read it.** If you see `DROP`, `ALTER COLUMN ... TYPE` or `DELETE`, stop: that change can lose data.
6. Apply it: `npm run migrate:deploy`
7. Regenerate the client: `npm run prisma:generate`

Never run `prisma migrate reset`, never `db push` on a real database, and never edit an old migration.
