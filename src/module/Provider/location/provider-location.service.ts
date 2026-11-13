// =====================================================================
// PROVIDER LOCATION - business logic
//
//   App (every 30 s) ──► POST /provider/location
//                           │
//                           ├─► always: save in Redis (latest location)
//                           │
//                           └─► only if 10 minutes passed since the last
//                               database save: also save in the database
//
// Booking search reads the location from the DATABASE, and skips
// providers whose location is older than 15 minutes (their app has
// probably stopped). Both times are settings in .env.
// =====================================================================

import { prisma } from "../../../lib/prisma.js";
import { AppError } from "../../../errors/AppError.js";
import { env } from "../../../config/env.js";
import { Prisma } from "../../../generated/prisma/client.js";
import { getCachedLocation, setCachedLocation, deleteCachedLocation } from "./provider-location.cache.js";

const DB_SAVE_EVERY_MS = env.PROVIDER_LOCATION_DB_SAVE_SECONDS * 1000;

// GPS numbers are stored as Decimal(10,7) in the database
const toCoordinate = (value: number) => new Prisma.Decimal(value).toDecimalPlaces(7);

// ---------------------------------------------------------------
// Helper: find the provider of this logged-in user
// ---------------------------------------------------------------

const findMyProvider = async (userId: number) => {
    const provider = await prisma.providerProfile.findUnique({
        where: { userId },
        select: { id: true, availabilityStatus: true },
    });
    if (!provider) {
        throw new AppError(404, "Provider profile not found. Please register as a provider first.");
    }
    return provider;
};

// ---------------------------------------------------------------
// Helper: write a location to the database
// ---------------------------------------------------------------

const saveLocationToDatabase = async (providerId: number, latitude: number, longitude: number, time: Date) => {
    await prisma.providerProfile.update({
        where: { id: providerId },
        data: {
            latitude: toCoordinate(latitude),
            longitude: toCoordinate(longitude),
            locationUpdatedAt: time,
        },
    });
};

// ---------------------------------------------------------------
// Called when the provider goes ONLINE: save the starting location
// to Redis AND the database straight away.
// ---------------------------------------------------------------

export const saveStartingLocation = async (providerId: number, latitude: number, longitude: number) => {
    const now = new Date();

    await saveLocationToDatabase(providerId, latitude, longitude, now);
    await setCachedLocation(providerId, {
        latitude,
        longitude,
        updatedAt: now.toISOString(),
        savedToDbAt: now.toISOString(),
    });
};

// ---------------------------------------------------------------
// Called when the provider goes OFFLINE: copy the latest location
// from Redis to the database (so nothing is lost), then clear Redis.
// ---------------------------------------------------------------

export const saveLastLocationAndClear = async (providerId: number) => {
    const cached = await getCachedLocation(providerId);

    const hasUnsavedUpdate = cached && cached.savedToDbAt !== cached.updatedAt;
    if (cached && hasUnsavedUpdate) {
        await saveLocationToDatabase(providerId, cached.latitude, cached.longitude, new Date(cached.updatedAt));
    }

    await deleteCachedLocation(providerId);
};

// ---------------------------------------------------------------
// POST /provider/location   (the app calls this every 30 seconds)
// ---------------------------------------------------------------

export const updateMyLocation = async (userId: number, latitude: number, longitude: number) => {
    const provider = await findMyProvider(userId);

    if (provider.availabilityStatus !== "ONLINE") {
        throw new AppError(409, "You are offline. Go online first to share your location.");
    }

    const now = new Date();
    const cached = await getCachedLocation(provider.id);

    // ---- should we also write to the database this time? ----
    const lastDbSave = cached?.savedToDbAt ? new Date(cached.savedToDbAt) : null;
    const timeSinceLastDbSave = lastDbSave ? now.getTime() - lastDbSave.getTime() : Infinity;
    const saveToDatabase = timeSinceLastDbSave >= DB_SAVE_EVERY_MS;

    if (saveToDatabase) {
        await saveLocationToDatabase(provider.id, latitude, longitude, now);
    }

    // ---- always keep the latest location in Redis ----
    const savedToDbAt = saveToDatabase ? now.toISOString() : (cached?.savedToDbAt ?? null);
    await setCachedLocation(provider.id, {
        latitude,
        longitude,
        updatedAt: now.toISOString(),
        savedToDbAt,
    });

    const nextDatabaseSaveAt = new Date(new Date(savedToDbAt as string).getTime() + DB_SAVE_EVERY_MS);

    return {
        latitude,
        longitude,
        updatedAt: now,
        savedToDatabase: saveToDatabase,
        nextDatabaseSaveAt,
    };
};

// ---------------------------------------------------------------
// GET /provider/location   (my latest location: Redis first, then database)
// ---------------------------------------------------------------

export const getMyLocation = async (userId: number) => {
    const provider = await findMyProvider(userId);

    const cached = await getCachedLocation(provider.id);
    if (cached) {
        return { ...cached, source: "cache" as const };
    }

    const saved = await prisma.providerProfile.findUniqueOrThrow({
        where: { id: provider.id },
        select: { latitude: true, longitude: true, locationUpdatedAt: true },
    });

    return {
        latitude: saved.latitude === null ? null : Number(saved.latitude),
        longitude: saved.longitude === null ? null : Number(saved.longitude),
        updatedAt: saved.locationUpdatedAt,
        savedToDbAt: saved.locationUpdatedAt,
        source: "database" as const,
    };
};
