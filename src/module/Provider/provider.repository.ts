import { prisma } from "../../lib/prisma.js";

export const findProviderByUserId = (userId: number) =>
    prisma.providerProfile.findUnique({
        where: { userId },
        select: { id: true, userId: true, status: true, verificationStatus: true, availabilityStatus: true },
    });
