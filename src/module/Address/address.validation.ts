// =====================================================================
// ADDRESS - request validation
// Bad input now gets a clear 400 message instead of a crash (500)
// or wrong data being saved (for example latitude "abc").
// =====================================================================

import { z } from "zod";

// Optional text: may be left out, may be null (= clear it), max length
const optionalText = (max: number) => z.string().trim().max(max).nullable().optional();

// Required text: must be there and not empty
const requiredText = (name: string, max: number) =>
    z.string({ error: `${name} is required` }).trim().min(1, `${name} is required`).max(max);

const pincode = z.string({ error: "Pincode is required" }).trim().regex(/^\d{6}$/, "Pincode must be 6 digits");

const latitude = z.number({ error: "Latitude must be a number" }).min(-90).max(90).nullable().optional();
const longitude = z.number({ error: "Longitude must be a number" }).min(-180).max(180).nullable().optional();

const addressType = z.enum(["HOME", "WORK", "OTHER"]).optional();

// POST /addresses
export const createAddressSchema = z.object({
    flatNo: optionalText(50),
    floor: optionalText(30),
    buildingName: optionalText(100),
    street: optionalText(200),
    area: optionalText(200),
    city: requiredText("City", 100),
    state: requiredText("State", 100),
    pincode,
    latitude,
    longitude,
    addressType,
    isDefault: z.boolean().optional(),
});

// PATCH /addresses/:id  - send only what changes; city/state/pincode can't be emptied
export const updateAddressSchema = createAddressSchema.partial();
