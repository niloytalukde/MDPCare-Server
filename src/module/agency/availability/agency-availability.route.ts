// =====================================================================
// AGENCY ONLINE / OFFLINE - routes   (mounted at /api/v1/agencies)
//
//   POST /api/v1/agencies/:agencyId/online    (owner or manager)
//   POST /api/v1/agencies/:agencyId/offline   (owner or manager)
// =====================================================================

import { Router } from "express";
import auth from "../../../middleware/auth.js";
import validate from "../../../middleware/validate.js";
import * as AgencyAvailabilityController from "./agency-availability.controller.js";
import { agencyIdParam } from "../profile/agency-profile.validation.js";

const router = Router();

router.post("/:agencyId/online", auth, validate({ params: agencyIdParam }), AgencyAvailabilityController.online);
router.post("/:agencyId/offline", auth, validate({ params: agencyIdParam }), AgencyAvailabilityController.offline);

export const AgencyAvailabilityRoutes = router;
export default router;
