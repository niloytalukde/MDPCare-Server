// =====================================================================
// PROVIDER ONLINE / OFFLINE - business logic
//
//   ONLINE  -> can receive new booking requests (if the location is fresh)
//   OFFLINE -> receives nothing
//
// Only a provider APPROVED and VERIFIED by the admin can go online.
// Location updates while online are in ../location/.
// =====================================================================

import { prisma } from "../../../lib/prisma.js";
import { AppError } from "../../../errors/AppError.js";
import { saveStartingLocation, saveLastLocationAndClear } from "../location/provider-location.service.js";

const findMyProvider = async (userId: number) => {
    const provider = await prisma.providerProfile.findUnique({
        where: { userId },
        select: { id: true, status: true, verificationStatus: true },
    });
    if (!provider) {
        throw new AppError(404, "Provider profile not found. Please register as a provider first.");
    }
    return provider;
};

const statusSelect = {
    id: true,
    availabilityStatus: true,
    isAvailable: true,
    latitude: true,
    longitude: true,
    locationUpdatedAt: true,
    serviceRadiusKm: true,
} as const;

// ---------------------------------------------------------------
// POST /provider/online   { latitude, longitude }
// ---------------------------------------------------------------

export const goOnline = async (userId: number, latitude: number, longitude: number) => {
    const provider = await findMyProvider(userId);

    const isApproved = provider.status === "APPROVED" && provider.verificationStatus === "VERIFIED";
    if (!isApproved) {
        throw new AppError(403, "Your account must be approved and verified before going online");
    }

    // 1. save where they are right now (Redis + database)
    await saveStartingLocation(provider.id, latitude, longitude);

    // 2. switch online
    return prisma.providerProfile.update({
        where: { id: provider.id },
        data: { availabilityStatus: "ONLINE", isAvailable: true },
        select: statusSelect,
    });
};

// ---------------------------------------------------------------
// POST /provider/offline
// ---------------------------------------------------------------

export const goOffline = async (userId: number) => {
    const provider = await findMyProvider(userId);

    // 1. keep the last known location in the database, clear Redis
    await saveLastLocationAndClear(provider.id);

    // 2. switch offline
    return prisma.providerProfile.update({
        where: { id: provider.id },
        data: { availabilityStatus: "OFFLINE", isAvailable: false },
        select: statusSelect,
    });
};
