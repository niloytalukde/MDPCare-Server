// =====================================================================
// CUSTOMER APP - login routes   (mounted at /api/v1/auth)
//
//   POST  /api/v1/auth/send-otp        public
//   POST  /api/v1/auth/verify-otp      public  (first login = registration)
//   POST  /api/v1/auth/refresh-token   public
//   POST  /api/v1/auth/logout          logged in
//
//   GET   /api/v1/auth/me              same as GET   /api/v1/customer/profile
//   PATCH /api/v1/auth/profile         same as PATCH /api/v1/customer/profile
//   (kept so older app code keeps working)
// =====================================================================

import { Router } from "express";
import auth from "../../middleware/auth.js";
import validate from "../../middleware/validate.js";
import { otpSendLimiter, otpVerifyLimiter, refreshLimiter } from "../../middleware/rateLimiter.js";
import { AuthController } from "./auth.controller.js";
import { sendOtpSchema, verifyOtpSchema, refreshTokenSchema } from "./auth.validation.js";
import { CustomerController } from "../customer/customer.controller.js";
import { updateCustomerProfileSchema } from "../customer/customer.validation.js";

const router = Router();

// Public
router.post("/send-otp", otpSendLimiter, validate({ body: sendOtpSchema }), AuthController.sendOTP);
router.post("/verify-otp", otpVerifyLimiter, validate({ body: verifyOtpSchema }), AuthController.verifyOTP);
router.post("/refresh-token", refreshLimiter, validate({ body: refreshTokenSchema }), AuthController.refreshAccessToken);

// Logged in
router.post("/logout", auth, AuthController.logout);

// Old paths for the customer profile
router.get("/me", auth, CustomerController.getMyProfile);
router.patch("/profile", auth, validate({ body: updateCustomerProfileSchema }), CustomerController.updateMyProfile);

export const AuthRoutes = router;
export default router;
