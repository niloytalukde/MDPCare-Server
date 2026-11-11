import { AppError } from "../../errors/AppError.js";
import { generateTokens } from "../../helper/generateTokens.js";
import { verifyToken } from "../../helper/verifyToken.js";
import { prisma } from "../../lib/prisma.js";
import { sendOTP, verifyOTP } from "../../services/otp.service.js";
import { env } from "../../config/env.js";

// ---------------------------------------------
// Types
// ---------------------------------------------

interface SendOTPInput {
    phone: string;
}

interface VerifyOTPInput {
    phone: string;
    code: string;
}

interface UpdateProfileInput {
    name: string;
    email?: string | null;
    gender?: string | null;
}

// ---------------------------------------------
// Safe User Response
// ---------------------------------------------

const userSelect = {
    id: true,
    phone: true,
    name: true,
    email: true,
    gender: true,
    isPhoneVerified: true,
    isEmailVerified: true,
    accountStatus: true,
    createdAt: true,
    updatedAt: true,
} as const;

// ---------------------------------------------
// 1. Send OTP
// ---------------------------------------------
const sendOTPToPhone = async (payload: SendOTPInput) => {
    const phone = payload.phone?.trim();

    if (!phone) {
        throw new AppError(400, "Phone number is required");
    }

    // Check whether this phone already has an account.
    const existingUser = await prisma.user.findUnique({
        where: { phone },
        select: { id: true, accountStatus: true },
    });

    if (existingUser) {
        if (existingUser.accountStatus === "BLOCKED") {
            throw new AppError(403, "Your account is blocked. Please contact support.");
        }
        if (existingUser.accountStatus === "DELETED") {
            throw new AppError(404, "User account not found");
        }
    }

    const result = await sendOTP(phone);

    return {
        phone,
        status: result.status,
        message: existingUser ? "Login OTP sent successfully" : "Registration OTP sent successfully",
    };
};

// ---------------------------------------------
// 2. Verify OTP + Create/Login User
// ---------------------------------------------

const verifyOTPAndRegister = async (payload: VerifyOTPInput) => {
    const phone = payload.phone?.trim();
    const code = payload.code?.trim();

    if (!phone || !code) {
        throw new AppError(400, "Phone number and OTP code are required");
    }

    const isVerified = await verifyOTP(phone, code);

    if (!isVerified) {
        throw new AppError(400, "Invalid OTP code");
    }

    // Check existing user
    const existingUser = await prisma.user.findUnique({
        where: { phone },
    });

    let user;

    if (existingUser) {
        if (existingUser.accountStatus !== "ACTIVE") {
            throw new AppError(403, "Your account is not active");
        }

        user = await prisma.user.update({
            where: { id: existingUser.id },
            data: { isPhoneVerified: true },
        });
    } else {
        user = await prisma.user.create({
            data: {
                phone,
                isPhoneVerified: true,
            },
        });
    }

    if (user.accountStatus !== "ACTIVE") {
        throw new AppError(403, "Your account is not active");
    }

    const tokens = generateTokens(user.id);

    return {
        message: "Phone verified successfully",
        isNewUser: !existingUser,
        needsProfileCompletion: !user.name,
        user: await prisma.user.findUniqueOrThrow({
            where: { id: user.id },
            select: userSelect,
        }),
        ...tokens,
    };
};

// ---------------------------------------------
// 3. Update User Profile
// ---------------------------------------------

const updateProfile = async (
    userId: number,
    payload: UpdateProfileInput
) => {
    const name = payload.name?.trim();

    if (!name) {
        throw new AppError(400, "Name is required");
    }

    let email = payload.email;
    if (email) {
        email = email.trim().toLowerCase();
    }

    const user = await prisma.user.update({
        where: { id: userId },
        data: {
            name,
            ...(payload.email !== undefined && {
                email: email || null,
            }),
            ...(payload.gender !== undefined && {
                gender: payload.gender,
            }),
        },
        select: userSelect,
    });

    return {
        message: "Profile updated successfully",
        user,
    };
};

// ---------------------------------------------
// 4. Refresh Access Token
// ---------------------------------------------

const refreshAccessToken = async (refreshToken: string) => {
    const refreshSecret = env.JWT_REFRESH_SECRET;

    if (!refreshSecret) {
        throw new Error("JWT_REFRESH_SECRET is not configured");
    }

    const decoded = verifyToken(
        refreshToken,
        refreshSecret,
        "refresh"
    );

    const userId = Number(decoded.sub);

    if (!Number.isSafeInteger(userId) || userId <= 0) {
        throw new AppError(401, "Invalid refresh token");
    }

    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
            id: true,
            accountStatus: true,
            isPhoneVerified: true,
        },
    });

    if (!user || user.accountStatus !== "ACTIVE") {
        throw new AppError(401, "User not found or account inactive");
    }

    if (!user.isPhoneVerified) {
        throw new AppError(401, "Phone number is not verified");
    }

    const tokens = generateTokens(user.id);

    return tokens;
};

// ---------------------------------------------
// 5. Get Current User
// ---------------------------------------------

const getMyProfile = async (userId: number) => {
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: userSelect,
    });

    if (!user) {
        throw new AppError(404, "User not found");
    }

    return user;
};

// ---------------------------------------------
// Export Services
// ---------------------------------------------

export const AuthService = {
    sendOTPToPhone,
    verifyOTPAndRegister,
    updateProfile,
    refreshAccessToken,
    getMyProfile,
};
