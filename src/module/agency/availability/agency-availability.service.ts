// =====================================================================
// AGENCY ONLINE / OFFLINE - business logic
//
//   ONLINE  -> the agency can receive new booking requests
//   OFFLINE -> receives nothing
//
// The agency's location is its office address (set in the agency
// profile), so going online does not need a location.
// Only an agency APPROVED by the admin can go online.
// OWNER or MANAGER can switch it.
// =====================================================================

import { prisma } from "../../../lib/prisma.js";
import { AppError } from "../../../errors/AppError.js";
import { requireAgencyMember } from "../agency.access.js";

const statusSelect = { id: true, availabilityStatus: true, latitude: true, longitude: true } as const;

// POST /agencies/:agencyId/online
export const goOnline = async (userId: number, agencyId: number) => {
    await requireAgencyMember(userId, agencyId, ["OWNER", "MANAGER"]);

    const agency = await prisma.agency.findUniqueOrThrow({
        where: { id: agencyId },
        select: { status: true },
    });
    if (agency.status !== "APPROVED") {
        throw new AppError(403, "Agency must be approved before going online");
    }

    return prisma.agency.update({
        where: { id: agencyId },
        data: { availabilityStatus: "ONLINE" },
        select: statusSelect,
    });
};

// POST /agencies/:agencyId/offline
export const goOffline = async (userId: number, agencyId: number) => {
    await requireAgencyMember(userId, agencyId, ["OWNER", "MANAGER"]);

    return prisma.agency.update({
        where: { id: agencyId },
        data: { availabilityStatus: "OFFLINE" },
        select: statusSelect,
    });
};
