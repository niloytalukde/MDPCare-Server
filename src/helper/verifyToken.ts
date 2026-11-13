import jwt from "jsonwebtoken";
import { AppError } from "../errors/AppError.js";
import { env } from "../config/env.js";

export interface TokenPayload {
    sub: string;
    type: "access" | "refresh";
    ver: number;
}

export const verifyToken = (
    token: string,
    secret: string,
    expectedType: "access" | "refresh"
): TokenPayload => {
    let decoded: unknown;
    try {
        decoded = jwt.verify(token, secret, {
            algorithms: ["HS256"],
            issuer: env.JWT_ISSUER,
            audience: env.JWT_AUDIENCE,
        });
    } catch {
        throw new AppError(401, "Invalid or expired token");
    }

    const payload = decoded as Partial<TokenPayload> | string;

    if (
        typeof payload === "string" ||
        payload.type !== expectedType ||
        typeof payload.sub !== "string" ||
        typeof payload.ver !== "number"
    ) {
        throw new AppError(401, "Invalid token");
    }

    return payload as TokenPayload;
};

export const parseUserId = (sub: string): number => {
    const userId = Number(sub);
    if (!Number.isSafeInteger(userId) || userId <= 0) {
        throw new AppError(401, "Invalid token payload");
    }
    return userId;
};

export default verifyToken;
