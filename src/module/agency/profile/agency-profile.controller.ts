// =====================================================================
// AGENCY PROFILE - controllers
// =====================================================================

import type { Request, Response } from "express";
import catchAsync from "../../../utils/catchAsync.js";
import sendResponse from "../../../utils/sendResponse.js";
import { AgencyProfileService } from "./agency-profile.service.js";

// The :agencyId from the URL, already checked by validate({ params: agencyIdParam })
const getAgencyId = (res: Response) => (res.locals.validated.params as { agencyId: number }).agencyId;

// POST /api/v1/agencies
const register = catchAsync(async (req: Request, res: Response) => {
    const profile = await AgencyProfileService.registerAgency(Number(req.user?.id), req.body);

    return sendResponse(res, {
        success: true,
        statusCode: 201,
        message: "Agency registered successfully. It is waiting for admin approval.",
        data: profile,
    });
});

// GET /api/v1/agencies/:agencyId/profile
const getProfile = catchAsync(async (req: Request, res: Response) => {
    const profile = await AgencyProfileService.getAgencyProfile(Number(req.user?.id), getAgencyId(res));

    return sendResponse(res, {
        success: true,
        statusCode: 200,
        message: "Agency profile retrieved successfully",
        data: profile,
    });
});

// PATCH /api/v1/agencies/:agencyId/profile
const updateProfile = catchAsync(async (req: Request, res: Response) => {
    const profile = await AgencyProfileService.updateAgencyProfile(Number(req.user?.id), getAgencyId(res), req.body);

    return sendResponse(res, {
        success: true,
        statusCode: 200,
        message: "Agency profile updated successfully",
        data: profile,
    });
});

export const AgencyProfileController = {
    register,
    getProfile,
    updateProfile,
};
