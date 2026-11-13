// =====================================================================
// PERSONAL DETAILS (shared by customer, provider and agency profiles)
//
// Personal details always live on the User table:
//   name, email, gender, dateOfBirth, profileImageUrl
// Work details live on ProviderProfile, business details on Agency.
// =====================================================================

import { z } from "zod";

// ---------------------------------------------------------------
// 1. Validation rules (zod) for the fields a person can send
// ---------------------------------------------------------------

export const genderValues = ["MALE", "FEMALE", "OTHER", "PREFER_NOT_TO_SAY"] as const;

export const personalDetailsFields = {
    name: z.string().trim().min(1, "Name is required").max(100),
    email: z.string().trim().toLowerCase().email("Invalid email").max(254).nullable(),
    gender: z.enum(genderValues).nullable(),
    // Format "YYYY-MM-DD", e.g. "1995-08-21"
    dateOfBirth: z.iso.date("Date of birth must be YYYY-MM-DD").nullable(),
    profileImageUrl: z.string().trim().url("Invalid image URL").max(1000).nullable(),
};

// Body for "update my personal details": every field optional,
// send only what you want to change.
export const updatePersonalDetailsSchema = z
    .object({
        name: personalDetailsFields.name.optional(),
        email: personalDetailsFields.email.optional(),
        gender: personalDetailsFields.gender.optional(),
        dateOfBirth: personalDetailsFields.dateOfBirth.optional(),
        profileImageUrl: personalDetailsFields.profileImageUrl.optional(),
    })
    .refine((body) => Object.keys(body).length > 0, {
        message: "Send at least one field to update",
    });

export type PersonalDetailsInput = {
    name?: string | undefined;
    email?: string | null | undefined;
    gender?: (typeof genderValues)[number] | null | undefined;
    dateOfBirth?: string | null | undefined;
    profileImageUrl?: string | null | undefined;
};

// ---------------------------------------------------------------
// 2. Turn the validated input into data for prisma.user.update()
//    Only fields that were actually sent are changed.
// ---------------------------------------------------------------

export const toUserUpdateData = (input: PersonalDetailsInput) => {
    const data: {
        name?: string;
        email?: string | null;
        gender?: string | null;
        dateOfBirth?: Date | null;
        profileImageUrl?: string | null;
    } = {};

    if (input.name !== undefined) data.name = input.name;
    if (input.email !== undefined) data.email = input.email;
    if (input.gender !== undefined) data.gender = input.gender;
    if (input.dateOfBirth !== undefined) {
        data.dateOfBirth = input.dateOfBirth === null ? null : new Date(input.dateOfBirth);
    }
    if (input.profileImageUrl !== undefined) data.profileImageUrl = input.profileImageUrl;

    return data;
};

// ---------------------------------------------------------------
// 3. Which User columns are safe to send back to the app
//    (never send tokenVersion, fcmToken, deviceImei ...)
// ---------------------------------------------------------------

export const personalDetailsSelect = {
    id: true,
    phone: true,
    name: true,
    email: true,
    gender: true,
    dateOfBirth: true,
    profileImageUrl: true,
    isPhoneVerified: true,
    accountStatus: true,
    createdAt: true,
} as const;
