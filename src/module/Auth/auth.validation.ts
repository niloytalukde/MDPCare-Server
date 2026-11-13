// =====================================================================
// LOGIN - request validation (used by the customer app AND the provider app)
// =====================================================================

import { z } from "zod";
import { phoneSchema, otpCodeSchema } from "../../utils/validators.js";

// { "phone": "+919812345678" }
export const sendOtpSchema = z.object({ phone: phoneSchema });

// { "phone": "+919812345678", "code": "123456" }
export const verifyOtpSchema = z.object({ phone: phoneSchema, code: otpCodeSchema });

// { "refreshToken": "eyJ..." }
export const refreshTokenSchema = z.object({ refreshToken: z.string().min(1).max(2048) });
