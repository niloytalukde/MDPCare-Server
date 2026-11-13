import jwt, { type SignOptions } from "jsonwebtoken";
import { env } from "../config/env.js";

/**
 * Issues an access/refresh token pair.
 *
 * `ver` carries User.tokenVersion. Bumping tokenVersion (logout, block,
 * admin action) invalidates every token issued before it (SEC-04).
 */
export const generateTokens = (userId: number, tokenVersion = 0) => {
    const base: SignOptions = {
        algorithm: "HS256",
        issuer: env.JWT_ISSUER,
        audience: env.JWT_AUDIENCE,
        subject: String(userId),
    };

    const accessToken = jwt.sign(
        { type: "access", ver: tokenVersion },
        env.JWT_ACCESS_SECRET,
        { ...base, expiresIn: env.JWT_ACCESS_EXPIRES_IN as SignOptions["expiresIn"] & {} }
    );

    const refreshToken = jwt.sign(
        { type: "refresh", ver: tokenVersion },
        env.JWT_REFRESH_SECRET,
        { ...base, expiresIn: env.JWT_REFRESH_EXPIRES_IN as SignOptions["expiresIn"] & {} }
    );

    return { accessToken, refreshToken };
};

export default generateTokens;
