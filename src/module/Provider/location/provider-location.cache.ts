// =====================================================================
// PROVIDER LOCATION CACHE (Redis)
//
// The provider app sends its location every 30 seconds. Writing that to
// the database every time would be a lot of writes, so we keep the
// latest location in Redis (fast, in memory) and only copy it to the
// database every 10 minutes (see provider-location.service.ts).
//
// Redis key:   provider:location:<providerId>
// Redis value: { "latitude": 22.57, "longitude": 88.36,
//                "updatedAt": "...", "savedToDbAt": "..." }
// The key deletes itself after 1 hour without updates.
//
// No REDIS_URL in .env (local development)?  Then a normal JavaScript
// Map is used instead. That only works with ONE server, so always set
// REDIS_URL in production.
// =====================================================================

import type { Redis } from "ioredis";
import { createRedisConnection, isRedisConfigured } from "../../../lib/redis.js";

export interface CachedLocation {
    latitude: number;
    longitude: number;
    updatedAt: string; // when the app last sent it (ISO date text)
    savedToDbAt: string | null; // when we last copied it to the database
}

const KEY_PREFIX = "provider:location:";
const EXPIRE_AFTER_SECONDS = 60 * 60; // 1 hour

// ---------------------------------------------------------------
// Pick the storage: Redis if configured, otherwise a Map
// ---------------------------------------------------------------

let redis: Redis | null = null;
const memoryStore = new Map<number, CachedLocation>();

const getRedis = (): Redis | null => {
    if (!isRedisConfigured()) return null;
    if (!redis) {
        redis = createRedisConnection("location-cache");
    }
    return redis;
};

// ---------------------------------------------------------------
// Read
// ---------------------------------------------------------------

export const getCachedLocation = async (providerId: number): Promise<CachedLocation | null> => {
    const client = getRedis();

    if (!client) {
        return memoryStore.get(providerId) ?? null;
    }

    const text = await client.get(KEY_PREFIX + providerId);
    return text ? (JSON.parse(text) as CachedLocation) : null;
};

// ---------------------------------------------------------------
// Save
// ---------------------------------------------------------------

export const setCachedLocation = async (providerId: number, location: CachedLocation) => {
    const client = getRedis();

    if (!client) {
        memoryStore.set(providerId, location);
        return;
    }

    // "EX" = delete the key automatically after EXPIRE_AFTER_SECONDS
    await client.set(KEY_PREFIX + providerId, JSON.stringify(location), "EX", EXPIRE_AFTER_SECONDS);
};

// ---------------------------------------------------------------
// Delete (when the provider goes offline)
// ---------------------------------------------------------------

export const deleteCachedLocation = async (providerId: number) => {
    const client = getRedis();

    if (!client) {
        memoryStore.delete(providerId);
        return;
    }

    await client.del(KEY_PREFIX + providerId);
};
