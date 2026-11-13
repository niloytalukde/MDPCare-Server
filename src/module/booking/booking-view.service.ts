// =====================================================================
// VIEW BOOKINGS - who can see which booking
//
// A person can see a booking if they are:
//   - the CUSTOMER who made it
//   - the PROVIDER who accepted it
//   - the OWNER of the agency that accepted it
//   - the STAFF member assigned to it
//   - a provider / agency owner who got an OPEN request for it
//     (they see the job, but NOT the customer's name, phone or address
//      until they accept)
//   - an ADMIN
// Anyone else gets 404, so we don't even reveal the booking exists.
// =====================================================================

import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../errors/AppError.js";
import type { Prisma } from "../../generated/prisma/client.js";
import type { BookingStatus } from "../../generated/prisma/enums.js";
import { paginationMeta, toSkipTake, type Pagination } from "../../utils/validators.js";
import { isOpenRequest } from "./booking.constants.js";

// Everything shown on the booking details screen
const bookingDetailsInclude = {
    items: true,
    provider: {
        select: { id: true, displayName: true, averageRating: true, user: { select: { name: true, phone: true } } },
    },
    agency: { select: { id: true, name: true, phone: true, averageRating: true } },
    agencyAssignment: {
        select: {
            id: true,
            status: true,
            assignedAt: true,
            acceptedAt: true,
            startedAt: true,
            completedAt: true,
            staffMember: { select: { id: true, displayName: true, user: { select: { name: true, phone: true } } } },
        },
    },
    statusHistory: {
        orderBy: { createdAt: "asc" as const },
        select: { status: true, changedRole: true, note: true, createdAt: true },
    },
    cancellation: true,
} satisfies Prisma.BookingInclude;

// Hide the customer's private details from people who only got a request
const hideCustomerDetails = <
    T extends { customerName: string | null; customerPhone: string | null; fullAddress: string; landmark: string | null },
>(
    booking: T
) => ({
    ...booking,
    customerName: null,
    customerPhone: null,
    fullAddress: "Shared after acceptance",
    landmark: null,
});

// ---------------------------------------------------------------
// One booking (with the "who can see it" check)
// ---------------------------------------------------------------

export const getBookingForUser = async (bookingId: number, viewer: { userId: number; isAdmin: boolean }) => {
    const booking = await prisma.booking.findUnique({
        where: { id: bookingId },
        include: bookingDetailsInclude,
    });
    if (!booking) {
        throw new AppError(404, "Booking not found");
    }

    // ---- admin, or the customer ----
    if (viewer.isAdmin || booking.userId === viewer.userId) {
        return booking;
    }

    // ---- an individual provider ----
    const provider = await prisma.providerProfile.findUnique({
        where: { userId: viewer.userId },
        select: { id: true },
    });
    if (provider) {
        if (booking.providerId === provider.id) {
            return booking; // they accepted it
        }

        const request = await prisma.bookingProvider.findUnique({
            where: { bookingId_providerId: { bookingId, providerId: provider.id } },
            select: { status: true },
        });
        const hasOpenRequest = request && booking.status === "SEARCHING_PROVIDER" && isOpenRequest(request.status);
        if (hasOpenRequest) {
            return hideCustomerDetails(booking);
        }
    }

    // ---- someone in an agency ----
    const memberships = await prisma.agencyMember.findMany({
        where: { userId: viewer.userId, status: "ACTIVE" },
        select: { id: true, agencyId: true, role: true },
    });

    for (const membership of memberships) {
        const isOwnerOfAcceptingAgency = booking.agencyId === membership.agencyId && membership.role === "OWNER";
        if (isOwnerOfAcceptingAgency) {
            return booking;
        }

        const isAssignedStaff = booking.agencyAssignment?.staffMember.id === membership.id;
        if (isAssignedStaff) {
            return booking;
        }

        if (membership.role === "OWNER" && booking.status === "SEARCHING_PROVIDER") {
            const request = await prisma.bookingAgency.findUnique({
                where: { bookingId_agencyId: { bookingId, agencyId: membership.agencyId } },
                select: { status: true },
            });
            if (request && isOpenRequest(request.status)) {
                return hideCustomerDetails(booking);
            }
        }
    }

    throw new AppError(404, "Booking not found");
};

// ---------------------------------------------------------------
// Customer: my bookings (newest first, with pages)
// ---------------------------------------------------------------

export const listCustomerBookings = async (userId: number, options: Pagination & { status?: BookingStatus | undefined }) => {
    const where: Prisma.BookingWhereInput = {
        userId,
        ...(options.status && { status: options.status }),
    };

    const [bookings, total] = await prisma.$transaction([
        prisma.booking.findMany({
            where,
            orderBy: { createdAt: "desc" },
            include: {
                items: true,
                provider: { select: { id: true, displayName: true } },
                agency: { select: { id: true, name: true } },
            },
            ...toSkipTake(options),
        }),
        prisma.booking.count({ where }),
    ]);

    return { data: bookings, meta: paginationMeta(options, total) };
};

// ---------------------------------------------------------------
// Individual provider: my accepted bookings (newest 50)
// ---------------------------------------------------------------

export const listProviderBookings = async (providerId: number) => {
    return prisma.booking.findMany({
        where: { providerId },
        orderBy: { createdAt: "desc" },
        take: 50,
        include: { items: true },
    });
};
