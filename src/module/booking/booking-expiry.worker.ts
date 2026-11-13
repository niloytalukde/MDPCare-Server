import { Queue, Worker } from "bullmq";
import { prisma } from "../../lib/prisma.js";
import { env } from "../../config/env.js";
import { createRedisConnection, isRedisConfigured } from "../../lib/redis.js";
import { openBroadcastRound, isFinalRound, type BroadcastResult } from "./booking-matching.service.js";
import { recordStatus } from "./booking.service.js";
import { notify } from "./booking.notify.js";

/**
 * Round advancement + booking expiry.
 *
 * `processExpiredRounds` is idempotent and safe to run on many instances at once:
 * each round is claimed with a conditional UPDATE (status SEARCHING -> EXPIRED),
 * so only one runner advances any given round.
 *
 * Scheduling:
 *   - REDIS_URL set   -> BullMQ repeatable job (one run per interval cluster-wide)
 *   - REDIS_URL unset -> in-process setInterval (fine for a single instance)
 */

const QUEUE = "booking-maintenance";
const JOB = "sweep-expired-rounds";

export interface SweepResult {
    advanced: number;
    expired: number;
}

export const processExpiredRounds = async (now = new Date(), batch = 100): Promise<SweepResult> => {
    const due = await prisma.bookingBroadcastRound.findMany({
        where: { status: "SEARCHING", expiresAt: { lte: now }, booking: { status: "SEARCHING_PROVIDER" } },
        orderBy: { expiresAt: "asc" },
        take: batch,
        select: { id: true, round: true, bookingId: true },
    });

    let advanced = 0;
    let expired = 0;

    for (const r of due) {
        try {
            const outcome = await prisma.$transaction(async (tx) => {
                const claimed = await tx.bookingBroadcastRound.updateMany({
                    where: { id: r.id, status: "SEARCHING" },
                    data: { status: "EXPIRED", completedAt: now },
                });
                if (claimed.count !== 1) return { kind: "skip" as const };

                const booking = await tx.booking.findUnique({
                    where: { id: r.bookingId },
                    select: { id: true, userId: true, status: true, latitude: true, longitude: true, items: { select: { serviceId: true } } },
                });
                if (!booking || booking.status !== "SEARCHING_PROVIDER") return { kind: "skip" as const };

                if (!isFinalRound(r.round)) {
                    const next = await openBroadcastRound(
                        tx,
                        { ...booking, serviceIds: booking.items.map((i) => i.serviceId) },
                        r.round + 1,
                        now
                    );
                    await recordStatus(tx, booking.id, "SEARCHING_PROVIDER", { role: "SYSTEM" }, `Broadcast round ${r.round + 1} (${next.radiusKm} km)`);
                    return { kind: "advanced" as const, next };
                }

                // Final round elapsed with no acceptance -> booking EXPIRED
                const done = await tx.booking.updateMany({
                    where: { id: booking.id, status: "SEARCHING_PROVIDER" },
                    data: { status: "EXPIRED" },
                });
                if (done.count !== 1) return { kind: "skip" as const };

                await tx.bookingProvider.updateMany({ where: { bookingId: booking.id, status: { in: ["SENT", "DELIVERED"] } }, data: { status: "EXPIRED" } });
                await tx.bookingAgency.updateMany({ where: { bookingId: booking.id, status: { in: ["SENT", "DELIVERED"] } }, data: { status: "EXPIRED" } });
                await recordStatus(tx, booking.id, "EXPIRED", { role: "SYSTEM" }, "No provider or agency accepted in time");
                return { kind: "expired" as const };
            });

            if (outcome.kind === "advanced") {
                advanced++;
                notify.newRequests(r.bookingId, outcome.next as BroadcastResult);
            } else if (outcome.kind === "expired") {
                expired++;
                notify.bookingUpdated(r.bookingId);
            }
        } catch (error) {
            // One bad booking must not stop the sweep
            console.error(`[booking-expiry] round ${r.id} failed:`, (error as Error).message);
        }
    }

    return { advanced, expired };
};

// ---------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------

let timer: NodeJS.Timeout | null = null;
let queue: Queue | null = null;
let worker: Worker | null = null;
let running = false;

export const startBookingWorkers = async () => {
    if (!env.BOOKING_WORKERS_ENABLED) return;
    const everyMs = env.BOOKING_SWEEP_INTERVAL_SECONDS * 1000;

    if (isRedisConfigured()) {
        queue = new Queue(QUEUE, { connection: createRedisConnection("queue") });
        await queue.upsertJobScheduler(JOB, { every: everyMs }, { name: JOB, opts: { removeOnComplete: 100, removeOnFail: 500 } });

        worker = new Worker(QUEUE, async () => processExpiredRounds(), {
            connection: createRedisConnection("worker"),
            concurrency: 1,
        });
        worker.on("failed", (job, err) => console.error(`[booking-expiry] job ${job?.id} failed:`, err.message));
        worker.on("error", (err) => console.error("[booking-expiry] worker error:", err.message));
        console.log(`[booking-expiry] BullMQ scheduler every ${env.BOOKING_SWEEP_INTERVAL_SECONDS}s`);
        return;
    }

    timer = setInterval(() => {
        if (running) return; // never overlap
        running = true;
        processExpiredRounds()
            .catch((e) => console.error("[booking-expiry]", (e as Error).message))
            .finally(() => { running = false; });
    }, everyMs);
    timer.unref();
    console.log(`[booking-expiry] in-process sweeper every ${env.BOOKING_SWEEP_INTERVAL_SECONDS}s (no REDIS_URL)`);
};

export const stopBookingWorkers = async () => {
    if (timer) clearInterval(timer);
    timer = null;
    await worker?.close();
    await queue?.close();
    worker = null;
    queue = null;
};
