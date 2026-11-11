import type { Request, Response } from "express";
import catchAsync from "../../utils/catchAsync.js";
import sendResponse from "../../utils/sendResponse.js";
import { AppError } from "../../errors/AppError.js";
import { FamilyMemberService } from "./familyMember.services.js";

// ---------------------------------------------
// 1. Create Family Member Controller
// POST /api/v1/family-members
// ---------------------------------------------
const createFamilyMember = catchAsync(async (req: Request, res: Response) => {
    const userId = Number(req.user?.id);

    if (!userId) {
        throw new AppError(401, "Unauthorized access");
    }

    const result = await FamilyMemberService.createFamilyMember(userId, req.body);

    return sendResponse(res, {
        success: true,
        statusCode: 201,
        message: "Family member added successfully",
        data: result,
    });
});

// ---------------------------------------------
// 2. Get All Family Members Controller
// GET /api/v1/family-members
// ---------------------------------------------
const getAllFamilyMembers = catchAsync(async (req: Request, res: Response) => {
    const userId = Number(req.user?.id);

    if (!userId) {
        throw new AppError(401, "Unauthorized access");
    }

    const result = await FamilyMemberService.getAllFamilyMembers(userId);

    return sendResponse(res, {
        success: true,
        statusCode: 200,
        message: "Family members retrieved successfully",
        data: result,
    });
});

// ---------------------------------------------
// 3. Get Single Family Member Controller
// GET /api/v1/family-members/:id
// ---------------------------------------------
const getSingleFamilyMember = catchAsync(async (req: Request, res: Response) => {
    const userId = Number(req.user?.id);

    if (!userId) {
        throw new AppError(401, "Unauthorized access");
    }

    const memberId = Number(req.params.id);

    const result = await FamilyMemberService.getSingleFamilyMember(userId, memberId);

    return sendResponse(res, {
        success: true,
        statusCode: 200,
        message: "Family member retrieved successfully",
        data: result,
    });
});

// ---------------------------------------------
// 4. Update Family Member Controller
// PATCH /api/v1/family-members/:id
// ---------------------------------------------
const updateFamilyMember = catchAsync(async (req: Request, res: Response) => {
    const userId = Number(req.user?.id);

    if (!userId) {
        throw new AppError(401, "Unauthorized access");
    }

    const memberId = Number(req.params.id);

    const result = await FamilyMemberService.updateFamilyMember(
        userId,
        memberId,
        req.body
    );

    return sendResponse(res, {
        success: true,
        statusCode: 200,
        message: "Family member updated successfully",
        data: result,
    });
});

// ---------------------------------------------
// 5. Delete Family Member Controller
// DELETE /api/v1/family-members/:id
// ---------------------------------------------
const deleteFamilyMember = catchAsync(async (req: Request, res: Response) => {
    const userId = Number(req.user?.id);

    if (!userId) {
        throw new AppError(401, "Unauthorized access");
    }

    const memberId = Number(req.params.id);

    await FamilyMemberService.deleteFamilyMember(userId, memberId);

    return sendResponse(res, {
        success: true,
        statusCode: 200,
        message: "Family member deleted successfully",
    });
});

export const FamilyMemberController = {
    createFamilyMember,
    getAllFamilyMembers,
    getSingleFamilyMember,
    updateFamilyMember,
    deleteFamilyMember,
};
