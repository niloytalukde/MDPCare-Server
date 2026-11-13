// =====================================================================
// BOOKING HISTORY - save every status change
//
// Every time a booking's status changes we ADD a row to
// BookingStatusHistory (we never edit or delete these rows).
// The customer app shows this list as the booking "timeline".
// =====================================================================

import type { Prisma } from "../../generated/prisma/client.js";
import type { BookingStatus } from "../../generated/prisma/enums.js";

// Who made the change
export interface StatusChangedBy {
    userId?: number | null; // empty when the SYSTEM did it (e.g. the expiry job)
    role: string; // "CUSTOMER", "PROVIDER", "AGENCY_OWNER", "AGENCY_STAFF", "ADMIN" or "SYSTEM"
}

// Must be called INSIDE the same transaction that changes the status,
// so the history can never be out of sync with the booking.
export const saveStatusChange = (
    tx: Prisma.TransactionClient,
    bookingId: number,
    newStatus: BookingStatus,
    changedBy: StatusChangedBy,
    note?: string
) => {
    return tx.bookingStatusHistory.create({
        data: {
            bookingId,
            status: newStatus,
            changedBy: changedBy.userId ?? null,
            changedRole: changedBy.role,
            note: note ?? null,
        },
    });
};
