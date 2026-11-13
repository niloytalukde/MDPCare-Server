// =====================================================================
// BACKGROUND JOB - move to the next search round, or EXPIRE the booking
//
// Every few seconds (BOOKING_SWEEP_INTERVAL_SECONDS) this job looks for
// search rounds whose time is up and nobody accepted:
//
//   round 1 or 2 ended  -> open the next, wider round
//   last round ended    -> booking becomes EXPIRED
//
// It is safe to run on many servers at once: each round is "claimed"
// with an update (SEARCHING -> EXPIRED) that only ONE server can win.
//
// How it runs:
//   REDIS_URL is set   -> BullMQ job (runs once per interval for all servers)
//   REDIS_URL not set  -> a simple timer inside this server
// =====================================================================

import { Queue, Worker } from "bullmq";
import { prisma } from "../../lib/prisma.js";
import { env } from "../../config/env.js";
import { createRedisConnection, isRedisConfigured } from "../../lib/redis.js";
import { OPEN_REQUEST_STATUSES } from "./booking.constants.js";
import { saveStatusChange } from "./booking-history.js";
import { openSearchRound, isLastRound, type SearchRoundResult } from "./booking-matching.service.js";
import { notify } from "./booking.notify.js";

const QUEUE_NAME = "booking-maintenance";
const JOB_NAME = "sweep-expired-rounds";

export interface SweepResult {
    advanced: number; // bookings moved to the next round
    expired: number; // bookings that became EXPIRED
}

// What happened to one round
type RoundOutcome =
    | { kind: "skip" } // someone else handled it, or the booking is no longer searching
    | { kind: "next-round"; nextRound: SearchRoundResult }
    | { kind: "expired" };

// ---------------------------------------------------------------
// The work: handle every round whose time is up
// ---------------------------------------------------------------

export const processExpiredRounds = async (now = new Date(), batchSize = 100): Promise<SweepResult> => {
    const roundsTimeIsUp = await prisma.bookingBroadcastRound.findMany({
        where: {
            status: "SEARCHING",
            expiresAt: { lte: now },
            booking: { status: "SEARCHING_PROVIDER" },
        },
        orderBy: { expiresAt: "asc" },
        take: batchSize,
        select: { id: true, round: true, bookingId: true },
    });

    let advanced = 0;
    let expired = 0;

    for (const round of roundsTimeIsUp) {
        try {
            const outcome: RoundOutcome = await prisma.$transaction(async (tx) => {
                // ---- 1. claim this round (only one server wins) ----
                const claim = await tx.bookingBroadcastRound.updateMany({
                    where: { id: round.id, status: "SEARCHING" },
                    data: { status: "EXPIRED", completedAt: now },
                });
                if (claim.count !== 1) {
                    return { kind: "skip" };
                }

                const booking = await tx.booking.findUnique({
                    where: { id: round.bookingId },
                    select: {
                        id: true,
                        userId: true,
                        status: true,
                        latitude: true,
                        longitude: true,
                        items: { select: { serviceId: true } },
                    },
                });
                if (!booking || booking.status !== "SEARCHING_PROVIDER") {
                    return { kind: "skip" };
                }

                // ---- 2a. not the last round: search wider ----
                if (!isLastRound(round.round)) {
                    const nextRoundNumber = round.round + 1;
                    const nextRound = await openSearchRound(
                        tx,
                        { ...booking, serviceIds: booking.items.map((item) => item.serviceId) },
                        nextRoundNumber,
                        now
                    );
                    await saveStatusChange(
                        tx,
                        booking.id,
                        "SEARCHING_PROVIDER",
                        { role: "SYSTEM" },
                        `Broadcast round ${nextRoundNumber} (${nextRound.radiusKm} km)`
                    );
                    return { kind: "next-round", nextRound };
                }

                // ---- 2b. last round ended: nobody accepted -> EXPIRED ----
                const expireResult = await tx.booking.updateMany({
                    where: { id: booking.id, status: "SEARCHING_PROVIDER" },
                    data: { status: "EXPIRED" },
                });
                if (expireResult.count !== 1) {
                    return { kind: "skip" };
                }

                await tx.bookingProvider.updateMany({
                    where: { bookingId: booking.id, status: { in: [...OPEN_REQUEST_STATUSES] } },
                    data: { status: "EXPIRED" },
                });
                await tx.bookingAgency.updateMany({
                    where: { bookingId: booking.id, status: { in: [...OPEN_REQUEST_STATUSES] } },
                    data: { status: "EXPIRED" },
                });
                await saveStatusChange(tx, booking.id, "EXPIRED", { role: "SYSTEM" }, "No provider or agency accepted in time");

                return { kind: "expired" };
            });

            // ---- 3. notifications (after saving) ----
            if (outcome.kind === "next-round") {
                advanced++;
                notify.newRequests(round.bookingId, outcome.nextRound);
            } else if (outcome.kind === "expired") {
                expired++;
                notify.bookingUpdated(round.bookingId);
            }
        } catch (error) {
            // One broken booking must not stop the others
            console.error(`[booking-expiry] round ${round.id} failed:`, (error as Error).message);
        }
    }

    return { advanced, expired };
};

// ---------------------------------------------------------------
// Start / stop the job (called from app/server.ts)
// ---------------------------------------------------------------

let timer: NodeJS.Timeout | null = null;
let queue: Queue | null = null;
let worker: Worker | null = null;
let isRunning = false;

export const startBookingWorkers = async () => {
    if (!env.BOOKING_WORKERS_ENABLED) return;

    const intervalMs = env.BOOKING_SWEEP_INTERVAL_SECONDS * 1000;

    // ---- with Redis: BullMQ ----
    if (isRedisConfigured()) {
        queue = new Queue(QUEUE_NAME, { connection: createRedisConnection("queue") });
        await queue.upsertJobScheduler(
            JOB_NAME,
            { every: intervalMs },
            { name: JOB_NAME, opts: { removeOnComplete: 100, removeOnFail: 500 } }
        );

        worker = new Worker(QUEUE_NAME, async () => processExpiredRounds(), {
            connection: createRedisConnection("worker"),
            concurrency: 1,
        });
        worker.on("failed", (job, error) => console.error(`[booking-expiry] job ${job?.id} failed:`, error.message));
        worker.on("error", (error) => console.error("[booking-expiry] worker error:", error.message));

        console.log(`[booking-expiry] BullMQ scheduler every ${env.BOOKING_SWEEP_INTERVAL_SECONDS}s`);
        return;
    }

    // ---- without Redis: a simple timer ----
    timer = setInterval(() => {
        if (isRunning) return; // the last run is not finished yet
        isRunning = true;

        processExpiredRounds()
            .catch((error) => console.error("[booking-expiry]", (error as Error).message))
            .finally(() => {
                isRunning = false;
            });
    }, intervalMs);
    timer.unref(); // don't keep the server alive just for this timer

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
