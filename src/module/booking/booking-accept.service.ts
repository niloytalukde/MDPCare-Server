import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../errors/AppError.js";
import type { Prisma } from "../../generated/prisma/client.js";
import { recordStatus } from "./booking.service.js";
import { notify } from "./booking.notify.js";

type Tx = Prisma.TransactionClient;
const OPEN = ["SENT", "DELIVERED"] as const;

/**
 * Duplicate-acceptance prevention (BK-01 / rule "never both"):
 *
 * The winning step is ONE conditional UPDATE:
 *   UPDATE "Booking" SET providerId|agencyId = X, status = 'CONFIRMED'
 *   WHERE id = ? AND status = 'SEARCHING_PROVIDER' AND providerId IS NULL AND agencyId IS NULL
 *
 * Under READ COMMITTED, concurrent acceptors block on the row lock; when the first
 * commits, the others re-evaluate the WHERE clause, match 0 rows and get 409.
 * The DB CHECK constraint Booking_single_assignee_chk is the last line of defence.
 */

const closeOtherRequests = async (tx: Tx, bookingId: number, now: Date, except: { providerRequestId?: number; agencyRequestId?: number }) => {
    const losersP = await tx.bookingProvider.findMany({
        where: { bookingId, status: { in: [...OPEN] }, ...(except.providerRequestId && { id: { not: except.providerRequestId } }) },
        select: { provider: { select: { userId: true } } },
    });
    const losersA = await tx.bookingAgency.findMany({
        where: { bookingId, status: { in: [...OPEN] }, ...(except.agencyRequestId && { id: { not: except.agencyRequestId } }) },
        select: { agencyId: true },
    });

    await tx.bookingProvider.updateMany({
        where: { bookingId, status: { in: [...OPEN] }, ...(except.providerRequestId && { id: { not: except.providerRequestId } }) },
        data: { status: "CANCELLED", respondedAt: now },
    });
    await tx.bookingAgency.updateMany({
        where: { bookingId, status: { in: [...OPEN] }, ...(except.agencyRequestId && { id: { not: except.agencyRequestId } }) },
        data: { status: "CANCELLED", respondedAt: now },
    });
    await tx.bookingBroadcastRound.updateMany({
        where: { bookingId, status: "SEARCHING" },
        data: { status: "ACCEPTED", completedAt: now },
    });

    const owners = losersA.length
        ? await tx.agencyMember.findMany({
              where: { agencyId: { in: losersA.map((a) => a.agencyId) }, role: "OWNER", status: "ACTIVE" },
              select: { userId: true },
          })
        : [];
    return [...losersP.map((l) => l.provider.userId), ...owners.map((o) => o.userId)];
};

// ---------------------------------------------------------------
// Individual provider
// ---------------------------------------------------------------

export const providerAccept = async (bookingId: number, provider: { id: number; userId: number }) => {
    const now = new Date();

    const losers = await prisma.$transaction(async (tx) => {
        const req = await tx.bookingProvider.findUnique({
            where: { bookingId_providerId: { bookingId, providerId: provider.id } },
        });
        if (!req) throw new AppError(404, "Booking request not found");
        if (!(OPEN as readonly string[]).includes(req.status)) {
            throw new AppError(409, "This booking request is no longer open");
        }

        const won = await tx.booking.updateMany({
            where: { id: bookingId, status: "SEARCHING_PROVIDER", providerId: null, agencyId: null },
            data: { providerId: provider.id, status: "CONFIRMED", acceptedAt: now },
        });
        if (won.count !== 1) {
            throw new AppError(409, "This booking has already been accepted or is no longer available");
        }

        await tx.bookingProvider.update({ where: { id: req.id }, data: { status: "ACCEPTED", respondedAt: now } });
        const losers = await closeOtherRequests(tx, bookingId, now, { providerRequestId: req.id });
        await tx.providerProfile.update({ where: { id: provider.id }, data: { totalBookings: { increment: 1 } } });
        await recordStatus(tx, bookingId, "CONFIRMED", { userId: provider.userId, role: "PROVIDER" }, "Accepted by provider");
        return losers;
    });

    notify.requestsClosed(bookingId, losers);
    notify.bookingUpdated(bookingId);
    return { id: bookingId, status: "CONFIRMED" as const };
};

