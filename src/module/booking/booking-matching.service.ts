import type { Prisma } from "../../generated/prisma/client.js";
import { env } from "../../config/env.js";

type Tx = Prisma.TransactionClient;

/**
 * Candidate search + broadcast rounds.
 *
 * Eligibility (business decision Q8: APPROVED + VERIFIED):
 *   Provider: status APPROVED, verificationStatus VERIFIED, ONLINE, isAvailable,
 *             user ACTIVE, offers EVERY booked service (active), within both the
 *             round radius and its own serviceRadiusKm, not the customer themself.
 *   Agency:   status APPROVED, verificationStatus VERIFIED, ONLINE, offers EVERY
 *             booked service (active), within round radius and serviceRadiusKm,
 *             customer is not a member, and has >= 1 ACTIVE member qualified for
 *             every booked service (otherwise it could accept but never staff the job).
 *
 * Candidates already requested in an earlier round are skipped, so each round only
 * reaches *new* providers/agencies; earlier requests stay open until the booking is
 * accepted, cancelled or expires.
 *
 * Distance: haversine in SQL, with a lat/lng bounding-box prefilter so the existing
 * (latitude, longitude) B-tree indexes can be used (DB-16; PostGIS recommended at scale).
 */

const KM_PER_DEG_LAT = 111.32;

const bbox = (lat: number, lng: number, radiusKm: number) => {
    const dLat = radiusKm / KM_PER_DEG_LAT;
    const cos = Math.max(Math.cos((lat * Math.PI) / 180), 0.01);
    const dLng = radiusKm / (KM_PER_DEG_LAT * cos);
    return { minLat: lat - dLat, maxLat: lat + dLat, minLng: lng - dLng, maxLng: lng + dLng };
};

export interface Candidate {
    id: number;
    userId: number; // provider's user, or agency OWNER user(s) are resolved separately
    distanceKm: number;
}

interface SearchInput {
    bookingId: number;
    customerUserId: number;
    latitude: number;
    longitude: number;
    radiusKm: number;
    serviceIds: number[];
    limit: number;
}

export const findProviderCandidates = async (tx: Tx, s: SearchInput): Promise<Candidate[]> => {
    const b = bbox(s.latitude, s.longitude, s.radiusKm);
    const n = s.serviceIds.length;

    return tx.$queryRaw<Candidate[]>`
        SELECT c.id, c."userId", c.distance AS "distanceKm" FROM (
            SELECT p.id, p."userId", p."serviceRadiusKm",
                   (6371 * 2 * asin(sqrt(
                        power(sin(radians((p.latitude::float8 - ${s.latitude}::float8) / 2)), 2) +
                        cos(radians(${s.latitude}::float8)) * cos(radians(p.latitude::float8)) *
                        power(sin(radians((p.longitude::float8 - ${s.longitude}::float8) / 2)), 2)
                   )))::float8 AS distance
            FROM "ProviderProfile" p
            JOIN "User" u ON u.id = p."userId"
            WHERE p.status = 'APPROVED'
              AND p."verificationStatus" = 'VERIFIED'
              AND p."availabilityStatus" = 'ONLINE'
              AND p."isAvailable" = true
              AND u."accountStatus" = 'ACTIVE'
              AND p."userId" <> ${s.customerUserId}
              AND p.latitude  BETWEEN ${b.minLat} AND ${b.maxLat}
              AND p.longitude BETWEEN ${b.minLng} AND ${b.maxLng}
              AND NOT EXISTS (
                    SELECT 1 FROM "BookingProvider" bp
                    WHERE bp."bookingId" = ${s.bookingId} AND bp."providerId" = p.id)
              AND (SELECT count(DISTINCT ps."serviceId") FROM "ProviderService" ps
                   WHERE ps."providerId" = p.id AND ps."isActive" = true
                     AND ps."serviceId" = ANY(${s.serviceIds}::int[])) = ${n}
        ) c
        WHERE c.distance <= ${s.radiusKm}::float8
          AND c.distance <= c."serviceRadiusKm"
        ORDER BY c.distance ASC
        LIMIT ${s.limit}`;
};

