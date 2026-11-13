import { prisma } from "../../lib/prisma.js";
import { emitToUsers } from "../../socket/booking.socket.js";
import type { BroadcastResult } from "./booking-matching.service.js";

/**
 * Notifications are best-effort and run AFTER the transaction commits, so a
 * socket failure can never roll back a booking change. Payloads carry ids only;
 * clients fetch details through the authorized REST endpoints.
 */
const safe = (fn: () => Promise<void>) => {
    fn().catch((err) => console.error("[notify]", (err as Error).message));
};

export const notify = {
    newRequests(bookingId: number, b: Pick<BroadcastResult, "round" | "expiresAt" | "providers" | "agencies">) {
        const payload = { bookingId, round: b.round, expiresAt: b.expiresAt };
        emitToUsers(b.providers.map((p) => p.userId), "booking:request", payload);
        emitToUsers(b.agencies.map((a) => a.userId), "agency:booking-request", payload);
    },

    bookingUpdated(bookingId: number) {
        safe(async () => {
            const b = await prisma.booking.findUnique({
                where: { id: bookingId },
                select: {
                    status: true,
                    userId: true,
                    provider: { select: { userId: true } },
                    agencyId: true,
                    agencyAssignment: { select: { staffMember: { select: { userId: true } } } },
                },
            });
            if (!b) return;
            const owners = b.agencyId
                ? await prisma.agencyMember.findMany({
                      where: { agencyId: b.agencyId, role: "OWNER", status: "ACTIVE" },
                      select: { userId: true },
                  })
                : [];
            const recipients = [
                b.userId,
                ...(b.provider ? [b.provider.userId] : []),
                ...owners.map((o) => o.userId),
                ...(b.agencyAssignment ? [b.agencyAssignment.staffMember.userId] : []),
            ];
            emitToUsers(recipients, "booking:update", { bookingId, status: b.status });
        });
    },

    requestsClosed(bookingId: number, userIds: number[]) {
        emitToUsers(userIds, "booking:request-closed", { bookingId });
    },

    assignment(bookingId: number, staffUserId: number, assignmentId: number) {
        emitToUsers([staffUserId], "agency:assignment", { bookingId, assignmentId });
    },
};
