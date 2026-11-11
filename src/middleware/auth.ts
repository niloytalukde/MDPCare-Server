import type { Request, Response, NextFunction } from "express";
import { AppError } from "../errors/AppError.js";
import { verifyToken } from "../helper/verifyToken.js";
import { env } from "../config/env.js";
import { prisma } from "../lib/prisma.js";

export const auth = async (
    req: Request,
    _res: Response,
    next: NextFunction
): Promise<void> => {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            throw new AppError(401, "You are not authorized. No token provided.");
        }

        const token = authHeader.split(" ")[1];

        if (!token) {
            throw new AppError(401, "You are not authorized. Token is missing.");
        }

        const decoded = verifyToken(
            token,
            env.JWT_ACCESS_SECRET,
            "access"
        );

        const userId = Number(decoded.sub);

        if (!Number.isSafeInteger(userId) || userId <= 0) {
            throw new AppError(401, "Invalid token payload");
        }

        // Verify user exists and is active
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: {
                id: true,
                phone: true,
                name: true,
                email: true,
                accountStatus: true,
            },
        });

        if (!user) {
            throw new AppError(401, "User belonging to this token no longer exists");
        }

        if (user.accountStatus !== "ACTIVE") {
            throw new AppError(403, "Your account is not active");
        }

        req.user = {
            id: user.id,
            phone: user.phone,
            name: user.name,
            email: user.email,
        };

        next();
    } catch (error) {
        next(error);
    }
};

export default auth;
