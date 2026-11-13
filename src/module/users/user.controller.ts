import type { Request, Response } from "express";

import catchAsync from "../../utils/catchAsync.js";
import sendResponse from "../../utils/sendResponse.js";
import { userService } from "./user.services.js";

const createUser = catchAsync(async (req: Request, res: Response) => {
    const result = await userService.createUser(req.body);
    sendResponse(res, { success: true, statusCode: 201, message: "User created successfully", data: result });
});

const getAllUsers = catchAsync(async (_req: Request, res: Response) => {
    const result = await userService.getAllUsers(res.locals.validated.query);
    sendResponse(res, {
        success: true,
        statusCode: 200,
        message: "Users retrieved successfully",
        data: result.data,
        meta: result.meta,
    });
});

const getSingleUser = catchAsync(async (_req: Request, res: Response) => {
    const result = await userService.getSingleUser(res.locals.validated.params.id);
    sendResponse(res, { success: true, statusCode: 200, message: "User retrieved successfully", data: result });
});

const updateUser = catchAsync(async (req: Request, res: Response) => {
    const result = await userService.updateUser(res.locals.validated.params.id, req.body);
    sendResponse(res, { success: true, statusCode: 200, message: "User updated successfully", data: result });
});

const deleteUser = catchAsync(async (_req: Request, res: Response) => {
    const result = await userService.deleteUser(res.locals.validated.params.id);
    sendResponse(res, { success: true, statusCode: 200, message: "User deleted successfully", data: result });
});

export const userController = {
    createUser,
    getAllUsers,
    getSingleUser,
    updateUser,
    deleteUser,
};
