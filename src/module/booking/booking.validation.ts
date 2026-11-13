import { z } from "zod";
import { otpCodeSchema } from "../../utils/validators.js";

export const createBookingSchema = z
    .object({
        type: z.enum(["INSTANT", "SCHEDULED"]).default("INSTANT"),
        scheduledAt: z.coerce.date().optional(),
        items: z
            .array(z.object({ serviceId: z.number().int().positive(), quantity: z.number().int().min(1).max(10).default(1) }))
            .min(1)
            .max(20),
        addressId: z.number().int().positive().optional(),
        latitude: z.number().min(-90).max(90).optional(),
        longitude: z.number().min(-180).max(180).optional(),
        fullAddress: z.string().trim().min(5).max(500).optional(),
        landmark: z.string().trim().max(200).optional(),
        familyMemberId: z.number().int().positive().optional(),
        paymentMethod: z.enum(["ONLINE", "CASH"]),
    })
    .refine((v) => v.addressId !== undefined || (v.latitude !== undefined && v.longitude !== undefined && v.fullAddress), {
        message: "Provide addressId, or latitude + longitude + fullAddress",
    })
    .refine((v) => v.type === "INSTANT" || v.scheduledAt !== undefined, { message: "scheduledAt is required for SCHEDULED bookings" })
    .refine((v) => !v.scheduledAt || v.scheduledAt.getTime() < Date.now() + 60 * 24 * 3600 * 1000, {
        message: "scheduledAt must be within 60 days",
    });

export const listBookingsQuery = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    status: z.enum(["PENDING", "SEARCHING_PROVIDER", "CONFIRMED", "IN_PROGRESS", "COMPLETED", "CANCELLED", "EXPIRED"]).optional(),
});

export const cancelBookingSchema = z.object({ reason: z.string().trim().max(500).optional() });
export const completeBookingSchema = z.object({ otp: otpCodeSchema });
export const rejectSchema = z.object({ reason: z.string().trim().max(500).optional() });
