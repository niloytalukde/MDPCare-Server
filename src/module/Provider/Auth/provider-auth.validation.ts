// =====================================================================
// PROVIDER APP - login validation
// The login rules are the same as the customer app, so we reuse them.
// =====================================================================

export { sendOtpSchema, verifyOtpSchema, refreshTokenSchema } from "../../Auth/auth.validation.js";

// PATCH /api/v1/provider/auth/me
export { updatePersonalDetailsSchema } from "../../Auth/personal-details.js";
