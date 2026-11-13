// =====================================================================
// CUSTOMER - controllers (read the request, call the service, reply)
// =====================================================================

import type { Request, Response } from "express";
import catchAsync from "../../utils/catchAsync.js";
import sendResponse from "../../utils/sendResponse.js";
import { CustomerService } from "./customer.service.js";

// GET /api/v1/customer/profile
const getMyProfile = catchAsync(async (req: Request, res: Response) => {
    const userId = Number(req.user?.id);
    const profile = await CustomerService.getCustomerProfile(userId);

    return sendResponse(res, {
        success: true,
        statusCode: 200,
        message: "Profile retrieved successfully",
        data: profile,
    });
});

// PATCH /api/v1/customer/profile
const updateMyProfile = catchAsync(async (req: Request, res: Response) => {
    const userId = Number(req.user?.id);
    const profile = await CustomerService.updateCustomerProfile(userId, req.body);

    return sendResponse(res, {
        success: true,
        statusCode: 200,
        message: "Profile updated successfully",
        data: profile,
    });
});

export const CustomerController = {
    getMyProfile,
    updateMyProfile,
};
