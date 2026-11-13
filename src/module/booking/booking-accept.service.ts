// =====================================================================
// STEP 3 - A PROVIDER OR AN AGENCY ACCEPTS THE BOOKING
//
// Many providers and agencies get the same request. Only ONE can win.
//
// How we make sure only one wins (even if two press "Accept" at the
// exact same millisecond):
//
//   UPDATE "Booking"
//   SET    providerId (or agencyId) = me, status = 'CONFIRMED'
//   WHERE  id = ? AND status = 'SEARCHING_PROVIDER'
//          AND providerId IS NULL AND agencyId IS NULL
//
// The database runs these one after another. The first one changes
// 1 row and wins. The second one finds the booking is no longer
// SEARCHING_PROVIDER, changes 0 rows, and gets "409 already accepted".
// A database CHECK rule (Booking_single_assignee_chk) is a final
// safety net: a booking can never have both a provider and an agency.
//
// After an AGENCY accepts, the owner must assign a staff member
// (agency/agency-assignment.service.ts).
// =====================================================================

import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../errors/AppError.js";
import type { Prisma } from "../../generated/prisma/client.js";
import { OPEN_REQUEST_STATUSES, isOpenRequest } from "./booking.constants.js";
import { saveStatusChange } from "./booking-history.js";
import { notify } from "./booking.notify.js";

type Tx = Prisma.TransactionClient;

// The booking fields a provider / agency sees in their "new requests" list
const requestListSelect = {
    id: true,
    searchRound: true,
    distanceKm: true,
    status: true,
    sentAt: true,
    booking: {
        select: {
            id: true,
            bookingNumber: true,
            type: true,
            scheduledAt: true,
            totalAmount: true,
            currency: true,
            estimatedDuration: true,
            expiresAt: true,
            paymentMethod: true,
            items: { select: { serviceId: true, serviceName: true, quantity: true, totalPrice: true } },
        },
    },
} as const;

// ---------------------------------------------------------------
// Helper: after someone wins, close every other open request
// Returns the user ids to tell "this request is closed".
// ---------------------------------------------------------------

const closeOtherRequests = async (
    tx: Tx,
    bookingId: number,
    now: Date,
    winner: { providerRequestId?: number; agencyRequestId?: number }
) => {
    const otherProviderRequests = {
        bookingId,
        status: { in: [...OPEN_REQUEST_STATUSES] },
        ...(winner.providerRequestId && { id: { not: winner.providerRequestId } }),
    };
    const otherAgencyRequests = {
        bookingId,
        status: { in: [...OPEN_REQUEST_STATUSES] },
        ...(winner.agencyRequestId && { id: { not: winner.agencyRequestId } }),
    };

    // 1. who lost? (read BEFORE closing)
    const losingProviders = await tx.bookingProvider.findMany({
        where: otherProviderRequests,
        select: { provider: { select: { userId: true } } },
    });
    const losingAgencies = await tx.bookingAgency.findMany({
        where: otherAgencyRequests,
        select: { agencyId: true },
    });

    // 2. close their requests and the search round
    await tx.bookingProvider.updateMany({
        where: otherProviderRequests,
        data: { status: "CANCELLED", respondedAt: now },
    });
    await tx.bookingAgency.updateMany({
        where: otherAgencyRequests,
        data: { status: "CANCELLED", respondedAt: now },
    });
    await tx.bookingBroadcastRound.updateMany({
        where: { bookingId, status: "SEARCHING" },
        data: { status: "ACCEPTED", completedAt: now },
    });

    // 3. for agencies, we notify the owner
    let losingOwners: { userId: number }[] = [];
    if (losingAgencies.length > 0) {
        losingOwners = await tx.agencyMember.findMany({
            where: {
                agencyId: { in: losingAgencies.map((agency) => agency.agencyId) },
                role: "OWNER",
                status: "ACTIVE",
            },
            select: { userId: true },
        });
    }

    return [...losingProviders.map((p) => p.provider.userId), ...losingOwners.map((o) => o.userId)];
};

// =====================================================================
// INDIVIDUAL PROVIDER
// =====================================================================

// ---------------------------------------------------------------
// Accept
// ---------------------------------------------------------------

export const providerAccept = async (bookingId: number, provider: { id: number; userId: number }) => {
    const now = new Date();

    const losingUserIds = await prisma.$transaction(async (tx) => {
        // 1. was this provider asked, and is the request still open?
        const request = await tx.bookingProvider.findUnique({
            where: { bookingId_providerId: { bookingId, providerId: provider.id } },
        });
        if (!request) {
            throw new AppError(404, "Booking request not found");
        }
        if (!isOpenRequest(request.status)) {
            throw new AppError(409, "This booking request is no longer open");
        }

        // 2. try to win (see the explanation at the top of this file)
        const result = await tx.booking.updateMany({
            where: { id: bookingId, status: "SEARCHING_PROVIDER", providerId: null, agencyId: null },
            data: { providerId: provider.id, status: "CONFIRMED", acceptedAt: now },
        });
        if (result.count !== 1) {
            throw new AppError(409, "This booking has already been accepted or is no longer available");
        }

        // 3. we won: mark our request, close everyone else's
        await tx.bookingProvider.update({
            where: { id: request.id },
            data: { status: "ACCEPTED", respondedAt: now },
        });
        const losers = await closeOtherRequests(tx, bookingId, now, { providerRequestId: request.id });

        await tx.providerProfile.update({
            where: { id: provider.id },
            data: { totalBookings: { increment: 1 } },
        });
        await saveStatusChange(tx, bookingId, "CONFIRMED", { userId: provider.userId, role: "PROVIDER" }, "Accepted by provider");

        return losers;
    });

    // tell everyone (after the transaction is saved)
    notify.requestsClosed(bookingId, losingUserIds);
    notify.bookingUpdated(bookingId);

    return { id: bookingId, status: "CONFIRMED" as const };
};

