
import type { Request, Response } from "express";

import catchAsync from "../../utils/catchAsync.js";
import sendResponse from "../../utils/sendResponse.js";
import { userService } from "./user.services.js";


// Create User
const createUser = catchAsync(
    async (req: Request, res: Response) => {
        const result = await userService.createUser(req.body);

        sendResponse(res, {
            success: true,
            statusCode: 201,
            message: "User created successfully",
            data: result,
        });
    }
);

// Get All Users
const getAllUsers = catchAsync(
    async (_req: Request, res: Response) => {
        const result = await userService.getAllUsers();

        sendResponse(res, {
            success: true,
            statusCode: 200,
            message: "Users retrieved successfully",
            data: result,
        });
    }
);

// Get Single User
const getSingleUser = catchAsync(
    async (req: Request, res: Response) => {
        const { id } = req.params;

        const result = await userService.getSingleUser(Number(id));

        sendResponse(res, {
            success: true,
            statusCode: 200,
            message: "User retrieved successfully",
            data: result,
        });
    }
);

// Update User
const updateUser = catchAsync(
    async (req: Request, res: Response) => {
        const { id } = req.params;

        const result = await userService.updateUser(
            Number(id),
            req.body
        );

        sendResponse(res, {
            success: true,
            statusCode: 200,
            message: "User updated successfully",
            data: result,
        });
    }
);

// Delete User
const deleteUser = catchAsync(
    async (req: Request, res: Response) => {
        const { id } = req.params;

        const result = await userService.deleteUser(Number(id));

        sendResponse(res, {
            success: true,
            statusCode: 200,
            message: "User deleted successfully",
            data: result,
        });
    }
);

export const userController = {
    createUser,
    getAllUsers,
    getSingleUser,
    updateUser,
    deleteUser,
};
