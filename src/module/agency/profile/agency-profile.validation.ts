// =====================================================================
// AGENCY PROFILE - request validation
// =====================================================================

import { z } from "zod";
import { phoneSchema } from "../../../utils/validators.js";
import { personalDetailsFields } from "../../Auth/personal-details.js";

// URL param  /agencies/:agencyId/...
export const agencyIdParam = z.object({ agencyId: z.coerce.number().int().positive() });

// Business details of the agency (saved on Agency)
const businessFields = {
    name: z.string().trim().min(2).max(120),
    description: z.string().trim().max(2000).nullable(),
    phone: phoneSchema, // agency's business phone, e.g. +919812345678
    alternatePhone: phoneSchema.nullable(),
    email: z.string().trim().toLowerCase().email().max(254).nullable(),
    website: z.string().trim().url().max(300).nullable(),
    logoUrl: z.string().trim().url().max(1000).nullable(),
    coverImageUrl: z.string().trim().url().max(1000).nullable(),
    address: z.string().trim().max(500).nullable(),
    city: z.string().trim().min(1).max(100),
    state: z.string().trim().min(1).max(100),
    pincode: z.string().trim().regex(/^\d{6}$/, "Pincode must be 6 digits"),
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    serviceRadiusKm: z.number().int().min(1).max(100),
};

// Legal details: can only be changed BEFORE the admin approves the agency
const legalFields = {
    legalName: z.string().trim().max(200).nullable(),
    registrationNumber: z.string().trim().max(50).nullable(),
    gstNumber: z.string().trim().toUpperCase().regex(/^[0-9A-Z]{15}$/, "GST number must be 15 letters/digits").nullable(),
    panNumber: z.string().trim().toUpperCase().regex(/^[A-Z]{5}[0-9]{4}[A-Z]$/, "Invalid PAN number").nullable(),
};

export const LEGAL_FIELD_NAMES = Object.keys(legalFields);

// ---------------------------------------------------------------
// POST /api/v1/agencies   (register a new agency)
// Required: name, phone, city, state, pincode, latitude, longitude
// ---------------------------------------------------------------

export const registerAgencySchema = z.object({
    // owner's own name (saved on the owner's User row)
    ownerName: personalDetailsFields.name.optional(),

    name: businessFields.name,
    description: businessFields.description.optional(),
    phone: businessFields.phone,
    alternatePhone: businessFields.alternatePhone.optional(),
    email: businessFields.email.optional(),
    website: businessFields.website.optional(),
    logoUrl: businessFields.logoUrl.optional(),
    coverImageUrl: businessFields.coverImageUrl.optional(),
    address: businessFields.address.optional(),
    city: businessFields.city,
    state: businessFields.state,
    pincode: businessFields.pincode,
    latitude: businessFields.latitude,
    longitude: businessFields.longitude,
    serviceRadiusKm: businessFields.serviceRadiusKm.optional(),

    legalName: legalFields.legalName.optional(),
    registrationNumber: legalFields.registrationNumber.optional(),
    gstNumber: legalFields.gstNumber.optional(),
    panNumber: legalFields.panNumber.optional(),
});

// ---------------------------------------------------------------
// PATCH /api/v1/agencies/:agencyId/profile   (every field optional)
// ---------------------------------------------------------------

export const updateAgencyProfileSchema = registerAgencySchema
    .omit({ ownerName: true })
    .partial()
    .refine((body) => Object.keys(body).length > 0, {
        message: "Send at least one field to update",
    });

export type RegisterAgencyInput = z.infer<typeof registerAgencySchema>;
export type UpdateAgencyProfileInput = z.infer<typeof updateAgencyProfileSchema>;
