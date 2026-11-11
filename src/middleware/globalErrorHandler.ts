import type {
    Request,
    Response,
    NextFunction,
} from "express";

import sendResponse from "../utils/sendResponse.js";
import { AppError } from "../errors/AppError.js";

const globalErrorHandler = (
    error: unknown,
    _req: Request,
    res: Response,
    _next: NextFunction
) => {
    // Check if error is custom operational AppError
    if (error instanceof AppError) {
        return sendResponse(res, {
            success: false,
            statusCode: error.statusCode,
            message: error.message,
        });
    }

    console.error("Unhandled Error:", error);

    const message =
        error instanceof Error
            ? error.message
            : "Something went wrong";

    return sendResponse(res, {
        success: false,
        statusCode: 500,
        message:
            process.env.NODE_ENV === "production"
                ? "Internal server error"
                : message,
    });
};

export default globalErrorHandler;
