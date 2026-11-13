// =====================================================================
// SHARED PHONE + OTP LOGIN
//
// Used by BOTH apps:
//   - Customer app  -> /api/v1/auth/...           (Auth/auth.services.ts)
//   - Provider app  -> /api/v1/provider/auth/...  (Provider/Auth/provider-auth.service.ts)
//
// How login works (the same for every kind of user):
//   1. App sends the phone number   -> we send an SMS code      (sendLoginOtp)
//   2. App sends phone + code       -> we check the code,
//                                      create the User if new,
//                                      and return 2 tokens       (verifyLoginOtp)
//   3. Access token expires         -> app sends refresh token   (refreshLoginTokens)
//   4. Logout                       -> all tokens stop working   (logoutEverywhere)
//
// "Registration" is just the first successful login: the User row is
// created in step 2. Each app then asks for the extra details it needs
// (customer profile, provider profile or agency profile).
// =====================================================================

import { AppError } from "../../errors/AppError.js";
import { generateTokens } from "../../helper/generateTokens.js";
import { verifyToken, parseUserId } from "../../helper/verifyToken.js";
import { prisma } from "../../lib/prisma.js";
import { sendOTP, verifyOTP } from "../../services/otp.service.js";
import { env } from "../../config/env.js";

// ---------------------------------------------------------------
// Helper: stop blocked / deleted accounts from logging in
// ---------------------------------------------------------------

const checkAccountCanLogin = (accountStatus: string) => {
    if (accountStatus === "BLOCKED") {
        throw new AppError(403, "Your account is blocked. Please contact support.");
    }
    if (accountStatus === "DELETED") {
        throw new AppError(404, "User account not found");
    }
};

// ---------------------------------------------------------------
// 1. Send the OTP code by SMS
// ---------------------------------------------------------------

export const sendLoginOtp = async (phone: string) => {
    const existingUser = await prisma.user.findUnique({
        where: { phone },
        select: { id: true, accountStatus: true },
    });

    if (existingUser) {
        checkAccountCanLogin(existingUser.accountStatus);
    }

    const isNewUser = !existingUser;
    const result = await sendOTP(phone, isNewUser ? "REGISTRATION" : "LOGIN");

    return {
        phone,
        status: result.status,
        isNewUser,
    };
};

// ---------------------------------------------------------------
// 2. Check the OTP code, create the user if needed, give tokens
// ---------------------------------------------------------------

export const verifyLoginOtp = async (phone: string, code: string) => {
    const isCodeCorrect = await verifyOTP(phone, code);
    if (!isCodeCorrect) {
        throw new AppError(400, "Invalid or expired OTP");
    }

    const existingUser = await prisma.user.findUnique({
        where: { phone },
        select: { id: true, accountStatus: true },
    });

    let user;
    if (existingUser) {
        checkAccountCanLogin(existingUser.accountStatus);
        user = await prisma.user.update({
            where: { id: existingUser.id },
            data: { isPhoneVerified: true },
            select: { id: true, tokenVersion: true, accountStatus: true },
        });
    } else {
        // First login = registration
        user = await prisma.user.create({
            data: { phone, isPhoneVerified: true },
            select: { id: true, tokenVersion: true, accountStatus: true },
        });
    }

    if (user.accountStatus !== "ACTIVE") {
        throw new AppError(403, "Your account is not active");
    }

    const tokens = generateTokens(user.id, user.tokenVersion);

    return {
        userId: user.id,
        isNewUser: !existingUser,
        tokens,
    };
};

// ---------------------------------------------------------------
// 3. Get a new pair of tokens with the refresh token
// ---------------------------------------------------------------

export const refreshLoginTokens = async (refreshToken: string) => {
    const decoded = verifyToken(refreshToken, env.JWT_REFRESH_SECRET, "refresh");
    const userId = parseUserId(decoded.sub);

    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, accountStatus: true, isPhoneVerified: true, tokenVersion: true },
    });

    if (!user || user.accountStatus !== "ACTIVE") {
        throw new AppError(401, "User not found or account inactive");
    }
    if (!user.isPhoneVerified) {
        throw new AppError(401, "Phone number is not verified");
    }
    // tokenVersion changes on logout, so old refresh tokens stop working
    if (user.tokenVersion !== decoded.ver) {
        throw new AppError(401, "Session has been revoked. Please log in again.");
    }

    return generateTokens(user.id, user.tokenVersion);
};

// ---------------------------------------------------------------
// 4. Logout from every device
// ---------------------------------------------------------------

export const logoutEverywhere = async (userId: number) => {
    await prisma.user.update({
        where: { id: userId },
        data: { tokenVersion: { increment: 1 } },
    });
    return { message: "Logged out from all devices" };
};

// ---------------------------------------------------------------
// Helper: give a role to a user (does nothing if they already have it)
// ---------------------------------------------------------------

export const giveRole = async (
    userId: number,
    role: "CUSTOMER" | "PROVIDER" | "AGENCY_OWNER" | "AGENCY_STAFF"
) => {
    await prisma.userRole.upsert({
        where: { userId_role: { userId, role } },
        update: {},
        create: { userId, role },
    });
};
