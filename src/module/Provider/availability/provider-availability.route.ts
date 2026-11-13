// =====================================================================
// PROVIDER ONLINE / OFFLINE + LOCATION - routes   (mounted at /api/v1/provider)
//
//   POST /api/v1/provider/online     { latitude, longitude }   go online
//   POST /api/v1/provider/offline                              go offline
//   POST /api/v1/provider/location   { latitude, longitude }   app sends every 30 s
//   GET  /api/v1/provider/location                             my latest location
//
// The location endpoint allows at most 1 call every 10 seconds
// (a buggy app can't flood the server).
// =====================================================================

import { Router } from "express";
import auth from "../../../middleware/auth.js";
import providerAuth from "../../../middleware/providerAuth.js";
import validate from "../../../middleware/validate.js";
import { locationUpdateLimiter } from "../../../middleware/rateLimiter.js";
import * as AvailabilityController from "./provider-availability.controller.js";
import { goOnlineSchema, locationSchema } from "../location/provider-location.validation.js";

const router = Router();

router.post("/online", auth, providerAuth, validate({ body: goOnlineSchema }), AvailabilityController.online);
router.post("/offline", auth, providerAuth, AvailabilityController.offline);

router.post(
    "/location",
    auth,
    providerAuth,
    locationUpdateLimiter,
    validate({ body: locationSchema }),
    AvailabilityController.updateLocation
);
router.get("/location", auth, providerAuth, AvailabilityController.myLocation);

export const ProviderAvailabilityRoutes = router;
export default router;
