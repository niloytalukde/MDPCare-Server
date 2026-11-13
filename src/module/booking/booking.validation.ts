// =====================================================================
// BOOKING - request validation (what each request must look like)
// =====================================================================

import { z } from "zod";
import { otpCodeSchema } from "../../utils/validators.js";

const SIXTY_DAYS_IN_MS = 60 * 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------
// POST /api/v1/bookings
//
// Example (location typed in now):
// {
//   "items": [{ "serviceId": 3, "quantity": 1 }],
//   "latitude": 22.5726, "longitude": 88.3639,
//   "fullAddress": "12 Park Street, Kolkata",
//   "paymentMethod": "CASH"
// }
// Or use a saved address:  "addressId": 7  (instead of latitude/longitude/fullAddress)
// Scheduled booking:       "type": "SCHEDULED", "scheduledAt": "2026-11-20T10:00:00Z"
// ---------------------------------------------------------------

const bookingItemSchema = z.object({
    serviceId: z.number().int().positive(),
    quantity: z.number().int().min(1).max(10).default(1),
});

export const createBookingSchema = z
    .object({
        type: z.enum(["INSTANT", "SCHEDULED"]).default("INSTANT"),
        scheduledAt: z.coerce.date().optional(),
        items: z.array(bookingItemSchema).min(1).max(20),

        addressId: z.number().int().positive().optional(),
        latitude: z.number().min(-90).max(90).optional(),
        longitude: z.number().min(-180).max(180).optional(),
        fullAddress: z.string().trim().min(5).max(500).optional(),
        landmark: z.string().trim().max(200).optional(),

        familyMemberId: z.number().int().positive().optional(),
        paymentMethod: z.enum(["ONLINE", "CASH"]),
    })
    // rule 1: we need a location
    .refine(
        (body) =>
            body.addressId !== undefined ||
            (body.latitude !== undefined && body.longitude !== undefined && body.fullAddress !== undefined),
        { message: "Provide addressId, or latitude + longitude + fullAddress" }
    )
    // rule 2: a scheduled booking needs a time
    .refine((body) => body.type === "INSTANT" || body.scheduledAt !== undefined, {
        message: "scheduledAt is required for SCHEDULED bookings",
    })
    // rule 3: not more than 60 days ahead
    .refine((body) => !body.scheduledAt || body.scheduledAt.getTime() < Date.now() + SIXTY_DAYS_IN_MS, {
        message: "scheduledAt must be within 60 days",
    });

// ---------------------------------------------------------------
// GET /api/v1/bookings?page=1&limit=20&status=COMPLETED
// ---------------------------------------------------------------

export const listBookingsQuery = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    status: z
        .enum(["PENDING", "SEARCHING_PROVIDER", "CONFIRMED", "IN_PROGRESS", "COMPLETED", "CANCELLED", "EXPIRED"])
        .optional(),
});

// POST /api/v1/bookings/:id/cancel            { "reason": "..." }  (optional)
export const cancelBookingSchema = z.object({ reason: z.string().trim().max(500).optional() });

// POST /api/v1/provider/bookings/:id/complete  { "otp": "123456" }
export const completeBookingSchema = z.object({ otp: otpCodeSchema });

// POST /api/v1/provider/bookings/:id/reject    { "reason": "..." }  (optional)
export const rejectSchema = z.object({ reason: z.string().trim().max(500).optional() });
