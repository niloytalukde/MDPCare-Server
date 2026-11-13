import crypto from "node:crypto";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../errors/AppError.js";
import { env } from "../../config/env.js";
import { Prisma } from "../../generated/prisma/client.js";
import type { BookingStatus, BookingCancellationActor } from "../../generated/prisma/enums.js";
import { fromFloat, money, sum, ZERO } from "../../utils/money.js";
import { generateNumericOtp, hashBookingOtp, verifyBookingOtpHash } from "../../utils/otpHash.js";
import { paginationMeta, toSkipTake, type Pagination } from "../../utils/validators.js";
import { openBroadcastRound } from "./booking-matching.service.js";
import { settleBooking } from "../finance/settlement.service.js";
import { notify } from "./booking.notify.js";

type Tx = Prisma.TransactionClient;

// ---------------------------------------------------------------
// State machine (BK-06)
// ---------------------------------------------------------------

export const CANCELLABLE_STATUSES: BookingStatus[] = ["PENDING", "SEARCHING_PROVIDER", "CONFIRMED"];
const OPEN_REQUEST = ["SENT", "DELIVERED"] as const;
const MAX_COMPLETION_OTP_ISSUES = 5;
const MAX_OTP_ATTEMPTS = 5;

export const recordStatus = (
    tx: Tx,
    bookingId: number,
    status: BookingStatus,
    actor: { userId?: number | null; role: string },
    note?: string
) =>
    tx.bookingStatusHistory.create({
        data: { bookingId, status, changedBy: actor.userId ?? null, changedRole: actor.role, note: note ?? null },
    });

// ---------------------------------------------------------------
// Create
// ---------------------------------------------------------------

export interface CreateBookingInput {
    type: "INSTANT" | "SCHEDULED";
    scheduledAt?: Date | undefined;
    items: { serviceId: number; quantity: number }[];
    addressId?: number | undefined;
    latitude?: number | undefined;
    longitude?: number | undefined;
    fullAddress?: string | undefined;
    landmark?: string | undefined;
    familyMemberId?: number | undefined;
    paymentMethod: "ONLINE" | "CASH";
}

