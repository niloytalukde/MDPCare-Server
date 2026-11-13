// =====================================================================
// STEP 2 - FIND NEARBY PROVIDERS AND AGENCIES (search rounds)
//
// We search in ROUNDS, each round a bit wider:
//
//   round 1 -> within 3 km    (wait BOOKING_ROUND_TIMEOUT_SECONDS)
//   round 2 -> within 6 km    (only people NOT asked in round 1)
//   round 3 -> within 10 km   (only people NOT asked before)
//   nobody accepted -> booking EXPIRED   (done by booking-expiry.worker.ts)
//
// The km values come from the .env setting BOOKING_ROUND_RADII_KM="3,6,10".
//
// Who can receive a request?
//   INDIVIDUAL PROVIDER                      AGENCY
//   - APPROVED and VERIFIED by admin         - APPROVED and VERIFIED by admin
//   - ONLINE                                 - ONLINE
//   - account ACTIVE                         - offers EVERY booked service
//   - offers EVERY booked service            - has at least 1 ACTIVE staff member
//   - inside the round's km AND inside         trained for EVERY booked service
//     their own service radius               - inside the round's km AND its radius
//   - is not the customer                    - the customer is not a member
//   - location updated in the last 15 min
// =====================================================================

import type { Prisma } from "../../generated/prisma/client.js";
import { env } from "../../config/env.js";

type Tx = Prisma.TransactionClient;

// One provider or agency that can get the request
export interface Candidate {
    id: number; // ProviderProfile.id or Agency.id
    userId: number; // who to notify: the provider, or the agency OWNER
    distanceKm: number;
}

// The result of opening one search round
export interface SearchRoundResult {
    round: number;
    radiusKm: number;
    expiresAt: Date;
    providers: Candidate[];
    agencies: Candidate[];
}

interface SearchInput {
    bookingId: number;
    customerUserId: number;
    latitude: number;
    longitude: number;
    radiusKm: number;
    serviceIds: number[];
    limit: number; // max people per round
}

// ---------------------------------------------------------------
// Helper: a square around the customer, used to make the database
// search fast (it can use the latitude/longitude indexes). The exact
// distance is then calculated with the "haversine" formula in SQL.
// ---------------------------------------------------------------

const KM_PER_DEGREE_LATITUDE = 111.32;

const squareAround = (latitude: number, longitude: number, radiusKm: number) => {
    const latitudeDelta = radiusKm / KM_PER_DEGREE_LATITUDE;
    const cosine = Math.max(Math.cos((latitude * Math.PI) / 180), 0.01);
    const longitudeDelta = radiusKm / (KM_PER_DEGREE_LATITUDE * cosine);

    return {
        minLat: latitude - latitudeDelta,
        maxLat: latitude + latitudeDelta,
        minLng: longitude - longitudeDelta,
        maxLng: longitude + longitudeDelta,
    };
};

// ---------------------------------------------------------------
// Find individual providers (nearest first)
// ---------------------------------------------------------------

