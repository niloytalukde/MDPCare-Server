import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../errors/AppError.js";
import type { AgencyMemberRole } from "../../generated/prisma/enums.js";

/**
 * Agency-level access control (cross-agency isolation).
 * Every agency route resolves the caller's membership for the agency in the URL;
 * a user who is not an ACTIVE member of THAT agency gets 404 (no existence leak).
 */
export const requireAgencyMember = async (
    userId: number,
    agencyId: number,
    roles: AgencyMemberRole[] = ["OWNER", "MANAGER", "STAFF"]
) => {
    const member = await prisma.agencyMember.findUnique({
        where: { agencyId_userId: { agencyId, userId } },
        select: { id: true, agencyId: true, role: true, status: true, agency: { select: { status: true } } },
    });

    if (!member || member.status !== "ACTIVE") {
        throw new AppError(404, "Agency not found");
    }
    if (!roles.includes(member.role)) {
        throw new AppError(403, "Only the agency owner can perform this action");
    }
    return member;
};

/** Owner of an APPROVED agency (needed to accept bookings). */
export const requireApprovedAgencyOwner = async (userId: number, agencyId: number) => {
    const member = await requireAgencyMember(userId, agencyId, ["OWNER"]);
    if (member.agency.status !== "APPROVED") {
        throw new AppError(403, "Agency is not approved for bookings yet");
    }
    return member;
};
