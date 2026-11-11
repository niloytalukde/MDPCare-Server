import type { Request, Response } from "express";
import catchAsync from "../../utils/catchAsync.js";
import sendResponse from "../../utils/sendResponse.js";
import { AppError } from "../../errors/AppError.js";
import { AddressService } from "./address.services.js";

// ---------------------------------------------
// 1. Create Address Controller
// POST /api/v1/addresses
// ---------------------------------------------
const createAddress = catchAsync(async (req: Request, res: Response) => {
    const userId = Number(req.user?.id);

    if (!userId) {
        throw new AppError(401, "Unauthorized access");
    }

    const result = await AddressService.createAddress(userId, req.body);

    return sendResponse(res, {
        success: true,
        statusCode: 201,
        message: "Address created successfully",
        data: result,
    });
});

// ---------------------------------------------
// 2. Get All Addresses Controller
// GET /api/v1/addresses
// ---------------------------------------------
const getAllAddresses = catchAsync(async (req: Request, res: Response) => {
    const userId = Number(req.user?.id);

    if (!userId) {
        throw new AppError(401, "Unauthorized access");
    }

    const result = await AddressService.getAllAddresses(userId);

    return sendResponse(res, {
        success: true,
        statusCode: 200,
        message: "Addresses retrieved successfully",
        data: result,
    });
});

// ---------------------------------------------
// 3. Get Single Address Controller
// GET /api/v1/addresses/:id
// ---------------------------------------------
const getSingleAddress = catchAsync(async (req: Request, res: Response) => {
    const userId = Number(req.user?.id);

    if (!userId) {
        throw new AppError(401, "Unauthorized access");
    }

    const addressId = Number(req.params.id);

    const result = await AddressService.getSingleAddress(userId, addressId);

    return sendResponse(res, {
        success: true,
        statusCode: 200,
        message: "Address retrieved successfully",
        data: result,
    });
});

// ---------------------------------------------
// 4. Update Address Controller
// PATCH /api/v1/addresses/:id
// ---------------------------------------------
const updateAddress = catchAsync(async (req: Request, res: Response) => {
    const userId = Number(req.user?.id);

    if (!userId) {
        throw new AppError(401, "Unauthorized access");
    }

    const addressId = Number(req.params.id);

    const result = await AddressService.updateAddress(userId, addressId, req.body);

    return sendResponse(res, {
        success: true,
        statusCode: 200,
        message: "Address updated successfully",
        data: result,
    });
});

// ---------------------------------------------
// 5. Delete Address Controller
// DELETE /api/v1/addresses/:id
// ---------------------------------------------
const deleteAddress = catchAsync(async (req: Request, res: Response) => {
    const userId = Number(req.user?.id);

    if (!userId) {
        throw new AppError(401, "Unauthorized access");
    }

    const addressId = Number(req.params.id);

    await AddressService.deleteAddress(userId, addressId);

    return sendResponse(res, {
        success: true,
        statusCode: 200,
        message: "Address deleted successfully",
    });
});

// ---------------------------------------------
// 6. Set Default Address Controller
// PATCH /api/v1/addresses/:id/default
// ---------------------------------------------
const setDefaultAddress = catchAsync(async (req: Request, res: Response) => {
    const userId = Number(req.user?.id);

    if (!userId) {
        throw new AppError(401, "Unauthorized access");
    }

    const addressId = Number(req.params.id);

    const result = await AddressService.setDefaultAddress(userId, addressId);

    return sendResponse(res, {
        success: true,
        statusCode: 200,
        message: "Default address updated successfully",
        data: result,
    });
});

export const AddressController = {
    createAddress,
    getAllAddresses,
    getSingleAddress,
    updateAddress,
    deleteAddress,
    setDefaultAddress,
};