export const findNearbyProviders = async (tx: Tx, search: SearchInput): Promise<Candidate[]> => {
    const box = squareAround(search.latitude, search.longitude, search.radiusKm);
    const serviceCount = search.serviceIds.length;

    return tx.$queryRaw<Candidate[]>`
        SELECT c.id, c."userId", c.distance AS "distanceKm" FROM (
            SELECT p.id, p."userId", p."serviceRadiusKm",
                   -- distance in km (haversine formula)
                   (6371 * 2 * asin(sqrt(
                        power(sin(radians((p.latitude::float8 - ${search.latitude}::float8) / 2)), 2) +
                        cos(radians(${search.latitude}::float8)) * cos(radians(p.latitude::float8)) *
                        power(sin(radians((p.longitude::float8 - ${search.longitude}::float8) / 2)), 2)
                   )))::float8 AS distance
            FROM "ProviderProfile" p
            JOIN "User" u ON u.id = p."userId"
            WHERE p.status = 'APPROVED'
              AND p."verificationStatus" = 'VERIFIED'
              AND p."availabilityStatus" = 'ONLINE'
              AND p."isAvailable" = true
              AND u."accountStatus" = 'ACTIVE'
              -- location is fresh (the app sends it every 30 s; the database copy is
              -- refreshed every 10 min). Older than PROVIDER_LOCATION_STALE_SECONDS
              -- (default 15 min) = the app has probably stopped, so skip them.
              AND p."locationUpdatedAt" >= now() - make_interval(secs => ${env.PROVIDER_LOCATION_STALE_SECONDS}::int)
              -- not the customer themself
              AND p."userId" <> ${search.customerUserId}
              -- inside the square (fast)
              AND p.latitude  BETWEEN ${box.minLat} AND ${box.maxLat}
              AND p.longitude BETWEEN ${box.minLng} AND ${box.maxLng}
              -- not already asked in an earlier round
              AND NOT EXISTS (
                    SELECT 1 FROM "BookingProvider" bp
                    WHERE bp."bookingId" = ${search.bookingId} AND bp."providerId" = p.id)
              -- offers EVERY booked service
              AND (SELECT count(DISTINCT ps."serviceId") FROM "ProviderService" ps
                   WHERE ps."providerId" = p.id AND ps."isActive" = true
                     AND ps."serviceId" = ANY(${search.serviceIds}::int[])) = ${serviceCount}
        ) c
        WHERE c.distance <= ${search.radiusKm}::float8     -- inside this round
          AND c.distance <= c."serviceRadiusKm"            -- inside the provider's own radius
        ORDER BY c.distance ASC
        LIMIT ${search.limit}`;
};

// ---------------------------------------------------------------
// Find agencies (nearest first). userId = the agency OWNER (to notify)
// ---------------------------------------------------------------

export const findNearbyAgencies = async (tx: Tx, search: SearchInput): Promise<Candidate[]> => {
    const box = squareAround(search.latitude, search.longitude, search.radiusKm);
    const serviceCount = search.serviceIds.length;

    return tx.$queryRaw<Candidate[]>`
        SELECT c.id, c."ownerUserId" AS "userId", c.distance AS "distanceKm" FROM (
            SELECT a.id, a."serviceRadiusKm",
                   -- the agency owner (receives the notification)
                   (SELECT m."userId" FROM "AgencyMember" m
                     WHERE m."agencyId" = a.id AND m.role = 'OWNER' AND m.status = 'ACTIVE'
                     ORDER BY m.id LIMIT 1) AS "ownerUserId",
                   -- distance in km (haversine formula)
                   (6371 * 2 * asin(sqrt(
                        power(sin(radians((a.latitude::float8 - ${search.latitude}::float8) / 2)), 2) +
                        cos(radians(${search.latitude}::float8)) * cos(radians(a.latitude::float8)) *
                        power(sin(radians((a.longitude::float8 - ${search.longitude}::float8) / 2)), 2)
                   )))::float8 AS distance
            FROM "Agency" a
            WHERE a.status = 'APPROVED'
              AND a."verificationStatus" = 'VERIFIED'
              AND a."availabilityStatus" = 'ONLINE'
              -- inside the square (fast)
              AND a.latitude  BETWEEN ${box.minLat} AND ${box.maxLat}
              AND a.longitude BETWEEN ${box.minLng} AND ${box.maxLng}
              -- not already asked in an earlier round
              AND NOT EXISTS (
                    SELECT 1 FROM "BookingAgency" ba
                    WHERE ba."bookingId" = ${search.bookingId} AND ba."agencyId" = a.id)
              -- the customer is not a member of this agency
              AND NOT EXISTS (
                    SELECT 1 FROM "AgencyMember" cm
                    WHERE cm."agencyId" = a.id AND cm."userId" = ${search.customerUserId}
                      AND cm.status IN ('ACTIVE', 'INVITED'))
              -- offers EVERY booked service
              AND (SELECT count(DISTINCT asv."serviceId") FROM "AgencyService" asv
                   WHERE asv."agencyId" = a.id AND asv."isActive" = true
                     AND asv."serviceId" = ANY(${search.serviceIds}::int[])) = ${serviceCount}
              -- has at least 1 active staff member trained for EVERY booked service
              -- (otherwise it could accept the job but never send anyone)
              AND EXISTS (
                    SELECT 1 FROM "AgencyMember" sm
                    JOIN "User" su ON su.id = sm."userId" AND su."accountStatus" = 'ACTIVE'
                    WHERE sm."agencyId" = a.id AND sm.status = 'ACTIVE'
                      AND (SELECT count(DISTINCT ss."serviceId") FROM "AgencyStaffService" ss
                           WHERE ss."agencyMemberId" = sm.id AND ss."isActive" = true
                             AND ss."serviceId" = ANY(${search.serviceIds}::int[])) = ${serviceCount})
        ) c
        WHERE c.distance <= ${search.radiusKm}::float8     -- inside this round
          AND c.distance <= c."serviceRadiusKm"            -- inside the agency's own radius
          AND c."ownerUserId" IS NOT NULL
        ORDER BY c.distance ASC
        LIMIT ${search.limit}`;
};

