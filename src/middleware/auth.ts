import type { Request, Response, NextFunction } from "express";
import { AppError } from "../errors/AppError.js";
import { verifyToken, parseUserId } from "../helper/verifyToken.js";
import { env } from "../config/env.js";
import { prisma } from "../lib/prisma.js";
import type { AuthUser } from "../types/index.js";

/**
 * Resolves a bearer access token to an active user.
 * Exported separately so the Socket.IO handshake can reuse it.
 */
export const authenticateAccessToken = async (token: string): Promise<AuthUser> => {
    const decoded = verifyToken(token, env.JWT_ACCESS_SECRET, "access");
    const userId = parseUserId(decoded.sub);

    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
            id: true,
            phone: true,
            name: true,
            email: true,
            accountStatus: true,
            tokenVersion: true,
            userRoles: { select: { role: true } },
        },
    });

    if (!user) {
        throw new AppError(401, "User belonging to this token no longer exists");
    }

    if (user.tokenVersion !== decoded.ver) {
        throw new AppError(401, "Session has been revoked. Please log in again.");
    }

    if (user.accountStatus !== "ACTIVE") {
        throw new AppError(403, "Your account is not active");
    }

    return {
        id: user.id,
        phone: user.phone,
        name: user.name,
        email: user.email,
        roles: user.userRoles.map((r) => r.role),
        tokenVersion: user.tokenVersion,
    };
};

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

        const token = authHeader.slice("Bearer ".length).trim();

        if (!token) {
            throw new AppError(401, "You are not authorized. Token is missing.");
        }

        req.user = await authenticateAccessToken(token);
        next();
    } catch (error) {
        next(error);
    }
};

export default auth;