const newBookingNumber = () => {
    const d = new Date();
    const ymd = `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
    return `MDP${ymd}${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
};

const composeAddress = (a: {
    flatNo: string | null; floor: string | null; buildingName: string | null;
    street: string | null; area: string | null; city: string; state: string; pincode: string;
}) =>
    [a.flatNo, a.floor && `Floor ${a.floor}`, a.buildingName, a.street, a.area, a.city, a.state, a.pincode]
        .filter(Boolean)
        .join(", ");

export const createBooking = async (userId: number, input: CreateBookingInput) => {
    // ---- Validate references (all must belong to this customer) ----
    const serviceIds = input.items.map((i) => i.serviceId);
    if (new Set(serviceIds).size !== serviceIds.length) {
        throw new AppError(400, "Each service may appear only once; use quantity instead");
    }

    const services = await prisma.service.findMany({ where: { id: { in: serviceIds } } });
    if (services.length !== serviceIds.length) {
        throw new AppError(404, "One or more services were not found");
    }

    let latitude = input.latitude;
    let longitude = input.longitude;
    let fullAddress = input.fullAddress;
    let addressLabel: string | null = null;

    if (input.addressId !== undefined) {
        const address = await prisma.address.findFirst({ where: { id: input.addressId, userId } });
        if (!address) throw new AppError(404, "Address not found");
        latitude = latitude ?? address.latitude ?? undefined;
        longitude = longitude ?? address.longitude ?? undefined;
        fullAddress = fullAddress ?? composeAddress(address);
        addressLabel = address.addressType;
    }

    if (latitude === undefined || longitude === undefined || !fullAddress) {
        throw new AppError(400, "A location (latitude, longitude) and address are required");
    }

    let customerName: string | null = null;
    let customerPhone: string | null = null;
    if (input.familyMemberId !== undefined) {
        const member = await prisma.familyMember.findFirst({ where: { id: input.familyMemberId, userId } });
        if (!member) throw new AppError(404, "Family member not found");
        customerName = member.name;
        customerPhone = member.phone;
    }

    if (input.type === "SCHEDULED") {
        if (!input.scheduledAt || input.scheduledAt.getTime() <= Date.now()) {
            throw new AppError(400, "scheduledAt must be in the future for scheduled bookings");
        }
    }

    // ---- Price snapshot (Decimal only; FIN-01) ----
    const byId = new Map(services.map((s) => [s.id, s]));
    const lines = input.items.map((item) => {
        const s = byId.get(item.serviceId)!;
        const unit = fromFloat(s.price);
        const effective = s.discountPrice !== null ? fromFloat(s.discountPrice) : unit;
        return {
            serviceId: s.id,
            serviceName: s.name,
            serviceImage: s.imageUrl,
            quantity: item.quantity,
            unitPrice: unit,
            discountPrice: s.discountPrice !== null ? effective : null,
            totalPrice: money(effective.times(item.quantity)),
            gross: money(unit.times(item.quantity)),
            durationMinutes: s.timeRequired !== null ? s.timeRequired * item.quantity : null,
        };
    });

    const subtotal = sum(lines.map((l) => l.gross));
    const discountAmount = money(subtotal.minus(sum(lines.map((l) => l.totalPrice))));
    // Q1: platform fee / tax rules undefined -> 0 until decided. Settlement reads these snapshots.
    const taxAmount = ZERO;
    const platformFee = ZERO;
    const totalAmount = money(subtotal.minus(discountAmount).plus(taxAmount).plus(platformFee));
    const estimatedDuration = lines.every((l) => l.durationMinutes !== null)
        ? lines.reduce((a, l) => a + (l.durationMinutes as number), 0)
        : null;

    // ---- Persist + open round 1 atomically (retry on bookingNumber collision) ----
    for (let attempt = 0; attempt < 3; attempt++) {
        try {
            const { booking, broadcast } = await prisma.$transaction(async (tx) => {
                const booking = await tx.booking.create({
                    data: {
                        bookingNumber: newBookingNumber(),
                        userId,
                        type: input.type,
                        status: "PENDING",
                        addressId: input.addressId ?? null,
                        addressLabel,
                        fullAddress: fullAddress as string,
                        latitude: new Prisma.Decimal(latitude as number).toDecimalPlaces(7),
                        longitude: new Prisma.Decimal(longitude as number).toDecimalPlaces(7),
                        landmark: input.landmark ?? null,
                        familyMemberId: input.familyMemberId ?? null,
                        customerName,
                        customerPhone,
                        scheduledAt: input.type === "SCHEDULED" ? (input.scheduledAt as Date) : null,
                        estimatedDuration,
                        subtotal,
                        discountAmount,
                        taxAmount,
                        platformFee,
                        totalAmount,
                        paymentMethod: input.paymentMethod,
                        paymentStatus: "PENDING",
                        items: {
                            create: lines.map(({ gross: _gross, ...l }) => l),
                        },
                    },
                });

                await recordStatus(tx, booking.id, "PENDING", { userId, role: "CUSTOMER" }, "Booking created");

                const broadcast = await openBroadcastRound(
                    tx,
                    { id: booking.id, userId, latitude: booking.latitude, longitude: booking.longitude, serviceIds },
                    1
                );

                await tx.booking.update({ where: { id: booking.id }, data: { status: "SEARCHING_PROVIDER" } });
                await recordStatus(tx, booking.id, "SEARCHING_PROVIDER", { role: "SYSTEM" }, "Broadcast round 1");

                return { booking, broadcast };
            });

            notify.newRequests(booking.id, broadcast);

            return getBookingForUser(booking.id, { userId, isAdmin: false });
        } catch (error) {
            if (
                error instanceof Prisma.PrismaClientKnownRequestError &&
                error.code === "P2002" &&
                String((error.meta as { target?: unknown })?.target ?? "").includes("bookingNumber")
            ) {
                continue;
            }
            throw error;
        }
    }

    throw new AppError(503, "Could not allocate a booking number. Please retry.");
};

// ---------------------------------------------------------------
// Read (authorization = who may see a booking)
// ---------------------------------------------------------------

const bookingInclude = {
    items: true,
    provider: { select: { id: true, displayName: true, averageRating: true, user: { select: { name: true, phone: true } } } },
    agency: { select: { id: true, name: true, phone: true, averageRating: true } },
    agencyAssignment: {
        select: {
            id: true, status: true, assignedAt: true, acceptedAt: true, startedAt: true, completedAt: true,
            staffMember: { select: { id: true, displayName: true, user: { select: { name: true, phone: true } } } },
        },
    },
    statusHistory: { orderBy: { createdAt: "asc" as const }, select: { status: true, changedRole: true, note: true, createdAt: true } },
    cancellation: true,
} satisfies Prisma.BookingInclude;

/**
 * A user may view a booking if they are: the customer; the assigned provider;
 * an ACTIVE owner of the assigned agency; the assigned staff member; a provider
 * or agency owner who received an open request for it; or an admin.
 * Unauthorized = 404 (does not reveal existence).
 */
export const getBookingForUser = async (bookingId: number, viewer: { userId: number; isAdmin: boolean }) => {
    const booking = await prisma.booking.findUnique({ where: { id: bookingId }, include: bookingInclude });
    if (!booking) throw new AppError(404, "Booking not found");

    if (viewer.isAdmin || booking.userId === viewer.userId) return booking;

    const provider = await prisma.providerProfile.findUnique({ where: { userId: viewer.userId }, select: { id: true } });
    if (provider) {
        if (booking.providerId === provider.id) return booking;
        const req = await prisma.bookingProvider.findUnique({
            where: { bookingId_providerId: { bookingId, providerId: provider.id } },
            select: { status: true },
        });
        if (req && booking.status === "SEARCHING_PROVIDER" && (OPEN_REQUEST as readonly string[]).includes(req.status)) {
            return redactForCandidate(booking);
        }
    }

    const memberships = await prisma.agencyMember.findMany({
        where: { userId: viewer.userId, status: "ACTIVE" },
        select: { id: true, agencyId: true, role: true },
    });
    for (const m of memberships) {
        if (booking.agencyId === m.agencyId && m.role === "OWNER") return booking;
        if (booking.agencyAssignment && booking.agencyAssignment.staffMember.id === m.id) return booking;
        if (m.role === "OWNER" && booking.status === "SEARCHING_PROVIDER") {
            const req = await prisma.bookingAgency.findUnique({
                where: { bookingId_agencyId: { bookingId, agencyId: m.agencyId } },
                select: { status: true },
            });
            if (req && (OPEN_REQUEST as readonly string[]).includes(req.status)) return redactForCandidate(booking);
        }
    }

    throw new AppError(404, "Booking not found");
};

/** Candidates see job details but not the customer's identity/phone until they accept. */
const redactForCandidate = <T extends { customerName: string | null; customerPhone: string | null; fullAddress: string; landmark: string | null }>(b: T) => ({
    ...b,
    customerName: null,
    customerPhone: null,
    fullAddress: "Shared after acceptance",
    landmark: null,
});

export const listCustomerBookings = async (userId: number, p: Pagination & { status?: BookingStatus | undefined }) => {
    const where: Prisma.BookingWhereInput = { userId, ...(p.status && { status: p.status }) };
    const [data, total] = await prisma.$transaction([
        prisma.booking.findMany({
            where,
            orderBy: { createdAt: "desc" },
            include: { items: true, provider: { select: { id: true, displayName: true } }, agency: { select: { id: true, name: true } } },
            ...toSkipTake(p),
        }),
        prisma.booking.count({ where }),
    ]);
    return { data, meta: paginationMeta(p, total) };
};

// ---------------------------------------------------------------
// Cancel (customer before IN_PROGRESS; admin any time before COMPLETED)
// ---------------------------------------------------------------

export const cancelBooking = async (
    bookingId: number,
    actor: { userId: number; kind: Extract<BookingCancellationActor, "CUSTOMER" | "ADMIN"> },
    reason?: string
) => {
    const allowed: BookingStatus[] = actor.kind === "ADMIN" ? [...CANCELLABLE_STATUSES, "IN_PROGRESS"] : CANCELLABLE_STATUSES;
    const now = new Date();

    const result = await prisma.$transaction(async (tx) => {
        const booking = await tx.booking.findUnique({ where: { id: bookingId }, include: { agencyAssignment: true } });
        if (!booking || (actor.kind === "CUSTOMER" && booking.userId !== actor.userId)) {
            throw new AppError(404, "Booking not found");
        }

        // Conditional update = race-safe against a concurrent accept/start
        const updated = await tx.booking.updateMany({
            where: { id: bookingId, status: { in: allowed } },
            data: { status: "CANCELLED", cancelledAt: now },
        });
        if (updated.count !== 1) {
            throw new AppError(409, `Booking cannot be cancelled in its current status (${booking.status})`);
        }

        await tx.bookingCancellation.create({
            data: { bookingId, actor: actor.kind, actorId: actor.userId, reason: reason ?? null },
        });
        await tx.bookingProvider.updateMany({ where: { bookingId, status: { in: [...OPEN_REQUEST] } }, data: { status: "CANCELLED", respondedAt: now } });
        await tx.bookingAgency.updateMany({ where: { bookingId, status: { in: [...OPEN_REQUEST] } }, data: { status: "CANCELLED", respondedAt: now } });
        await tx.bookingBroadcastRound.updateMany({ where: { bookingId, status: "SEARCHING" }, data: { status: "CANCELLED", completedAt: now } });
        await tx.bookingOTP.updateMany({ where: { bookingId, consumedAt: null }, data: { consumedAt: now } });

        if (booking.agencyAssignment && !["COMPLETED", "CANCELLED"].includes(booking.agencyAssignment.status)) {
            const a = booking.agencyAssignment;
            await tx.agencyBookingAssignment.update({ where: { id: a.id }, data: { status: "CANCELLED", cancelledAt: now } });
            await tx.agencyAssignmentHistory.create({
                data: { assignmentId: a.id, bookingId, agencyId: a.agencyId, staffMemberId: a.staffMemberId, actorMemberId: null, status: "CANCELLED", note: `Booking cancelled by ${actor.kind}` },
            });
        }

        if (booking.providerId) {
            await tx.providerProfile.update({ where: { id: booking.providerId }, data: { cancelledBookings: { increment: 1 } } });
        }
        if (booking.agencyId) {
            await tx.agency.update({ where: { id: booking.agencyId }, data: { cancelledBookings: { increment: 1 } } });
        }

        await recordStatus(tx, bookingId, "CANCELLED", { userId: actor.userId, role: actor.kind }, reason);

        // Refunds: no payment gateway yet (FIN-05). An ONLINE+PAID booking is flagged for manual refund.
        return { booking, needsRefund: booking.paymentMethod === "ONLINE" && booking.paymentStatus === "PAID" };
    });

    notify.bookingUpdated(bookingId);
    return { id: bookingId, status: "CANCELLED" as const, needsManualRefund: result.needsRefund };
};

// ---------------------------------------------------------------
// Service start / completion OTP / complete
// ---------------------------------------------------------------

export type Performer =
    | { kind: "PROVIDER"; userId: number; providerId: number }
    | { kind: "AGENCY_STAFF"; userId: number; memberId: number; agencyId: number };

const assertPerformer = async (tx: Tx, bookingId: number, who: Performer) => {
    const booking = await tx.booking.findUnique({ where: { id: bookingId }, include: { agencyAssignment: true, items: { select: { serviceId: true } } } });
    if (!booking) throw new AppError(404, "Booking not found");

    if (who.kind === "PROVIDER") {
        if (booking.providerId !== who.providerId) throw new AppError(404, "Booking not found");
    } else {
        const a = booking.agencyAssignment;
        if (booking.agencyId !== who.agencyId || !a || a.staffMemberId !== who.memberId) {
            throw new AppError(404, "Booking not found");
        }
    }
    return booking;
};

export const startService = async (bookingId: number, who: Performer) => {
    const now = new Date();

    await prisma.$transaction(async (tx) => {
        const booking = await assertPerformer(tx, bookingId, who);

        if (who.kind === "AGENCY_STAFF") {
            const a = await tx.agencyBookingAssignment.updateMany({
                where: { bookingId, staffMemberId: who.memberId, status: "ACCEPTED" },
                data: { status: "STARTED", startedAt: now },
            });
            if (a.count !== 1) throw new AppError(409, "You must accept the assignment before starting the service");
            await tx.agencyAssignmentHistory.create({
                data: { assignmentId: booking.agencyAssignment!.id, bookingId, agencyId: who.agencyId, staffMemberId: who.memberId, actorMemberId: who.memberId, status: "STARTED" },
            });
        }

        const updated = await tx.booking.updateMany({
            where: { id: bookingId, status: "CONFIRMED" },
            data: { status: "IN_PROGRESS", serviceStartedAt: now },
        });
        if (updated.count !== 1) throw new AppError(409, `Service cannot be started from status ${booking.status}`);

        await recordStatus(tx, bookingId, "IN_PROGRESS", { userId: who.userId, role: who.kind }, "Service started");
    });

    notify.bookingUpdated(bookingId);
    return { id: bookingId, status: "IN_PROGRESS" as const };
};

/**
 * Customer requests the completion code (shown in the customer app, read out to
 * the provider at the end of the job). Each call issues a fresh code and
 * invalidates the previous one. Plain code is returned ONLY here, to the customer;
 * only an HMAC is stored.
 */
export const issueCompletionOtp = async (bookingId: number, customerUserId: number) => {
    const code = generateNumericOtp(6);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + env.BOOKING_COMPLETION_OTP_TTL_MINUTES * 60 * 1000);

    await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"booking-otp:" + bookingId}))`;

        const booking = await tx.booking.findUnique({ where: { id: bookingId }, select: { userId: true, status: true } });
        if (!booking || booking.userId !== customerUserId) throw new AppError(404, "Booking not found");
        if (booking.status !== "IN_PROGRESS") throw new AppError(409, "Completion code is available once the service has started");

        const issued = await tx.bookingOTP.count({ where: { bookingId, type: "SERVICE_COMPLETION" } });
        if (issued >= MAX_COMPLETION_OTP_ISSUES) throw new AppError(429, "Completion code limit reached. Please contact support.");

        await tx.bookingOTP.updateMany({
            where: { bookingId, type: "SERVICE_COMPLETION", consumedAt: null },
            data: { consumedAt: now },
        });
        await tx.bookingOTP.create({
            data: {
                bookingId,
                type: "SERVICE_COMPLETION",
                codeHash: hashBookingOtp(bookingId, code),
                expiresAt,
                maxAttempts: MAX_OTP_ATTEMPTS,
                resendCount: issued,
            },
        });
    });

    return { code, expiresAt };
};

export const completeService = async (bookingId: number, who: Performer, code: string) => {
    const now = new Date();

    // ---- 1. Verify OTP outside the main tx so failed attempts are persisted ----
    await prisma.$transaction(async (tx) => {
        await assertPerformer(tx, bookingId, who);
    });

    const otp = await prisma.bookingOTP.findFirst({
        where: { bookingId, type: "SERVICE_COMPLETION", consumedAt: null, verifiedAt: null, expiresAt: { gt: now } },
        orderBy: { createdAt: "desc" },
    });
    if (!otp || otp.attempts >= otp.maxAttempts) {
        throw new AppError(400, "No valid completion code. Ask the customer to generate a new one.");
    }

    if (!verifyBookingOtpHash(bookingId, code, otp.codeHash)) {
        await prisma.bookingOTP.updateMany({
            where: { id: otp.id, consumedAt: null, attempts: { lt: otp.maxAttempts } },
            data: { attempts: { increment: 1 } },
        });
        throw new AppError(400, "Invalid completion code");
    }

    // ---- 2. Consume OTP + complete + settle atomically ----
    const result = await prisma.$transaction(async (tx) => {
        const consumed = await tx.bookingOTP.updateMany({
            where: { id: otp.id, consumedAt: null, verifiedAt: null, expiresAt: { gt: now }, attempts: { lt: otp.maxAttempts } },
            data: { verifiedAt: now, consumedAt: now },
        });
        if (consumed.count !== 1) throw new AppError(409, "Completion code already used");

        const booking = await assertPerformer(tx, bookingId, who);

        const updated = await tx.booking.updateMany({
            where: { id: bookingId, status: "IN_PROGRESS" },
            data: {
                status: "COMPLETED",
                completedAt: now,
                // Q2: cash is collected by the performer at completion
                ...(booking.paymentMethod === "CASH" && { paymentStatus: "PAID", paidAt: now }),
            },
        });
        if (updated.count !== 1) throw new AppError(409, `Booking cannot be completed from status ${booking.status}`);

        if (who.kind === "AGENCY_STAFF") {
            const a = await tx.agencyBookingAssignment.updateMany({
                where: { bookingId, staffMemberId: who.memberId, status: "STARTED" },
                data: { status: "COMPLETED", completedAt: now },
            });
            if (a.count !== 1) throw new AppError(409, "Assignment is not in progress");
            await tx.agencyAssignmentHistory.create({
                data: { assignmentId: booking.agencyAssignment!.id, bookingId, agencyId: who.agencyId, staffMemberId: who.memberId, actorMemberId: who.memberId, status: "COMPLETED" },
            });
            await tx.agency.update({ where: { id: who.agencyId }, data: { completedBookings: { increment: 1 } } });
        } else {
            await tx.providerProfile.update({ where: { id: who.providerId }, data: { completedBookings: { increment: 1 } } });
        }

        await recordStatus(tx, bookingId, "COMPLETED", { userId: who.userId, role: who.kind }, "Completion OTP verified");

        const fresh = await tx.booking.findUniqueOrThrow({ where: { id: bookingId } });
        const settlement = await settleBooking(tx, fresh);
        return { settlement };
    });

    notify.bookingUpdated(bookingId);
    return { id: bookingId, status: "COMPLETED" as const, settlement: result.settlement };
};
