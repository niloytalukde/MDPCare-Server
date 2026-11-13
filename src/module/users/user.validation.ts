import { z } from "zod";
import { phoneSchema } from "../../utils/validators.js";

// Only these fields can be written through the admin user API (SEC-01).
// accountStatus / roles / verification flags / tokenVersion are NOT writable here.
export const createUserSchema = z.object({
    phone: phoneSchema,
    name: z.string().trim().min(1).max(100).optional(),
    email: z.string().trim().toLowerCase().email().max(254).optional(),
});

export const updateUserSchema = z
    .object({
        name: z.string().trim().min(1).max(100).optional(),
        email: z.string().trim().toLowerCase().email().max(254).nullable().optional(),
    })
    .refine((v) => Object.keys(v).length > 0, "Nothing to update");

export const listUsersQuery = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    search: z.string().trim().max(100).optional(),
});
