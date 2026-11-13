// =====================================================================
// INDIVIDUAL PROVIDER PROFILE - controllers
// =====================================================================

import type { Request, Response } from "express";
import catchAsync from "../../../utils/catchAsync.js";
import sendResponse from "../../../utils/sendResponse.js";
import { ProviderProfileService } from "./provider-profile.service.js";

// POST /api/v1/provider/register
const register = catchAsync(async (req: Request, res: Response) => {
    const profile = await ProviderProfileService.registerProvider(Number(req.user?.id), req.body);

    return sendResponse(res, {
        success: true,
        statusCode: 201,
        message: "Provider registration successful. Your profile is waiting for admin approval.",
        data: profile,
    });
});

// GET /api/v1/provider/profile
const getMyProfile = catchAsync(async (req: Request, res: Response) => {
    const profile = await ProviderProfileService.getProviderProfile(Number(req.user?.id));

    return sendResponse(res, {
        success: true,
        statusCode: 200,
        message: "Provider profile retrieved successfully",
        data: profile,
    });
});

// PATCH /api/v1/provider/profile
const updateMyProfile = catchAsync(async (req: Request, res: Response) => {
    const profile = await ProviderProfileService.updateProviderProfile(Number(req.user?.id), req.body);

    return sendResponse(res, {
        success: true,
        statusCode: 200,
        message: "Provider profile updated successfully",
        data: profile,
    });
});

export const ProviderProfileController = {
    register,
    getMyProfile,
    updateMyProfile,
};
