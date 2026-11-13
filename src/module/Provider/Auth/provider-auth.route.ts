// =====================================================================
// PROVIDER APP - login routes   (mounted at /api/v1/provider/auth)
//
//   POST  /send-otp        public
//   POST  /verify-otp      public  -> returns account.nextStep (see service)
//   POST  /refresh-token   public
//   POST  /logout          logged in
//   GET   /me              logged in -> who am I (provider / agency / new)
//   PATCH /me              logged in -> update my personal details
//
// Works for individual providers AND agency owners / managers / staff.
// =====================================================================

import { Router } from "express";
import auth from "../../../middleware/auth.js";
import validate from "../../../middleware/validate.js";
import { otpSendLimiter, otpVerifyLimiter, refreshLimiter } from "../../../middleware/rateLimiter.js";
import { ProviderAuthController } from "./provider-auth.controller.js";
import { AuthController } from "../../Auth/auth.controller.js";
import { sendOtpSchema, verifyOtpSchema, refreshTokenSchema, updatePersonalDetailsSchema } from "./provider-auth.validation.js";

const router = Router();

// Public
router.post("/send-otp", otpSendLimiter, validate({ body: sendOtpSchema }), ProviderAuthController.sendOTP);
router.post("/verify-otp", otpVerifyLimiter, validate({ body: verifyOtpSchema }), ProviderAuthController.verifyOTP);
router.post("/refresh-token", refreshLimiter, validate({ body: refreshTokenSchema }), AuthController.refreshAccessToken);

// Logged in
router.post("/logout", auth, AuthController.logout);
router.get("/me", auth, ProviderAuthController.getMyAccount);
router.patch("/me", auth, validate({ body: updatePersonalDetailsSchema }), ProviderAuthController.updateMyPersonalDetails);

export const ProviderAuthRoutes = router;
export default router;
