import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../errors/AppError.js";
import type { Prisma } from "../../generated/prisma/client.js";
import { notify } from "../booking/booking.notify.js";

type Tx = Prisma.TransactionClient;
const ACTIVE_ASSIGNMENT = ["ASSIGNED", "ACCEPTED", "STARTED"] as const;
const DEFAULT_DURATION_MIN = 60;

/** Time window a booking occupies, used to prevent double-booking a staff member. */
const windowOf = (b: { type: string; scheduledAt: Date | null; acceptedAt: Date | null; createdAt: Date; estimatedDuration: number | null }) => {
    const start = (b.type === "SCHEDULED" && b.scheduledAt) || b.acceptedAt || b.createdAt;
    const end = new Date(start.getTime() + (b.estimatedDuration ?? DEFAULT_DURATION_MIN) * 60_000);
    return { start, end };
};
const overlaps = (a: { start: Date; end: Date }, b: { start: Date; end: Date }) => a.start < b.end && b.start < a.end;

/**
 * Owner assigns (or reassigns) a staff member to a CONFIRMED agency booking.
 *
 * Validations:
 *  - booking belongs to THIS agency and is CONFIRMED (not started)
 *  - staff is an ACTIVE member of THIS agency with an ACTIVE user account
 *  - staff is qualified (AgencyStaffService active) for EVERY booked service
 *  - staff has no overlapping active assignment
 *  - one current assignment per booking (DB unique on bookingId); a STARTED or
 *    COMPLETED assignment can't be reassigned
 * Every change is appended to AgencyAssignmentHistory.
 */
export const assignStaff = async (
    agencyId: number,
    bookingId: number,
    owner: { memberId: number },
    input: { staffMemberId: number; notes?: string | undefined }
) => {
    const now = new Date();

    const { assignment, staffUserId } = await prisma.$transaction(async (tx: Tx) => {
        // Serialize assignment changes per booking and per staff member
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"assign:booking:" + bookingId}))`;
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"assign:staff:" + input.staffMemberId}))`;

        const booking = await tx.booking.findUnique({
            where: { id: bookingId },
            include: { items: { select: { serviceId: true } }, agencyAssignment: true },
        });
        if (!booking || booking.agencyId !== agencyId) throw new AppError(404, "Booking not found");
        if (booking.status !== "CONFIRMED") throw new AppError(409, `Staff can't be assigned while booking is ${booking.status}`);

        const staff = await tx.agencyMember.findFirst({
            where: { id: input.staffMemberId, agencyId, status: "ACTIVE", user: { accountStatus: "ACTIVE" } },
            select: { id: true, userId: true, services: { where: { isActive: true }, select: { serviceId: true } } },
        });
        if (!staff) throw new AppError(400, "Staff member must be an active member of this agency");

        const qualified = new Set(staff.services.map((s) => s.serviceId));
        const missing = booking.items.map((i) => i.serviceId).filter((id) => !qualified.has(id));
        if (missing.length) throw new AppError(400, "Staff member is not qualified for all services in this booking");

        // Double-booking check
        const others = await tx.agencyBookingAssignment.findMany({
            where: { staffMemberId: staff.id, status: { in: [...ACTIVE_ASSIGNMENT] }, bookingId: { not: bookingId } },
            select: { booking: { select: { type: true, scheduledAt: true, acceptedAt: true, createdAt: true, estimatedDuration: true } } },
        });
        const mine = windowOf(booking);
        if (others.some((o) => overlaps(mine, windowOf(o.booking)))) {
            throw new AppError(409, "Staff member already has an overlapping assignment");
        }

        const current = booking.agencyAssignment;
        let assignment;

        if (!current) {
            assignment = await tx.agencyBookingAssignment.create({
                data: { bookingId, agencyId, staffMemberId: staff.id, assignedById: owner.memberId, status: "ASSIGNED", assignedAt: now, notes: input.notes ?? null },
            });
        } else {
            if (current.staffMemberId === staff.id && ["ASSIGNED", "ACCEPTED"].includes(current.status)) {
                throw new AppError(409, "This staff member is already assigned to the booking");
            }
            // Only reassign before work starts
            const res = await tx.agencyBookingAssignment.updateMany({
                where: { id: current.id, status: { in: ["ASSIGNED", "ACCEPTED", "REJECTED", "CANCELLED", "REASSIGNED"] } },
                data: {
                    staffMemberId: staff.id, assignedById: owner.memberId, status: "ASSIGNED", assignedAt: now,
                    acceptedAt: null, startedAt: null, rejectionReason: null, notes: input.notes ?? null,
                },
            });
            if (res.count !== 1) throw new AppError(409, "Assignment can't be changed after the service has started");

            await tx.agencyAssignmentHistory.create({
                data: { assignmentId: current.id, bookingId, agencyId, staffMemberId: current.staffMemberId, actorMemberId: owner.memberId, status: "REASSIGNED", note: `Reassigned to member ${staff.id}` },
            });
            assignment = await tx.agencyBookingAssignment.findUniqueOrThrow({ where: { id: current.id } });
        }

        await tx.agencyAssignmentHistory.create({
            data: { assignmentId: assignment.id, bookingId, agencyId, staffMemberId: staff.id, actorMemberId: owner.memberId, status: "ASSIGNED", note: input.notes ?? null },
        });

        return { assignment, staffUserId: staff.userId };
    });

    notify.assignment(bookingId, staffUserId, assignment.id);
    notify.bookingUpdated(bookingId);
    return assignment;
};

