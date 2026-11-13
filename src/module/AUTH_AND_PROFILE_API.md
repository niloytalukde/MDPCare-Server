# Login, registration and profiles: API guide

Base URL: `/api/v1`. Phone numbers are always in E.164 format: `+919812345678`.
Send the access token as a header: `Authorization: Bearer <accessToken>`.

## Where the code is

```
src/module/
├── Auth/                         login code shared by BOTH apps
│   ├── phone-login.service.ts    send OTP, verify OTP, refresh, logout  ← the heart of login
│   ├── personal-details.ts       name, email, gender, dateOfBirth, photo (rules + helpers)
│   ├── account-rules.ts          "can one person be provider AND agency?" (one switch)
│   └── auth.*.ts                 customer app login routes (/auth)
├── customer/                     customer profile (/customer/profile)
├── Provider/
│   ├── Auth/                     provider app login (/provider/auth)
│   └── profile/                  individual provider register + profile (/provider)
└── agency/
    └── profile/                  agency register + profile (/agencies)
```

Every module folder has the same 4 files:
`*.route.ts` (URLs) → `*.controller.ts` (reads the request, sends the reply) → `*.service.ts` (business logic and database) + `*.validation.ts` (what the body must look like).

## Where each piece of data is saved

| Data | Table |
|---|---|
| name, email, gender, dateOfBirth, profileImageUrl | `User` (same for everyone) |
| profession, bio, experience, address, city, state, pincode, radius | `ProviderProfile` |
| agency name, phone, address, GPS, GST, PAN, logo ... | `Agency` |
| who is OWNER / MANAGER / STAFF of an agency | `AgencyMember` |

---

## 1. Customer app

| | Method + URL | Body |
|---|---|---|
| Send OTP | `POST /auth/send-otp` | `{ "phone": "+919812345678" }` |
| Login / register | `POST /auth/verify-otp` | `{ "phone": "+919812345678", "code": "123456" }` |
| New tokens | `POST /auth/refresh-token` | `{ "refreshToken": "..." }` |
| Logout | `POST /auth/logout` | none |
| My profile | `GET /customer/profile` | none |
| Update profile | `PATCH /customer/profile` | any of `name, email, gender, dateOfBirth, profileImageUrl` |

The first `verify-otp` for a new phone **is the registration**. If the reply has `needsProfileCompletion: true`, show the "enter your name" screen and call `PATCH /customer/profile`.

```json
PATCH /customer/profile
{ "name": "Riya Sen", "email": "riya@example.com", "gender": "FEMALE", "dateOfBirth": "1996-04-12" }
```
`gender` is one of `MALE, FEMALE, OTHER, PREFER_NOT_TO_SAY`. `dateOfBirth` is `YYYY-MM-DD`.
(`GET /auth/me` and `PATCH /auth/profile` still work and do the same thing.)

## 2. Provider app (individual providers AND agencies)

Login is the same for everyone in this app:

| | Method + URL | Body |
|---|---|---|
| Send OTP | `POST /provider/auth/send-otp` | `{ "phone": "..." }` |
| Login / register | `POST /provider/auth/verify-otp` | `{ "phone": "...", "code": "..." }` |
| New tokens | `POST /provider/auth/refresh-token` | `{ "refreshToken": "..." }` |
| Logout | `POST /provider/auth/logout` | none |
| Who am I | `GET /provider/auth/me` | none |
| Update my personal details | `PATCH /provider/auth/me` | any of `name, email, gender, dateOfBirth, profileImageUrl` |

After `verify-otp` (and in `GET /provider/auth/me`), open the screen given by `account.nextStep`:

| `nextStep` | Show |
|---|---|
| `CHOOSE_ACCOUNT_TYPE` | Two buttons: **Register as individual** (2a) or **Create an agency** (2b) |
| `ACCEPT_AGENCY_INVITE` | The agency invite in `account.pendingInvites` |
| `PROVIDER_HOME` | Individual provider home |
| `AGENCY_HOME` | Agency home; `account.agencies[].myRole` says OWNER / MANAGER / STAFF |

### 2a. Individual provider

| | Method + URL |
|---|---|
| Register | `POST /provider/register` |
| My profile | `GET /provider/profile` |
| Update profile | `PATCH /provider/profile` (send only what changes) |

```json
POST /provider/register
{
  "name": "Amit Das", "email": "amit@example.com", "gender": "MALE", "dateOfBirth": "1990-01-15",
  "profession": "Nurse", "experienceYears": 6,
  "address": "12 Park Street", "city": "Kolkata", "state": "West Bengal", "pincode": "700016"
}
```
Required: `name, profession, city, state, pincode`. The new profile is `PENDING` until the admin approves it.
The reply has `personal`, `work`, `stats` and a `nextSteps` checklist (upload documents, select services).

### 2b. Agency

| | Method + URL | Who |
|---|---|---|
| Register agency | `POST /agencies` | anyone logged in to the provider app |
| My agencies | `GET /agencies/mine` | members |
| Agency profile | `GET /agencies/:agencyId/profile` | OWNER, MANAGER, STAFF |
| Update agency profile | `PATCH /agencies/:agencyId/profile` | OWNER only |

```json
POST /agencies
{
  "ownerName": "Sourav Ghosh",
  "name": "Sunrise Care Services", "phone": "+913340001234", "email": "info@sunrise.example",
  "city": "Kolkata", "state": "West Bengal", "pincode": "700091",
  "latitude": 22.5726, "longitude": 88.3639,
  "gstNumber": "19ABCDE1234F1Z5", "panNumber": "ABCDE1234F"
}
```
Required: `name, phone, city, state, pincode, latitude, longitude`.
`legalName, registrationNumber, gstNumber, panNumber` can only be changed **before** the admin approves the agency (`canEditLegalDetails` in the reply).

## Rules you will see as errors

| Status | When |
|---|---|
| 400 | A field is missing or in the wrong format (the message says which) |
| 401 | No token, expired token, or logged out |
| 403 | Account blocked, or legal details changed after approval |
| 404 | Profile not created yet, or not a member of that agency |
| 409 | Already registered, or trying to be individual provider AND agency (see `Auth/account-rules.ts`) |

---

## 3. Online / offline and live location

### Individual provider

| | Method + URL | Body |
|---|---|---|
| Go online | `POST /provider/online` | `{ "latitude": 22.5726, "longitude": 88.3639 }` (admin approval needed) |
| Go offline | `POST /provider/offline` | none |
| Send location | `POST /provider/location` | `{ "latitude": ..., "longitude": ... }` **every 30 seconds while online** |
| My last location | `GET /provider/location` | none |

How the location is stored (`src/module/Provider/location/`):
- Every update goes to **Redis** (key `provider:location:<providerId>`, deletes itself after 1 hour without updates).
- It is copied to the **database** only when 10 minutes have passed since the last copy (`PROVIDER_LOCATION_DB_SAVE_SECONDS=600`). The reply says `savedToDatabase: true/false`.
- Going online saves the location to the database straight away; going offline copies the latest Redis location to the database and clears Redis.
- Booking search skips providers whose saved location is older than 15 minutes (`PROVIDER_LOCATION_STALE_SECONDS=900`).
- Max 6 location calls per minute per provider (more → `429`).
- Without `REDIS_URL` (local development only) a normal in-memory Map is used.

### Agency

| | Method + URL | Who |
|---|---|---|
| Go online | `POST /agencies/:agencyId/online` | OWNER or MANAGER (agency must be approved) |
| Go offline | `POST /agencies/:agencyId/offline` | OWNER or MANAGER |

An agency's location is its office address from the agency profile, so it is not sent every 30 seconds.
