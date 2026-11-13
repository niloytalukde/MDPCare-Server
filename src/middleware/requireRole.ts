import type { Request, Response, NextFunction, RequestHandler } from "express";
import { AppError } from "../errors/AppError.js";
import type { UserRoleType } from "../generated/prisma/enums.js";

/**
 * Role-based access control. Must run after `auth`.
 * Passes if the user holds ANY of the given roles.
 */
export const requireRole =
    (...roles: UserRoleType[]): RequestHandler =>
    (req: Request, _res: Response, next: NextFunction) => {
        const userRoles = req.user?.roles ?? [];
        if (!req.user) {
            return next(new AppError(401, "Unauthorized access"));
        }
        if (!roles.some((r) => userRoles.includes(r))) {
            return next(new AppError(403, "You do not have permission to perform this action"));
        }
        next();
    };

export default requireRole;
