// =====================================================================
// CUSTOMER - request validation
// =====================================================================

import type { z } from "zod";
import { updatePersonalDetailsSchema } from "../Auth/personal-details.js";

// PATCH /api/v1/customer/profile
// A customer profile is just personal details (name, email, gender,
// dateOfBirth, profileImageUrl), so we reuse the shared rules.
export const updateCustomerProfileSchema = updatePersonalDetailsSchema;

export type UpdateCustomerProfileInput = z.infer<typeof updateCustomerProfileSchema>;
