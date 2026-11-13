
import type { Request, Response, NextFunction } from "express";
import { AppError } from "../errors/AppError.js";
import { prisma } from "../lib/prisma.js";

export const providerAuth = async (
    req: Request,
    _res: Response,
    next: NextFunction
): Promise<void> => {
    try {
        const userId = Number(req.user?.id);

        if (!Number.isSafeInteger(userId) || userId <= 0) {
            throw new AppError(401, "Unauthorized access");
        }

        const provider = await prisma.providerProfile.findUnique({
            where: { userId },
            select: {
                id: true,
                status: true,
                user: {
                    select: {
                        userRoles: {
                            where: { role: "PROVIDER" },
                            select: { id: true },
                        },
                    },
                },
            },
        });

        if (!provider || !provider.user.userRoles.length) {
            throw new AppError(403, "Provider access required");
        }

        // Approval is not required for onboarding/profile APIs.
        // Booking APIs must separately require APPROVED + VERIFIED.
        next();
    } catch (error) {
        next(error);
    }
};

export default providerAuth;
