import type { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";

import sendResponse from "../utils/sendResponse.js";
import { AppError } from "../errors/AppError.js";
import { Prisma } from "../generated/prisma/client.js";
import { env } from "../config/env.js";

interface Mapped {
    statusCode: number;
    message: string;
    errors?: unknown;
}

/**
 * Translates known error types to safe client responses (SEC-09).
 * Never returns stack traces, SQL, OTP hashes or raw driver messages.
 */
const mapError = (error: unknown): Mapped | null => {
    if (error instanceof AppError) {
        return { statusCode: error.statusCode, message: error.message };
    }

    if (error instanceof ZodError) {
        return {
            statusCode: 400,
            message: "Validation failed",
            errors: error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
        };
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError) {
        switch (error.code) {
            case "P2002":
                return { statusCode: 409, message: "A record with these details already exists" };
            case "P2025":
                return { statusCode: 404, message: "Record not found" };
            case "P2003":
            case "P2014":
                return {
                    statusCode: 409,
                    message: "This record is referenced by other records and cannot be changed",
                };
            case "P2034":
                return { statusCode: 409, message: "Concurrent update conflict. Please retry." };
            default:
                return null;
        }
    }

    if (error instanceof Prisma.PrismaClientValidationError) {
        return { statusCode: 400, message: "Invalid request data" };
    }

    // body-parser errors (malformed JSON, payload too large)
    const e = error as { type?: string; status?: number };
    if (e?.type === "entity.parse.failed") {
        return { statusCode: 400, message: "Malformed JSON body" };
    }
    if (e?.type === "entity.too.large") {
        return { statusCode: 413, message: "Request body too large" };
    }

    return null;
};

const globalErrorHandler = (
    error: unknown,
    req: Request,
    res: Response,
    _next: NextFunction
) => {
    const mapped = mapError(error);

    if (mapped) {
        if (mapped.statusCode >= 500) {
            console.error(`[${req.method} ${req.originalUrl}]`, error);
        }
        return res.status(mapped.statusCode).json({
            success: false,
            message: mapped.message,
            ...(mapped.errors !== undefined && { errors: mapped.errors }),
        });
    }

    console.error(`Unhandled error [${req.method} ${req.originalUrl}]:`, error);

    return sendResponse(res, {
        success: false,
        statusCode: 500,
        message:
            env.NODE_ENV === "development" && error instanceof Error
                ? error.message
                : "Internal server error",
    });
};

export default globalErrorHandler;
