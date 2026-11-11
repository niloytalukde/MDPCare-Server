import jwt from "jsonwebtoken";
import { AppError } from "../errors/AppError.js";

export interface TokenPayload {
    sub: string;
    type: "access" | "refresh";
}

export const verifyToken = (
    token: string,
    secret: string,
    expectedType: "access" | "refresh"
): TokenPayload => {
    try {
        const decoded = jwt.verify(token, secret);

        if (
            typeof decoded === "string" ||
            (decoded as { type?: string }).type !== expectedType ||
            typeof (decoded as { sub?: unknown }).sub !== "string"
        ) {
            throw new AppError(401, "Invalid token");
        }

        return decoded as unknown as TokenPayload;
    } catch (error) {
        if (error instanceof AppError) {
            throw error;
        }
        throw new AppError(401, "Invalid or expired token");
    }
};

export default verifyToken;
