// =====================================================================
// STEP 4 - DOING THE JOB: start, completion code, complete
//
//   CONFIRMED --(worker presses Start)--> IN_PROGRESS
//   IN_PROGRESS --(customer gives the 6-digit code)--> COMPLETED
//
// The "worker" (Performer) is either:
//   - the individual PROVIDER who accepted the booking, or
//   - the AGENCY STAFF member assigned to it
//
// The completion code proves the customer agrees the job is done.
// We only store a hash of it (like a password), never the code itself.
// When the booking is COMPLETED the money is put in the right wallet
// (finance/settlement.service.ts) - in the SAME transaction, and only once.
// =====================================================================

import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../errors/AppError.js";
import { env } from "../../config/env.js";
import type { Prisma } from "../../generated/prisma/client.js";
import { generateNumericOtp, hashBookingOtp, verifyBookingOtpHash } from "../../utils/otpHash.js";
import { settleBooking } from "../finance/settlement.service.js";
import {
    COMPLETION_CODE_DIGITS,
    MAX_COMPLETION_CODES_PER_BOOKING,
    MAX_WRONG_CODE_ATTEMPTS,
} from "./booking.constants.js";
import { saveStatusChange } from "./booking-history.js";
import { notify } from "./booking.notify.js";

type Tx = Prisma.TransactionClient;

// Who is doing the job
export type Performer =
    | { kind: "PROVIDER"; userId: number; providerId: number }
    | { kind: "AGENCY_STAFF"; userId: number; memberId: number; agencyId: number };

// ---------------------------------------------------------------
// Helper: load the booking and check this person really does the job.
// Anyone else gets 404 (we don't even say the booking exists).
// ---------------------------------------------------------------

const getBookingForPerformer = async (tx: Tx, bookingId: number, performer: Performer) => {
    const booking = await tx.booking.findUnique({
        where: { id: bookingId },
        include: { agencyAssignment: true, items: { select: { serviceId: true } } },
    });
    if (!booking) {
        throw new AppError(404, "Booking not found");
    }

    if (performer.kind === "PROVIDER") {
        const isMyBooking = booking.providerId === performer.providerId;
        if (!isMyBooking) {
            throw new AppError(404, "Booking not found");
        }
    } else {
        const assignment = booking.agencyAssignment;
        const isMyAssignment =
            booking.agencyId === performer.agencyId && assignment !== null && assignment.staffMemberId === performer.memberId;
        if (!isMyAssignment) {
            throw new AppError(404, "Booking not found");
        }
    }

    return booking;
};

// ---------------------------------------------------------------
// START the job   (CONFIRMED -> IN_PROGRESS)
// ---------------------------------------------------------------

export const startService = async (bookingId: number, performer: Performer) => {
    const now = new Date();

    await prisma.$transaction(async (tx) => {
        const booking = await getBookingForPerformer(tx, bookingId, performer);

        // Agency staff must have ACCEPTED the assignment before starting
        if (performer.kind === "AGENCY_STAFF") {
            const assignmentResult = await tx.agencyBookingAssignment.updateMany({
                where: { bookingId, staffMemberId: performer.memberId, status: "ACCEPTED" },
                data: { status: "STARTED", startedAt: now },
            });
            if (assignmentResult.count !== 1) {
                throw new AppError(409, "You must accept the assignment before starting the service");
            }

            await tx.agencyAssignmentHistory.create({
                data: {
                    assignmentId: booking.agencyAssignment!.id,
                    bookingId,
                    agencyId: performer.agencyId,
                    staffMemberId: performer.memberId,
                    actorMemberId: performer.memberId,
                    status: "STARTED",
                },
            });
        }

        // Only a CONFIRMED booking can start (safe even if two requests arrive together)
        const result = await tx.booking.updateMany({
            where: { id: bookingId, status: "CONFIRMED" },
            data: { status: "IN_PROGRESS", serviceStartedAt: now },
        });
        if (result.count !== 1) {
            throw new AppError(409, `Service cannot be started from status ${booking.status}`);
        }

        await saveStatusChange(tx, bookingId, "IN_PROGRESS", { userId: performer.userId, role: performer.kind }, "Service started");
    });

    notify.bookingUpdated(bookingId);
    return { id: bookingId, status: "IN_PROGRESS" as const };
};

// ---------------------------------------------------------------
// CUSTOMER asks for the completion code
//
// The customer app shows the code; the customer reads it to the worker
// when the job is done. Each call makes a NEW code and cancels the old one.
// The plain code is returned ONLY here, ONLY to the customer.
// ---------------------------------------------------------------

