// =====================================================================
// INDIVIDUAL PROVIDER PROFILE - request validation
// =====================================================================

import { z } from "zod";
import { personalDetailsFields } from "../../Auth/personal-details.js";

// Work details (saved on ProviderProfile)
const workFields = {
    profession: z.string().trim().min(2).max(60), // e.g. "Nurse"
    displayName: z.string().trim().max(100).nullable(), // name shown to customers, if different
    bio: z.string().trim().max(1000).nullable(),
    experienceYears: z.number().int().min(0).max(60),
    address: z.string().trim().max(500).nullable(),
    city: z.string().trim().min(1).max(100),
    state: z.string().trim().min(1).max(100),
    pincode: z.string().trim().regex(/^\d{6}$/, "Pincode must be 6 digits"),
    serviceRadiusKm: z.number().int().min(1).max(100),
};

// ---------------------------------------------------------------
// POST /api/v1/provider/register
// Required: name, profession, city, state, pincode
// ---------------------------------------------------------------

export const registerProviderSchema = z.object({
    // personal (saved on User)
    name: personalDetailsFields.name,
    email: personalDetailsFields.email.optional(),
    gender: personalDetailsFields.gender.optional(),
    dateOfBirth: personalDetailsFields.dateOfBirth.optional(),
    profileImageUrl: personalDetailsFields.profileImageUrl.optional(),

    // work (saved on ProviderProfile)
    profession: workFields.profession,
    displayName: workFields.displayName.optional(),
    bio: workFields.bio.optional(),
    experienceYears: workFields.experienceYears.optional(),
    address: workFields.address.optional(),
    city: workFields.city,
    state: workFields.state,
    pincode: workFields.pincode,
    serviceRadiusKm: workFields.serviceRadiusKm.optional(),
});

// ---------------------------------------------------------------
// PATCH /api/v1/provider/profile   (every field optional)
// ---------------------------------------------------------------

export const updateProviderProfileSchema = registerProviderSchema
    .partial()
    .refine((body) => Object.keys(body).length > 0, {
        message: "Send at least one field to update",
    });

export type RegisterProviderInput = z.infer<typeof registerProviderSchema>;
export type UpdateProviderProfileInput = z.infer<typeof updateProviderProfileSchema>;
