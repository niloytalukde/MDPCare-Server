
import type { Request, Response } from "express";

import catchAsync from "../../utils/catchAsync.js";
import sendResponse from "../../utils/sendResponse.js";

import { AppError } from "../../errors/AppError.js";
import { AuthService } from "./auth.services.js";

// ---------------------------------------------
// 1. Send OTP Controller
// POST /api/v1/auth/send-otp
// ---------------------------------------------

const sendOTP = catchAsync(async (req: Request, res: Response) => {
    const { phone } = req.body;

    const result = await AuthService.sendOTPToPhone({
        phone,
    });

    return sendResponse(res, {
        success: true,
        statusCode: 200,
        message: result.message,
        data: {
            phone: result.phone,
            status: result.status,
        },
    });
});

// ---------------------------------------------
// 2. Verify OTP Controller
// POST /api/v1/auth/verify-otp
// ---------------------------------------------

const verifyOTP = catchAsync(async (req: Request, res: Response) => {
    const { phone, code } = req.body;

    const result = await AuthService.verifyOTPAndRegister({
        phone,
        code,
    });

    return sendResponse(res, {
        success: true,
        statusCode: 200,
        message: result.message,
        data: {
            isNewUser: result.isNewUser,
            needsProfileCompletion: result.needsProfileCompletion,
            user: result.user,
            tokens: {
                accessToken: result.accessToken,
                refreshToken: result.refreshToken,
            },
        },
    });
});

// ---------------------------------------------
// 3. Update Profile Controller
// PATCH /api/v1/auth/profile
// ---------------------------------------------

const updateProfile = catchAsync(async (req: Request, res: Response) => {
    const userId = Number(req.user?.id);

    if (!userId) {
        throw new AppError(401, "Unauthorized access");
    }

    const { name, email, gender } = req.body;

    const result = await AuthService.updateProfile(userId, {
        name,
        email,
        gender,
    });

    return sendResponse(res, {
        success: true,
        statusCode: 200,
        message: result.message,
        data: result.user,
    });
});

// ---------------------------------------------
// 4. Refresh Access Token Controller
// POST /api/v1/auth/refresh-token
// ---------------------------------------------

const refreshAccessToken = catchAsync(
    async (req: Request, res: Response) => {
        const { refreshToken } = req.body;

        if (!refreshToken) {
            throw new AppError(400, "Refresh token is required");
        }

        const result = await AuthService.refreshAccessToken(refreshToken);

        return sendResponse(res, {
            success: true,
            statusCode: 200,
            message: "Access token refreshed successfully",
            data: result,
        });
    }
);

// ---------------------------------------------
// 5. Get My Profile Controller
// GET /api/v1/auth/me
// ---------------------------------------------

const getMyProfile = catchAsync(async (req: Request, res: Response) => {
    const userId = Number(req.user?.id);

    if (!userId) {
        throw new AppError(401, "Unauthorized access");
    }

    const result = await AuthService.getMyProfile(userId);

    return sendResponse(res, {
        success: true,
        statusCode: 200,
        message: "Profile retrieved successfully",
        data: result,
    });
});

// ---------------------------------------------
// Export Controllers
// ---------------------------------------------

export const AuthController = {
    sendOTP,
    verifyOTP,
    updateProfile,
    refreshAccessToken,
    getMyProfile,
};
