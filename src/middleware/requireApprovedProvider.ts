import type { Request, Response, NextFunction } from "express";
import { AppError } from "../errors/AppError.js";
import { prisma } from "../lib/prisma.js";

/**
 * Booking actions require an APPROVED + VERIFIED provider (SEC-14, Q8).
 * Sets res.locals.provider = { id, userId }.
 */
export const requireApprovedProvider = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = req.user?.id;
        if (!userId) throw new AppError(401, "Unauthorized access");
        if (!req.user?.roles.includes("PROVIDER")) throw new AppError(403, "Provider access required");

        const provider = await prisma.providerProfile.findUnique({
            where: { userId },
            select: { id: true, userId: true, status: true, verificationStatus: true },
        });
        if (!provider) throw new AppError(403, "Provider access required");
        if (provider.status !== "APPROVED" || provider.verificationStatus !== "VERIFIED") {
            throw new AppError(403, "Your provider account must be approved and verified to handle bookings");
        }

        res.locals.provider = { id: provider.id, userId: provider.userId };
        next();
    } catch (error) {
        next(error);
    }
};

export default requireApprovedProvider;
