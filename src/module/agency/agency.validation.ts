import { z } from "zod";
import { phoneSchema, otpCodeSchema } from "../../utils/validators.js";

export const agencyIdParam = z.object({ agencyId: z.coerce.number().int().positive() });
export const agencyBookingParams = agencyIdParam.extend({ bookingId: z.coerce.number().int().positive() });
export const agencyMemberParams = agencyIdParam.extend({ memberId: z.coerce.number().int().positive() });
export const memberIdParam = z.object({ memberId: z.coerce.number().int().positive() });
export const assignmentIdParam = z.object({ assignmentId: z.coerce.number().int().positive() });

// registerAgencySchema moved to profile/agency-profile.validation.ts

export const agencyServiceSchema = z.object({
    serviceId: z.number().int().positive(),
    customPrice: z.number().nonnegative().max(10_000_000).nullable().optional(),
    isActive: z.boolean().optional(),
});

export const addStaffSchema = z.object({
    phone: phoneSchema,
    displayName: z.string().trim().max(100).optional(),
    experienceYears: z.number().int().min(0).max(60).optional(),
});

export const memberStatusSchema = z.object({ status: z.enum(["ACTIVE", "SUSPENDED", "REMOVED"]) });
export const staffServicesSchema = z.object({ serviceIds: z.array(z.number().int().positive()).max(100) });
export const assignStaffSchema = z.object({ staffMemberId: z.number().int().positive(), notes: z.string().trim().max(500).optional() });
export const respondSchema = z.object({ reason: z.string().trim().max(500).optional() });
export const completeSchema = z.object({ otp: otpCodeSchema });
