// =====================================================================
// PROVIDER APP - login controllers   (mounted at /api/v1/provider/auth)
// =====================================================================

import type { Request, Response } from "express";
import catchAsync from "../../../utils/catchAsync.js";
import sendResponse from "../../../utils/sendResponse.js";
import { ProviderAuthService } from "./provider-auth.service.js";

// POST /api/v1/provider/auth/send-otp     body: { phone }
const sendOTP = catchAsync(async (req: Request, res: Response) => {
    const result = await ProviderAuthService.sendProviderOTP(req.body.phone);

    return sendResponse(res, {
        success: true,
        statusCode: 200,
        message: result.message,
        data: { phone: result.phone, status: result.status, isNewUser: result.isNewUser },
    });
});

// POST /api/v1/provider/auth/verify-otp   body: { phone, code }
const verifyOTP = catchAsync(async (req: Request, res: Response) => {
    const result = await ProviderAuthService.verifyProviderOTP(req.body.phone, req.body.code);

    return sendResponse(res, {
        success: true,
        statusCode: 200,
        message: result.message,
        data: {
            isNewUser: result.isNewUser,
            account: result.account,
            tokens: result.tokens,
        },
    });
});

// GET /api/v1/provider/auth/me
const getMyAccount = catchAsync(async (req: Request, res: Response) => {
    const account = await ProviderAuthService.getProviderAppAccount(Number(req.user?.id));

    return sendResponse(res, {
        success: true,
        statusCode: 200,
        message: "Account retrieved successfully",
        data: account,
    });
});

// PATCH /api/v1/provider/auth/me          body: { name?, email?, gender?, dateOfBirth?, profileImageUrl? }
const updateMyPersonalDetails = catchAsync(async (req: Request, res: Response) => {
    const account = await ProviderAuthService.updateMyPersonalDetails(Number(req.user?.id), req.body);

    return sendResponse(res, {
        success: true,
        statusCode: 200,
        message: "Personal details updated successfully",
        data: account,
    });
});

export const ProviderAuthController = {
    sendOTP,
    verifyOTP,
    getMyAccount,
    updateMyPersonalDetails,
};
