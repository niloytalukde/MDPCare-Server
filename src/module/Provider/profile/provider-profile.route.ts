// =====================================================================
// INDIVIDUAL PROVIDER PROFILE - routes   (mounted at /api/v1/provider)
//
//   POST  /api/v1/provider/register   register as an individual provider
//   GET   /api/v1/provider/profile    my provider profile
//   PATCH /api/v1/provider/profile    update my provider profile
//
// Login first with /api/v1/provider/auth/verify-otp.
// =====================================================================

import { Router } from "express";
import auth from "../../../middleware/auth.js";
import validate from "../../../middleware/validate.js";
import { ProviderProfileController } from "./provider-profile.controller.js";
import { registerProviderSchema, updateProviderProfileSchema } from "./provider-profile.validation.js";

const router = Router();

router.post("/register", auth, validate({ body: registerProviderSchema }), ProviderProfileController.register);
router.get("/profile", auth, ProviderProfileController.getMyProfile);
router.patch("/profile", auth, validate({ body: updateProviderProfileSchema }), ProviderProfileController.updateMyProfile);

export const ProviderProfileRoutes = router;
export default router;
