import { Redis } from "ioredis";
import { env } from "../config/env.js";

/**
 * Lazily-created Redis connections. Redis is optional: when REDIS_URL is not
 * set, background jobs fall back to an in-process timer (single instance only).
 *
 * BullMQ requires `maxRetriesPerRequest: null` on its connections.
 */
const connections: Redis[] = [];

export const isRedisConfigured = () => Boolean(env.REDIS_URL);

export const createRedisConnection = (name: string): Redis => {
    if (!env.REDIS_URL) {
        throw new Error("REDIS_URL is not configured");
    }

    const conn = new Redis(env.REDIS_URL, {
        maxRetriesPerRequest: null,
        enableReadyCheck: true,
        connectionName: `mdpcare:${name}`,
        retryStrategy: (times) => Math.min(times * 500, 10_000),
    });

    conn.on("error", (err) => {
        // ioredis reconnects automatically; log once per error type to avoid floods
        console.error(`[redis:${name}]`, err.message);
    });

    connections.push(conn);
    return conn;
};

export const closeRedisConnections = async () => {
    await Promise.allSettled(connections.map((c) => c.quit()));
    connections.length = 0;
};