export const findAgencyCandidates = async (tx: Tx, s: SearchInput): Promise<Candidate[]> => {
    const b = bbox(s.latitude, s.longitude, s.radiusKm);
    const n = s.serviceIds.length;

    // userId here = the agency OWNER's user id (for notifications)
    return tx.$queryRaw<Candidate[]>`
        SELECT c.id, c."ownerUserId" AS "userId", c.distance AS "distanceKm" FROM (
            SELECT a.id, a."serviceRadiusKm",
                   (SELECT m."userId" FROM "AgencyMember" m
                     WHERE m."agencyId" = a.id AND m.role = 'OWNER' AND m.status = 'ACTIVE'
                     ORDER BY m.id LIMIT 1) AS "ownerUserId",
                   (6371 * 2 * asin(sqrt(
                        power(sin(radians((a.latitude::float8 - ${s.latitude}::float8) / 2)), 2) +
                        cos(radians(${s.latitude}::float8)) * cos(radians(a.latitude::float8)) *
                        power(sin(radians((a.longitude::float8 - ${s.longitude}::float8) / 2)), 2)
                   )))::float8 AS distance
            FROM "Agency" a
            WHERE a.status = 'APPROVED'
              AND a."verificationStatus" = 'VERIFIED'
              AND a."availabilityStatus" = 'ONLINE'
              AND a.latitude  BETWEEN ${b.minLat} AND ${b.maxLat}
              AND a.longitude BETWEEN ${b.minLng} AND ${b.maxLng}
              AND NOT EXISTS (
                    SELECT 1 FROM "BookingAgency" ba
                    WHERE ba."bookingId" = ${s.bookingId} AND ba."agencyId" = a.id)
              AND NOT EXISTS (
                    SELECT 1 FROM "AgencyMember" cm
                    WHERE cm."agencyId" = a.id AND cm."userId" = ${s.customerUserId}
                      AND cm.status IN ('ACTIVE', 'INVITED'))
              AND (SELECT count(DISTINCT asv."serviceId") FROM "AgencyService" asv
                   WHERE asv."agencyId" = a.id AND asv."isActive" = true
                     AND asv."serviceId" = ANY(${s.serviceIds}::int[])) = ${n}
              AND EXISTS (
                    SELECT 1 FROM "AgencyMember" sm
                    JOIN "User" su ON su.id = sm."userId" AND su."accountStatus" = 'ACTIVE'
                    WHERE sm."agencyId" = a.id AND sm.status = 'ACTIVE'
                      AND (SELECT count(DISTINCT ss."serviceId") FROM "AgencyStaffService" ss
                           WHERE ss."agencyMemberId" = sm.id AND ss."isActive" = true
                             AND ss."serviceId" = ANY(${s.serviceIds}::int[])) = ${n})
        ) c
        WHERE c.distance <= ${s.radiusKm}::float8
          AND c.distance <= c."serviceRadiusKm"
          AND c."ownerUserId" IS NOT NULL
        ORDER BY c.distance ASC
        LIMIT ${s.limit}`;
};

export interface BroadcastResult {
    round: number;
    radiusKm: number;
    expiresAt: Date;
    providers: Candidate[];
    agencies: Candidate[];
}

/**
 * Opens round `round` (1-based) for a booking: inserts the round row and one
 * request row per new candidate. Must run inside the caller's transaction.
 * The (bookingId, round) unique index makes a duplicate open fail loudly.
 */
export const openBroadcastRound = async (
    tx: Tx,
    booking: { id: number; userId: number; latitude: Prisma.Decimal; longitude: Prisma.Decimal; serviceIds: number[] },
    round: number,
    now = new Date()
): Promise<BroadcastResult> => {
    const radii = env.BOOKING_ROUND_RADII_KM;
    const radiusKm = radii[Math.min(round, radii.length) - 1] as number;
    const minRadiusKm = round > 1 ? (radii[round - 2] as number) : 0;
    const expiresAt = new Date(now.getTime() + env.BOOKING_ROUND_TIMEOUT_SECONDS * 1000);

    const search: SearchInput = {
        bookingId: booking.id,
        customerUserId: booking.userId,
        latitude: Number(booking.latitude),
        longitude: Number(booking.longitude),
        radiusKm,
        serviceIds: booking.serviceIds,
        limit: env.BOOKING_MAX_CANDIDATES_PER_ROUND,
    };

    const [providers, agencies] = [
        await findProviderCandidates(tx, search),
        await findAgencyCandidates(tx, search),
    ];

    await tx.bookingBroadcastRound.create({
        data: {
            bookingId: booking.id,
            round,
            radiusKm: Math.ceil(radiusKm),
            minRadiusKm: Math.floor(minRadiusKm),
            status: "SEARCHING",
            startedAt: now,
            expiresAt,
            providersFound: providers.length + agencies.length,
            providersSent: providers.length + agencies.length,
        },
    });

    if (providers.length) {
        await tx.bookingProvider.createMany({
            data: providers.map((p) => ({
                bookingId: booking.id,
                providerId: p.id,
                searchRound: round,
                distanceKm: p.distanceKm.toFixed(3),
                status: "SENT" as const,
                sentAt: now,
            })),
            skipDuplicates: true,
        });
    }

    if (agencies.length) {
        await tx.bookingAgency.createMany({
            data: agencies.map((a) => ({
                bookingId: booking.id,
                agencyId: a.id,
                searchRound: round,
                distanceKm: a.distanceKm.toFixed(3),
                status: "SENT" as const,
                sentAt: now,
            })),
            skipDuplicates: true,
        });
    }

    await tx.booking.update({
        where: { id: booking.id },
        data: {
            broadcastRound: round,
            searchRadius: Math.ceil(radiusKm),
            ...(round === 1 && { broadcastStartedAt: now }),
            // Booking-level expiry = end of the final round (worker advances rounds)
            expiresAt,
        },
    });

    return { round, radiusKm, expiresAt, providers, agencies };
};

export const isFinalRound = (round: number) => round >= env.BOOKING_ROUND_RADII_KM.length;
