import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

export const generateTokens = (userId: number) => {
    const accessSecret = env.JWT_ACCESS_SECRET;
    const refreshSecret = env.JWT_REFRESH_SECRET;

    if (!accessSecret || !refreshSecret) {
        throw new Error("JWT secrets are not configured");
    }

    const payload = {
        sub: String(userId),
    };

    const accessToken = jwt.sign(
        { ...payload, type: "access" },
        accessSecret,
        { expiresIn: "15m" }
    );

    const refreshToken = jwt.sign(
        { ...payload, type: "refresh" },
        refreshSecret,
        { expiresIn: "30d" }
    );

    return {
        accessToken,
        refreshToken,
    };
};

export default generateTokens;
