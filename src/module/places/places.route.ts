// =====================================================================
// PLACES - routes   (mounted at /api/v1/places, login required)
//
//   GET /search?text=park str&sessionToken=...&latitude=..&longitude=..
//        -> [{ placeId, title, subtitle }]
//   GET /details/:placeId?sessionToken=...
//        -> { latitude, longitude, formattedAddress, area, street, city, state, pincode }
//   GET /reverse-geocode?latitude=..&longitude=..
//        -> { found, formattedAddress, area, street, city, state, pincode }
//
// Each user may call these at most 60 times per minute (Google charges per call).
// =====================================================================

import { Router } from "express";
import auth from "../../middleware/auth.js";
import validate from "../../middleware/validate.js";
import { placesLimiter } from "../../middleware/rateLimiter.js";
import * as PlacesController from "./places.controller.js";
import { searchQuery, placeIdParam, detailsQuery, reverseGeocodeQuery } from "./places.validation.js";

const router = Router();
router.use(auth, placesLimiter);

router.get("/search", validate({ query: searchQuery }), PlacesController.search);
router.get("/details/:placeId", validate({ params: placeIdParam, query: detailsQuery }), PlacesController.details);
router.get("/reverse-geocode", validate({ query: reverseGeocodeQuery }), PlacesController.reverseGeocode);

export const PlacesRoutes = router;
export default router;