// ---------------------------------------------------------------
// Open a search round
//
// Saves the round, saves one request row per provider / agency found,
// and remembers on the booking which round we are in.
// Must be called INSIDE the caller's transaction.
// ---------------------------------------------------------------

export const openSearchRound = async (
    tx: Tx,
    booking: {
        id: number;
        userId: number;
        latitude: Prisma.Decimal;
        longitude: Prisma.Decimal;
        serviceIds: number[];
    },
    roundNumber: number, // 1, 2, 3 ...
    now = new Date()
): Promise<SearchRoundResult> => {
    // ---- which distance for this round? ----
    const allRadii = env.BOOKING_ROUND_RADII_KM; // e.g. [3, 6, 10]
    const radiusKm = allRadii[Math.min(roundNumber, allRadii.length) - 1] as number;
    const previousRadiusKm = roundNumber > 1 ? (allRadii[roundNumber - 2] as number) : 0;
    const expiresAt = new Date(now.getTime() + env.BOOKING_ROUND_TIMEOUT_SECONDS * 1000);

    // ---- find people ----
    const search: SearchInput = {
        bookingId: booking.id,
        customerUserId: booking.userId,
        latitude: Number(booking.latitude),
        longitude: Number(booking.longitude),
        radiusKm,
        serviceIds: booking.serviceIds,
        limit: env.BOOKING_MAX_CANDIDATES_PER_ROUND,
    };

    const providers = await findNearbyProviders(tx, search);
    const agencies = await findNearbyAgencies(tx, search);
    const foundCount = providers.length + agencies.length;

    // ---- save the round ----
    // (the unique (bookingId, round) rule stops the same round being opened twice)
    await tx.bookingBroadcastRound.create({
        data: {
            bookingId: booking.id,
            round: roundNumber,
            radiusKm: Math.ceil(radiusKm),
            minRadiusKm: Math.floor(previousRadiusKm),
            status: "SEARCHING",
            startedAt: now,
            expiresAt,
            providersFound: foundCount,
            providersSent: foundCount,
        },
    });

    // ---- save one request per provider ----
    if (providers.length > 0) {
        await tx.bookingProvider.createMany({
            data: providers.map((provider) => ({
                bookingId: booking.id,
                providerId: provider.id,
                searchRound: roundNumber,
                distanceKm: provider.distanceKm.toFixed(3),
                status: "SENT" as const,
                sentAt: now,
            })),
            skipDuplicates: true,
        });
    }

    // ---- save one request per agency ----
    if (agencies.length > 0) {
        await tx.bookingAgency.createMany({
            data: agencies.map((agency) => ({
                bookingId: booking.id,
                agencyId: agency.id,
                searchRound: roundNumber,
                distanceKm: agency.distanceKm.toFixed(3),
                status: "SENT" as const,
                sentAt: now,
            })),
            skipDuplicates: true,
        });
    }

    // ---- remember the round on the booking ----
    await tx.booking.update({
        where: { id: booking.id },
        data: {
            broadcastRound: roundNumber,
            searchRadius: Math.ceil(radiusKm),
            ...(roundNumber === 1 && { broadcastStartedAt: now }),
            // the booking "expires" when this round ends (the worker then opens the next round)
            expiresAt,
        },
    });

    return { round: roundNumber, radiusKm, expiresAt, providers, agencies };
};

// True if there is no wider round after this one
export const isLastRound = (roundNumber: number) => roundNumber >= env.BOOKING_ROUND_RADII_KM.length;
