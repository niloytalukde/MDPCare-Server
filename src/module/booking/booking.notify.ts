// =====================================================================
// LIVE NOTIFICATIONS for bookings (Socket.IO)
//
// Rules:
//   - Always send AFTER the database transaction is saved. If sending
//     fails, the booking change is still safe.
//   - Messages only carry ids. The app then loads the details through
//     the normal API, which checks who is allowed to see what.
//
// Events the apps can listen for:
//   "booking:request"          a provider got a new job request
//   "agency:booking-request"   an agency owner got a new job request
//   "booking:update"           a booking's status changed
//   "booking:request-closed"   someone else accepted, or the request closed
//   "agency:assignment"        a staff member was assigned a booking
// =====================================================================

import { prisma } from "../../lib/prisma.js";
import { emitToUsers } from "../../socket/booking.socket.js";
import type { SearchRoundResult } from "./booking-matching.service.js";

// Run a notification in the background; log errors instead of crashing
const runSafely = (work: () => Promise<void>) => {
    work().catch((error) => console.error("[notify]", (error as Error).message));
};

export const notify = {
    // A search round found new providers / agencies
    newRequests(bookingId: number, round: Pick<SearchRoundResult, "round" | "expiresAt" | "providers" | "agencies">) {
        const message = { bookingId, round: round.round, expiresAt: round.expiresAt };

        const providerUserIds = round.providers.map((provider) => provider.userId);
        const agencyOwnerUserIds = round.agencies.map((agency) => agency.userId);

        emitToUsers(providerUserIds, "booking:request", message);
        emitToUsers(agencyOwnerUserIds, "agency:booking-request", message);
    },

    // The booking's status changed: tell everyone involved
    bookingUpdated(bookingId: number) {
        runSafely(async () => {
            const booking = await prisma.booking.findUnique({
                where: { id: bookingId },
                select: {
                    status: true,
                    userId: true,
                    provider: { select: { userId: true } },
                    agencyId: true,
                    agencyAssignment: { select: { staffMember: { select: { userId: true } } } },
                },
            });
            if (!booking) return;

            // agency owners
            let ownerUserIds: number[] = [];
            if (booking.agencyId) {
                const owners = await prisma.agencyMember.findMany({
                    where: { agencyId: booking.agencyId, role: "OWNER", status: "ACTIVE" },
                    select: { userId: true },
                });
                ownerUserIds = owners.map((owner) => owner.userId);
            }

            const everyone = [
                booking.userId, // the customer
                ...(booking.provider ? [booking.provider.userId] : []),
                ...ownerUserIds,
                ...(booking.agencyAssignment ? [booking.agencyAssignment.staffMember.userId] : []),
            ];

            emitToUsers(everyone, "booking:update", { bookingId, status: booking.status });
        });
    },

    // Someone else won, so these people's requests are closed
    requestsClosed(bookingId: number, userIds: number[]) {
        emitToUsers(userIds, "booking:request-closed", { bookingId });
    },

    // A staff member got a new assignment
    assignment(bookingId: number, staffUserId: number, assignmentId: number) {
        emitToUsers([staffUserId], "agency:assignment", { bookingId, assignmentId });
    },
};
