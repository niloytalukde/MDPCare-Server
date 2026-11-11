import type { Response } from "express";

interface TResponse<T> {
    success: boolean;
    statusCode: number;
    message: string;
    data?: T;
    meta?: Record<string, unknown>;
}

const sendResponse = <T>(
    res: Response,
    responseData: TResponse<T>
): Response => {
    const {
        success,
        statusCode,
        message,
        data,
        meta,
    } = responseData;

    return res.status(statusCode).json({
        success,
        message,
        ...(data !== undefined && { data }),
        ...(meta !== undefined && { meta }),
    });
};

export default sendResponse;