export const issueCompletionOtp = async (bookingId: number, customerUserId: number) => {
    const code = generateNumericOtp(COMPLETION_CODE_DIGITS);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + env.BOOKING_COMPLETION_OTP_TTL_MINUTES * 60 * 1000);

    await prisma.$transaction(async (tx) => {
        // Lock per booking, so two quick taps can't create two valid codes
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"booking-otp:" + bookingId}))`;

        const booking = await tx.booking.findUnique({
            where: { id: bookingId },
            select: { userId: true, status: true },
        });
        if (!booking || booking.userId !== customerUserId) {
            throw new AppError(404, "Booking not found");
        }
        if (booking.status !== "IN_PROGRESS") {
            throw new AppError(409, "Completion code is available once the service has started");
        }

        const codesAlreadyMade = await tx.bookingOTP.count({
            where: { bookingId, type: "SERVICE_COMPLETION" },
        });
        if (codesAlreadyMade >= MAX_COMPLETION_CODES_PER_BOOKING) {
            throw new AppError(429, "Completion code limit reached. Please contact support.");
        }

        // cancel any older unused code
        await tx.bookingOTP.updateMany({
            where: { bookingId, type: "SERVICE_COMPLETION", consumedAt: null },
            data: { consumedAt: now },
        });

        // save the new one (hash only)
        await tx.bookingOTP.create({
            data: {
                bookingId,
                type: "SERVICE_COMPLETION",
                codeHash: hashBookingOtp(bookingId, code),
                expiresAt,
                maxAttempts: MAX_WRONG_CODE_ATTEMPTS,
                resendCount: codesAlreadyMade,
            },
        });
    });

    return { code, expiresAt };
};

// ---------------------------------------------------------------
// COMPLETE the job with the customer's code   (IN_PROGRESS -> COMPLETED)
// ---------------------------------------------------------------

export const completeService = async (bookingId: number, performer: Performer, code: string) => {
    const now = new Date();

    // ---- 1. is this person allowed? ----
    await prisma.$transaction(async (tx) => {
        await getBookingForPerformer(tx, bookingId, performer);
    });

    // ---- 2. check the code ----
    // (done OUTSIDE the main transaction, so a wrong attempt is still
    //  counted even though we then throw an error)
    const savedCode = await prisma.bookingOTP.findFirst({
        where: {
            bookingId,
            type: "SERVICE_COMPLETION",
            consumedAt: null,
            verifiedAt: null,
            expiresAt: { gt: now },
        },
        orderBy: { createdAt: "desc" },
    });
    if (!savedCode || savedCode.attempts >= savedCode.maxAttempts) {
        throw new AppError(400, "No valid completion code. Ask the customer to generate a new one.");
    }

    const isCodeCorrect = verifyBookingOtpHash(bookingId, code, savedCode.codeHash);
    if (!isCodeCorrect) {
        await prisma.bookingOTP.updateMany({
            where: { id: savedCode.id, consumedAt: null, attempts: { lt: savedCode.maxAttempts } },
            data: { attempts: { increment: 1 } },
        });
        throw new AppError(400, "Invalid completion code");
    }

    // ---- 3. use the code + complete + pay the wallet: all or nothing ----
    const result = await prisma.$transaction(async (tx) => {
        // 3a. mark the code as used (fails if someone used it a moment ago)
        const codeResult = await tx.bookingOTP.updateMany({
            where: {
                id: savedCode.id,
                consumedAt: null,
                verifiedAt: null,
                expiresAt: { gt: now },
                attempts: { lt: savedCode.maxAttempts },
            },
            data: { verifiedAt: now, consumedAt: now },
        });
        if (codeResult.count !== 1) {
            throw new AppError(409, "Completion code already used");
        }

        const booking = await getBookingForPerformer(tx, bookingId, performer);

        // 3b. booking -> COMPLETED (only from IN_PROGRESS)
        const bookingResult = await tx.booking.updateMany({
            where: { id: bookingId, status: "IN_PROGRESS" },
            data: {
                status: "COMPLETED",
                completedAt: now,
                // CASH: the worker collected the money at the door
                ...(booking.paymentMethod === "CASH" && { paymentStatus: "PAID", paidAt: now }),
            },
        });
        if (bookingResult.count !== 1) {
            throw new AppError(409, `Booking cannot be completed from status ${booking.status}`);
        }

        // 3c. update the assignment / counters
        if (performer.kind === "AGENCY_STAFF") {
            const assignmentResult = await tx.agencyBookingAssignment.updateMany({
                where: { bookingId, staffMemberId: performer.memberId, status: "STARTED" },
                data: { status: "COMPLETED", completedAt: now },
            });
            if (assignmentResult.count !== 1) {
                throw new AppError(409, "Assignment is not in progress");
            }

            await tx.agencyAssignmentHistory.create({
                data: {
                    assignmentId: booking.agencyAssignment!.id,
                    bookingId,
                    agencyId: performer.agencyId,
                    staffMemberId: performer.memberId,
                    actorMemberId: performer.memberId,
                    status: "COMPLETED",
                },
            });
            await tx.agency.update({
                where: { id: performer.agencyId },
                data: { completedBookings: { increment: 1 } },
            });
        } else {
            await tx.providerProfile.update({
                where: { id: performer.providerId },
                data: { completedBookings: { increment: 1 } },
            });
        }

        await saveStatusChange(tx, bookingId, "COMPLETED", { userId: performer.userId, role: performer.kind }, "Completion OTP verified");

        // 3d. put the money in the provider wallet OR the agency wallet
        const completedBooking = await tx.booking.findUniqueOrThrow({ where: { id: bookingId } });
        const settlement = await settleBooking(tx, completedBooking);

        return { settlement };
    });

    notify.bookingUpdated(bookingId);
    return { id: bookingId, status: "COMPLETED" as const, settlement: result.settlement };
};
