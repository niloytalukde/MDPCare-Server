import type { Request, Response } from "express";
import catchAsync from "../../../utils/catchAsync.js";
import sendResponse from "../../../utils/sendResponse.js";
import { ServiceCatalogService } from "./service.services.js";

// ---------------------------------------------
// 1. Create Service Controller
// POST /api/v1/services
// ---------------------------------------------
const createService = catchAsync(async (req: Request, res: Response) => {
    const result = await ServiceCatalogService.createService(req.body);

    return sendResponse(res, {
        success: true,
        statusCode: 201,
        message: "Service created successfully",
        data: result,
    });
});

// ---------------------------------------------
// 2. Get All Services Controller
// GET /api/v1/services
// ---------------------------------------------
const getAllServices = catchAsync(async (req: Request, res: Response) => {
    const search = req.query.search as string | undefined;
    const categoryId = req.query.categoryId
        ? Number(req.query.categoryId)
        : undefined;
    const minPrice = req.query.minPrice
        ? Number(req.query.minPrice)
        : undefined;
    const maxPrice = req.query.maxPrice
        ? Number(req.query.maxPrice)
        : undefined;

    const result = await ServiceCatalogService.getAllServices({
        search,
        categoryId,
        minPrice,
        maxPrice,
    });

    return sendResponse(res, {
        success: true,
        statusCode: 200,
        message: "Services retrieved successfully",
        data: result,
    });
});

// ---------------------------------------------
// 3. Get Single Service Controller
// GET /api/v1/services/:id
// ---------------------------------------------
const getSingleService = catchAsync(async (req: Request, res: Response) => {
    const serviceId = Number(req.params.id);

    const result = await ServiceCatalogService.getSingleService(serviceId);

    return sendResponse(res, {
        success: true,
        statusCode: 200,
        message: "Service retrieved successfully",
        data: result,
    });
});

// ---------------------------------------------
// 4. Update Service Controller
// PATCH /api/v1/services/:id
// ---------------------------------------------
const updateService = catchAsync(async (req: Request, res: Response) => {
    const serviceId = Number(req.params.id);

    const result = await ServiceCatalogService.updateService(
        serviceId,
        req.body
    );

    return sendResponse(res, {
        success: true,
        statusCode: 200,
        message: "Service updated successfully",
        data: result,
    });
});

// ---------------------------------------------
// 5. Delete Service Controller
// DELETE /api/v1/services/:id
// ---------------------------------------------
const deleteService = catchAsync(async (req: Request, res: Response) => {
    const serviceId = Number(req.params.id);

    await ServiceCatalogService.deleteService(serviceId);

    return sendResponse(res, {
        success: true,
        statusCode: 200,
        message: "Service deleted successfully",
    });
});

export const ServiceController = {
    createService,
    getAllServices,
    getSingleService,
    updateService,
    deleteService,
};
