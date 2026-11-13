// =====================================================================
// CANCEL A BOOKING
//
//   CUSTOMER -> can cancel while PENDING, SEARCHING_PROVIDER or CONFIRMED
//   ADMIN    -> can also cancel while IN_PROGRESS
//   Nobody   -> can cancel a COMPLETED, CANCELLED or EXPIRED booking
//
// Everything below happens in ONE transaction (all or nothing).
// =====================================================================

import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../errors/AppError.js";
import { ADMIN_CAN_CANCEL, CUSTOMER_CAN_CANCEL, OPEN_REQUEST_STATUSES } from "./booking.constants.js";
import { saveStatusChange } from "./booking-history.js";
import { notify } from "./booking.notify.js";

export interface CancelledBy {
    userId: number;
    kind: "CUSTOMER" | "ADMIN";
}

export const cancelBooking = async (bookingId: number, cancelledBy: CancelledBy, reason?: string) => {
    const allowedStatuses = cancelledBy.kind === "ADMIN" ? ADMIN_CAN_CANCEL : CUSTOMER_CAN_CANCEL;
    const now = new Date();

    const result = await prisma.$transaction(async (tx) => {
        // ---- 1. find the booking (a customer can only cancel their own) ----
        const booking = await tx.booking.findUnique({
            where: { id: bookingId },
            include: { agencyAssignment: true },
        });
        const isOtherCustomersBooking = cancelledBy.kind === "CUSTOMER" && booking?.userId !== cancelledBy.userId;
        if (!booking || isOtherCustomersBooking) {
            throw new AppError(404, "Booking not found");
        }

        // ---- 2. change the status, ONLY if it is still allowed ----
        // (if a provider accepts / starts at the same moment, only one wins)
        const updateResult = await tx.booking.updateMany({
            where: { id: bookingId, status: { in: allowedStatuses } },
            data: { status: "CANCELLED", cancelledAt: now },
        });
        if (updateResult.count !== 1) {
            throw new AppError(409, `Booking cannot be cancelled in its current status (${booking.status})`);
        }

        // ---- 3. save who cancelled and why ----
        await tx.bookingCancellation.create({
            data: { bookingId, actor: cancelledBy.kind, actorId: cancelledBy.userId, reason: reason ?? null },
        });

        // ---- 4. close everything that was still open ----
        await tx.bookingProvider.updateMany({
            where: { bookingId, status: { in: [...OPEN_REQUEST_STATUSES] } },
            data: { status: "CANCELLED", respondedAt: now },
        });
        await tx.bookingAgency.updateMany({
            where: { bookingId, status: { in: [...OPEN_REQUEST_STATUSES] } },
            data: { status: "CANCELLED", respondedAt: now },
        });
        await tx.bookingBroadcastRound.updateMany({
            where: { bookingId, status: "SEARCHING" },
            data: { status: "CANCELLED", completedAt: now },
        });
        await tx.bookingOTP.updateMany({
            where: { bookingId, consumedAt: null },
            data: { consumedAt: now },
        });

        // ---- 5. agency booking: cancel the staff assignment too ----
        const assignment = booking.agencyAssignment;
        const assignmentStillActive = assignment && !["COMPLETED", "CANCELLED"].includes(assignment.status);
        if (assignment && assignmentStillActive) {
            await tx.agencyBookingAssignment.update({
                where: { id: assignment.id },
                data: { status: "CANCELLED", cancelledAt: now },
            });
            await tx.agencyAssignmentHistory.create({
                data: {
                    assignmentId: assignment.id,
                    bookingId,
                    agencyId: assignment.agencyId,
                    staffMemberId: assignment.staffMemberId,
                    actorMemberId: null,
                    status: "CANCELLED",
                    note: `Booking cancelled by ${cancelledBy.kind}`,
                },
            });
        }

        // ---- 6. counters ----
        if (booking.providerId) {
            await tx.providerProfile.update({
                where: { id: booking.providerId },
                data: { cancelledBookings: { increment: 1 } },
            });
        }
        if (booking.agencyId) {
            await tx.agency.update({
                where: { id: booking.agencyId },
                data: { cancelledBookings: { increment: 1 } },
            });
        }

        await saveStatusChange(tx, bookingId, "CANCELLED", { userId: cancelledBy.userId, role: cancelledBy.kind }, reason);

        // No payment gateway yet: an online booking that was already PAID
        // must be refunded by hand, so we flag it.
        const needsManualRefund = booking.paymentMethod === "ONLINE" && booking.paymentStatus === "PAID";
        return { needsManualRefund };
    });

    notify.bookingUpdated(bookingId);
    return { id: bookingId, status: "CANCELLED" as const, needsManualRefund: result.needsManualRefund };
};