export const providerReject = async (bookingId: number, providerId: number) => {
    const res = await prisma.bookingProvider.updateMany({
        where: { bookingId, providerId, status: { in: [...OPEN] } },
        data: { status: "REJECTED", respondedAt: new Date() },
    });
    if (res.count !== 1) throw new AppError(404, "Open booking request not found");
    return { id: bookingId, status: "REJECTED" as const };
};

export const providerRequests = async (providerId: number) =>
    prisma.bookingProvider.findMany({
        where: { providerId, status: { in: [...OPEN] }, booking: { status: "SEARCHING_PROVIDER" } },
        orderBy: { sentAt: "desc" },
        take: 50,
        select: {
            id: true, searchRound: true, distanceKm: true, status: true, sentAt: true,
            booking: {
                select: {
                    id: true, bookingNumber: true, type: true, scheduledAt: true, totalAmount: true, currency: true,
                    estimatedDuration: true, expiresAt: true, paymentMethod: true,
                    items: { select: { serviceName: true, quantity: true, totalPrice: true } },
                },
            },
        },
    });

/** Marks requests as delivered when the provider app fetches them (best effort). */
export const markProviderRequestsDelivered = (providerId: number) =>
    prisma.bookingProvider.updateMany({
        where: { providerId, status: "SENT" },
        data: { status: "DELIVERED", deliveredAt: new Date() },
    });

// ---------------------------------------------------------------
// Agency (owner accepts on behalf of the agency)
// ---------------------------------------------------------------

export const agencyAccept = async (bookingId: number, owner: { userId: number; agencyId: number }) => {
    const now = new Date();

    const losers = await prisma.$transaction(async (tx) => {
        const req = await tx.bookingAgency.findUnique({
            where: { bookingId_agencyId: { bookingId, agencyId: owner.agencyId } },
        });
        if (!req) throw new AppError(404, "Booking request not found");
        if (!(OPEN as readonly string[]).includes(req.status)) {
            throw new AppError(409, "This booking request is no longer open");
        }

        const won = await tx.booking.updateMany({
            where: { id: bookingId, status: "SEARCHING_PROVIDER", providerId: null, agencyId: null },
            data: { agencyId: owner.agencyId, status: "CONFIRMED", acceptedAt: now },
        });
        if (won.count !== 1) {
            throw new AppError(409, "This booking has already been accepted or is no longer available");
        }

        await tx.bookingAgency.update({ where: { id: req.id }, data: { status: "ACCEPTED", respondedAt: now } });
        const losers = await closeOtherRequests(tx, bookingId, now, { agencyRequestId: req.id });
        await tx.agency.update({ where: { id: owner.agencyId }, data: { totalBookings: { increment: 1 } } });
        await recordStatus(tx, bookingId, "CONFIRMED", { userId: owner.userId, role: "AGENCY_OWNER" }, "Accepted by agency; awaiting staff assignment");
        return losers;
    });

    notify.requestsClosed(bookingId, losers);
    notify.bookingUpdated(bookingId);
    return { id: bookingId, status: "CONFIRMED" as const, nextStep: "ASSIGN_STAFF" as const };
};

export const agencyReject = async (bookingId: number, agencyId: number) => {
    const res = await prisma.bookingAgency.updateMany({
        where: { bookingId, agencyId, status: { in: [...OPEN] } },
        data: { status: "REJECTED", respondedAt: new Date() },
    });
    if (res.count !== 1) throw new AppError(404, "Open booking request not found");
    return { id: bookingId, status: "REJECTED" as const };
};

export const agencyRequests = async (agencyId: number) =>
    prisma.bookingAgency.findMany({
        where: { agencyId, status: { in: [...OPEN] }, booking: { status: "SEARCHING_PROVIDER" } },
        orderBy: { sentAt: "desc" },
        take: 50,
        select: {
            id: true, searchRound: true, distanceKm: true, status: true, sentAt: true,
            booking: {
                select: {
                    id: true, bookingNumber: true, type: true, scheduledAt: true, totalAmount: true, currency: true,
                    estimatedDuration: true, expiresAt: true, paymentMethod: true,
                    items: { select: { serviceId: true, serviceName: true, quantity: true, totalPrice: true } },
                },
            },
        },
    });
