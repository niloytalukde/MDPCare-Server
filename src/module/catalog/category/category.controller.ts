import type { Request, Response } from "express";
import catchAsync from "../../../utils/catchAsync.js";
import sendResponse from "../../../utils/sendResponse.js";
import { CategoryService } from "./category.services.js";

// ---------------------------------------------
// 1. Create Category Controller
// POST /api/v1/categories
// ---------------------------------------------
const createCategory = catchAsync(async (req: Request, res: Response) => {
    const result = await CategoryService.createCategory(req.body);

    return sendResponse(res, {
        success: true,
        statusCode: 201,
        message: "Category created successfully",
        data: result,
    });
});

// ---------------------------------------------
// 2. Get All Categories Controller
// GET /api/v1/categories
// ---------------------------------------------
const getAllCategories = catchAsync(async (req: Request, res: Response) => {
    const search = req.query.search as string | undefined;
    const includeServices = req.query.includeServices === "true";

    const result = await CategoryService.getAllCategories({
        search,
        includeServices,
    });

    return sendResponse(res, {
        success: true,
        statusCode: 200,
        message: "Categories retrieved successfully",
        data: result,
    });
});

// ---------------------------------------------
// 3. Get Single Category Controller
// GET /api/v1/categories/:id
// ---------------------------------------------
const getSingleCategory = catchAsync(async (req: Request, res: Response) => {
    const categoryId = Number(req.params.id);
    const includeServices = req.query.includeServices !== "false";

    const result = await CategoryService.getSingleCategory(
        categoryId,
        includeServices
    );

    return sendResponse(res, {
        success: true,
        statusCode: 200,
        message: "Category retrieved successfully",
        data: result,
    });
});

// ---------------------------------------------
// 4. Update Category Controller
// PATCH /api/v1/categories/:id
// ---------------------------------------------
const updateCategory = catchAsync(async (req: Request, res: Response) => {
    const categoryId = Number(req.params.id);

    const result = await CategoryService.updateCategory(
        categoryId,
        req.body
    );

    return sendResponse(res, {
        success: true,
        statusCode: 200,
        message: "Category updated successfully",
        data: result,
    });
});

// ---------------------------------------------
// 5. Delete Category Controller
// DELETE /api/v1/categories/:id
// ---------------------------------------------
const deleteCategory = catchAsync(async (req: Request, res: Response) => {
    const categoryId = Number(req.params.id);
    const cascade = req.query.cascade === "true";

    await CategoryService.deleteCategory(categoryId, cascade);

    return sendResponse(res, {
        success: true,
        statusCode: 200,
        message: "Category deleted successfully",
    });
});

export const CategoryController = {
    createCategory,
    getAllCategories,
    getSingleCategory,
    updateCategory,
    deleteCategory,
};
