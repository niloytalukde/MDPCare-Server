// =====================================================================
// AGENCY PROFILE - routes   (mounted at /api/v1/agencies)
//
//   POST  /api/v1/agencies                      register a new agency
//   GET   /api/v1/agencies/mine                 my agencies (in agency.route.ts)
//   GET   /api/v1/agencies/:agencyId/profile    agency profile (owner, manager, staff)
//   PATCH /api/v1/agencies/:agencyId/profile    update agency profile (owner only)
//
// Login first with /api/v1/provider/auth/verify-otp (same app as providers).
// =====================================================================

import { Router } from "express";
import auth from "../../../middleware/auth.js";
import validate from "../../../middleware/validate.js";
import { AgencyProfileController } from "./agency-profile.controller.js";
import { agencyIdParam, registerAgencySchema, updateAgencyProfileSchema } from "./agency-profile.validation.js";

const router = Router();

router.post("/", auth, validate({ body: registerAgencySchema }), AgencyProfileController.register);

router.get("/:agencyId/profile", auth, validate({ params: agencyIdParam }), AgencyProfileController.getProfile);

router.patch(
    "/:agencyId/profile",
    auth,
    validate({ params: agencyIdParam, body: updateAgencyProfileSchema }),
    AgencyProfileController.updateProfile
);

export const AgencyProfileRoutes = router;
export default router;
