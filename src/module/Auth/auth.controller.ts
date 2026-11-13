// =====================================================================
// CUSTOMER APP - login controllers   (mounted at /api/v1/auth)
// =====================================================================

import type { Request, Response } from "express";
import catchAsync from "../../utils/catchAsync.js";
import sendResponse from "../../utils/sendResponse.js";
import { AuthService } from "./auth.services.js";

// POST /api/v1/auth/send-otp      body: { phone }
const sendOTP = catchAsync(async (req: Request, res: Response) => {
    const result = await AuthService.sendOTPToPhone(req.body.phone);

    return sendResponse(res, {
        success: true,
        statusCode: 200,
        message: result.message,
        data: { phone: result.phone, status: result.status, isNewUser: result.isNewUser },
    });
});

// POST /api/v1/auth/verify-otp    body: { phone, code }
const verifyOTP = catchAsync(async (req: Request, res: Response) => {
    const result = await AuthService.verifyOTPAndLogin(req.body.phone, req.body.code);

    return sendResponse(res, {
        success: true,
        statusCode: 200,
        message: result.message,
        data: {
            isNewUser: result.isNewUser,
            needsProfileCompletion: result.needsProfileCompletion,
            user: result.user,
            tokens: result.tokens,
        },
    });
});

// POST /api/v1/auth/refresh-token body: { refreshToken }
const refreshAccessToken = catchAsync(async (req: Request, res: Response) => {
    const tokens = await AuthService.refreshAccessToken(req.body.refreshToken);

    return sendResponse(res, {
        success: true,
        statusCode: 200,
        message: "Access token refreshed successfully",
        data: tokens,
    });
});

// POST /api/v1/auth/logout
const logout = catchAsync(async (req: Request, res: Response) => {
    const result = await AuthService.logout(Number(req.user?.id));

    return sendResponse(res, { success: true, statusCode: 200, message: result.message });
});

export const AuthController = {
    sendOTP,
    verifyOTP,
    refreshAccessToken,
    logout,
};
