// =====================================================================
// VIEW BOOKINGS - who can see which booking, and how much of it
//
//   Who                                           Sees
//   ───────────────────────────────────────────── ──────────────────────────────
//   the CUSTOMER who made it                      everything + who is coming
//   the PROVIDER who accepted it                  everything + customer contact
//   OWNER / MANAGER of the agency that accepted   everything + customer contact
//   the STAFF member assigned to it               everything + customer contact
//   a provider / agency with an OPEN request      only the JOB (no customer name,
//     (they have not accepted yet)                phone or exact address)
//   an ADMIN                                      everything
//   anyone else                                   404 (we don't reveal it exists)
//
// Contact details are in `contacts` (see booking-contacts.ts).
// =====================================================================

import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../errors/AppError.js";
import type { Prisma } from "../../generated/prisma/client.js";
import type { BookingStatus } from "../../generated/prisma/enums.js";
import { paginationMeta, toSkipTake, type Pagination } from "../../utils/validators.js";
import { isOpenRequest } from "./booking.constants.js";
import { contactsInclude, withContacts, withoutCustomerDetails } from "./booking-contacts.js";

// Everything shown on the booking details screen
const bookingDetailsInclude = {
    ...contactsInclude,
    items: true,
    statusHistory: {
        orderBy: { createdAt: "asc" as const },
        select: { status: true, changedRole: true, note: true, createdAt: true },
    },
    cancellation: true,
} satisfies Prisma.BookingInclude;

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
        return withContacts(booking);
    }

    // ---- an individual provider ----
    const provider = await prisma.providerProfile.findUnique({
        where: { userId: viewer.userId },
        select: { id: true },
    });
    if (provider) {
        if (booking.providerId === provider.id) {
            return withContacts(booking); // they accepted it
        }

        const request = await prisma.bookingProvider.findUnique({
            where: { bookingId_providerId: { bookingId, providerId: provider.id } },
            select: { status: true },
        });
        const hasOpenRequest = request && booking.status === "SEARCHING_PROVIDER" && isOpenRequest(request.status);
        if (hasOpenRequest) {
            return withoutCustomerDetails(booking);
        }
    }

    // ---- someone in an agency ----
    const memberships = await prisma.agencyMember.findMany({
        where: { userId: viewer.userId, status: "ACTIVE" },
        select: { id: true, agencyId: true, role: true },
    });

    for (const membership of memberships) {
        const canManageBookings = membership.role === "OWNER" || membership.role === "MANAGER";

        // owner / manager of the agency that accepted it
        if (booking.agencyId === membership.agencyId && canManageBookings) {
            return withContacts(booking);
        }

        // the staff member assigned to it (only while the assignment is not cancelled)
        const assignment = booking.agencyAssignment;
        const isAssignedStaff = assignment?.staffMember.id === membership.id && assignment.status !== "CANCELLED";
        if (isAssignedStaff) {
            return withContacts(booking);
        }

        // owner / manager of an agency that got an open request
        if (canManageBookings && booking.status === "SEARCHING_PROVIDER") {
            const request = await prisma.bookingAgency.findUnique({
                where: { bookingId_agencyId: { bookingId, agencyId: membership.agencyId } },
                select: { status: true },
            });
            if (request && isOpenRequest(request.status)) {
                return withoutCustomerDetails(booking);
            }
        }
    }

    throw new AppError(404, "Booking not found");
};

// ---------------------------------------------------------------
// Customer: my bookings (newest first, with pages)
// Each booking has contacts.serviceProvider (who is coming).
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
            include: { ...contactsInclude, items: true },
            ...toSkipTake(options),
        }),
        prisma.booking.count({ where }),
    ]);

    return { data: bookings.map(withContacts), meta: paginationMeta(options, total) };
};

// ---------------------------------------------------------------
// Individual provider: my accepted bookings (newest 50)
// Each booking has contacts.customer (who to visit).
// ---------------------------------------------------------------

export const listProviderBookings = async (providerId: number) => {
    const bookings = await prisma.booking.findMany({
        where: { providerId },
        orderBy: { createdAt: "desc" },
        take: 50,
        include: { ...contactsInclude, items: true },
    });

    return bookings.map(withContacts);
};