// ---------------------------------------------------------------
// Reject (only changes this provider's request, not the booking)
// ---------------------------------------------------------------

export const providerReject = async (bookingId: number, providerId: number) => {
    const result = await prisma.bookingProvider.updateMany({
        where: { bookingId, providerId, status: { in: [...OPEN_REQUEST_STATUSES] } },
        data: { status: "REJECTED", respondedAt: new Date() },
    });
    if (result.count !== 1) {
        throw new AppError(404, "Open booking request not found");
    }
    return { id: bookingId, status: "REJECTED" as const };
};

// ---------------------------------------------------------------
// My open requests (the "new jobs" screen of the provider app)
// ---------------------------------------------------------------

export const providerRequests = async (providerId: number) => {
    return prisma.bookingProvider.findMany({
        where: {
            providerId,
            status: { in: [...OPEN_REQUEST_STATUSES] },
            booking: { status: "SEARCHING_PROVIDER" },
        },
        orderBy: { sentAt: "desc" },
        take: 50,
        select: requestListSelect,
    });
};

// When the app downloads the requests, SENT becomes DELIVERED
export const markProviderRequestsDelivered = async (providerId: number) => {
    return prisma.bookingProvider.updateMany({
        where: { providerId, status: "SENT" },
        data: { status: "DELIVERED", deliveredAt: new Date() },
    });
};

// =====================================================================
// AGENCY (the owner accepts for the whole agency)
// =====================================================================

// ---------------------------------------------------------------
// Accept
// ---------------------------------------------------------------

export const agencyAccept = async (bookingId: number, owner: { userId: number; agencyId: number }) => {
    const now = new Date();

    const losingUserIds = await prisma.$transaction(async (tx) => {
        // 1. was this agency asked, and is the request still open?
        const request = await tx.bookingAgency.findUnique({
            where: { bookingId_agencyId: { bookingId, agencyId: owner.agencyId } },
        });
        if (!request) {
            throw new AppError(404, "Booking request not found");
        }
        if (!isOpenRequest(request.status)) {
            throw new AppError(409, "This booking request is no longer open");
        }

        // 2. try to win (see the explanation at the top of this file)
        const result = await tx.booking.updateMany({
            where: { id: bookingId, status: "SEARCHING_PROVIDER", providerId: null, agencyId: null },
            data: { agencyId: owner.agencyId, status: "CONFIRMED", acceptedAt: now },
        });
        if (result.count !== 1) {
            throw new AppError(409, "This booking has already been accepted or is no longer available");
        }

        // 3. we won: mark our request, close everyone else's
        await tx.bookingAgency.update({
            where: { id: request.id },
            data: { status: "ACCEPTED", respondedAt: now },
        });
        const losers = await closeOtherRequests(tx, bookingId, now, { agencyRequestId: request.id });

        await tx.agency.update({
            where: { id: owner.agencyId },
            data: { totalBookings: { increment: 1 } },
        });
        await saveStatusChange(
            tx,
            bookingId,
            "CONFIRMED",
            { userId: owner.userId, role: "AGENCY_OWNER" },
            "Accepted by agency; awaiting staff assignment"
        );

        return losers;
    });

    notify.requestsClosed(bookingId, losingUserIds);
    notify.bookingUpdated(bookingId);

    // the app should now show the "assign staff" screen
    return { id: bookingId, status: "CONFIRMED" as const, nextStep: "ASSIGN_STAFF" as const };
};

// ---------------------------------------------------------------
// Reject
// ---------------------------------------------------------------

export const agencyReject = async (bookingId: number, agencyId: number) => {
    const result = await prisma.bookingAgency.updateMany({
        where: { bookingId, agencyId, status: { in: [...OPEN_REQUEST_STATUSES] } },
        data: { status: "REJECTED", respondedAt: new Date() },
    });
    if (result.count !== 1) {
        throw new AppError(404, "Open booking request not found");
    }
    return { id: bookingId, status: "REJECTED" as const };
};

// ---------------------------------------------------------------
// The agency's open requests
// ---------------------------------------------------------------

export const agencyRequests = async (agencyId: number) => {
    return prisma.bookingAgency.findMany({
        where: {
            agencyId,
            status: { in: [...OPEN_REQUEST_STATUSES] },
            booking: { status: "SEARCHING_PROVIDER" },
        },
        orderBy: { sentAt: "desc" },
        take: 50,
        select: requestListSelect,
    });
};
