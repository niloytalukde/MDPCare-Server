import { z } from "zod";

/** E.164, e.g. +919812345678. Clients must send numbers in this format (SEC-08). */
export const phoneSchema = z
    .string()
    .trim()
    .regex(/^\+[1-9]\d{7,14}$/, "Phone must be in E.164 format, e.g. +919812345678");

export const otpCodeSchema = z.string().trim().regex(/^\d{4,8}$/, "Invalid OTP format");

export const idParam = z.object({ id: z.coerce.number().int().positive() });

export const paginationQuery = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type Pagination = z.infer<typeof paginationQuery>;

export const toSkipTake = ({ page, limit }: Pagination) => ({
    skip: (page - 1) * limit,
    take: limit,
});

export const paginationMeta = (p: Pagination, total: number) => ({
    page: p.page,
    limit: p.limit,
    total,
    totalPages: Math.ceil(total / p.limit),
});
