import type { Request, Response, NextFunction, RequestHandler } from "express";
import type { ZodType } from "zod";

interface Schemas {
    body?: ZodType;
    query?: ZodType;
    params?: ZodType;
}

/**
 * Validates and strips unknown keys (zod objects are non-passthrough by default),
 * which also blocks mass-assignment (SEC-01/SEC-08).
 * Parsed values are stored on `res.locals.validated` because Express 5 makes
 * `req.query` read-only; `req.body` is replaced in place.
 */
export const validate =
    (schemas: Schemas): RequestHandler =>
    (req: Request, res: Response, next: NextFunction) => {
        try {
            const validated: Record<string, unknown> = {};
            if (schemas.params) validated.params = schemas.params.parse(req.params);
            if (schemas.query) validated.query = schemas.query.parse(req.query);
            if (schemas.body) {
                validated.body = schemas.body.parse(req.body ?? {});
                req.body = validated.body;
            }
            res.locals.validated = validated;
            next();
        } catch (error) {
            next(error);
        }
    };

export default validate;