/** Resolves an assignment for the calling staff user (cross-agency safe). */
const myAssignment = async (tx: Tx, userId: number, assignmentId: number) => {
    const a = await tx.agencyBookingAssignment.findUnique({
        where: { id: assignmentId },
        include: { staffMember: { select: { id: true, userId: true, status: true, agencyId: true } } },
    });
    if (!a || a.staffMember.userId !== userId || a.staffMember.status !== "ACTIVE") {
        throw new AppError(404, "Assignment not found");
    }
    return a;
};

export const respondToAssignment = async (
    userId: number,
    assignmentId: number,
    decision: "ACCEPT" | "REJECT",
    reason?: string
) => {
    const now = new Date();
    const result = await prisma.$transaction(async (tx) => {
        const a = await myAssignment(tx, userId, assignmentId);
        const next = decision === "ACCEPT" ? "ACCEPTED" : "REJECTED";

        const res = await tx.agencyBookingAssignment.updateMany({
            where: { id: a.id, status: "ASSIGNED", staffMemberId: a.staffMember.id },
            data: decision === "ACCEPT" ? { status: "ACCEPTED", acceptedAt: now } : { status: "REJECTED", rejectionReason: reason ?? null },
        });
        if (res.count !== 1) throw new AppError(409, "This assignment is no longer awaiting your response");

        await tx.agencyAssignmentHistory.create({
            data: { assignmentId: a.id, bookingId: a.bookingId, agencyId: a.agencyId, staffMemberId: a.staffMember.id, actorMemberId: a.staffMember.id, status: next, note: reason ?? null },
        });
        return { bookingId: a.bookingId, status: next };
    });

    notify.bookingUpdated(result.bookingId);
    return { id: assignmentId, ...result };
};

/** Resolves the performer identity used by booking start/complete for an assignment. */
export const performerForAssignment = async (userId: number, assignmentId: number) => {
    const a = await myAssignment(prisma as unknown as Tx, userId, assignmentId);
    return {
        bookingId: a.bookingId,
        performer: { kind: "AGENCY_STAFF" as const, userId, memberId: a.staffMember.id, agencyId: a.agencyId },
    };
};

export const listMyAssignments = async (userId: number) =>
    prisma.agencyBookingAssignment.findMany({
        where: { staffMember: { userId, status: "ACTIVE" }, status: { in: [...ACTIVE_ASSIGNMENT] } },
        orderBy: { assignedAt: "desc" },
        select: {
            id: true, status: true, assignedAt: true, acceptedAt: true, startedAt: true, notes: true, agencyId: true,
            booking: {
                select: {
                    id: true, bookingNumber: true, status: true, type: true, scheduledAt: true, fullAddress: true, landmark: true,
                    latitude: true, longitude: true, customerName: true, customerPhone: true, estimatedDuration: true,
                    items: { select: { serviceName: true, quantity: true } },
                    user: { select: { name: true, phone: true } },
                },
            },
        },
    });

export const listAgencyBookings = async (agencyId: number, take = 50) =>
    prisma.booking.findMany({
        where: { agencyId },
        orderBy: { createdAt: "desc" },
        take,
        include: {
            items: true,
            agencyAssignment: { select: { id: true, status: true, staffMember: { select: { id: true, displayName: true } } } },
        },
    });

export const assignmentHistory = async (agencyId: number, bookingId: number) =>
    prisma.agencyAssignmentHistory.findMany({
        where: { agencyId, bookingId },
        orderBy: { createdAt: "asc" },
    });
