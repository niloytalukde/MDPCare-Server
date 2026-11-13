import { Router } from "express";
import { ProviderAuthRoutes } from "./Auth/provider-auth.route.js";
import { ProviderProfileRoutes } from "./profile/provider-profile.route.js";
import { ProviderBookingRoutes } from "../booking/booking.route.js";
import { ProviderController } from "./provider.controller.js";
import auth from "../../middleware/auth.js";
import providerAuth from "../../middleware/providerAuth.js";
import validate from "../../middleware/validate.js";
import { upsertProviderServiceSchema, providerAvailabilitySchema } from "./provider.validation.js";

const router = Router();

// Login (individual providers AND agency people)
router.use("/auth", ProviderAuthRoutes);

// Register / my profile / update profile (individual providers)
router.use("/", ProviderProfileRoutes);

router.use("/bookings", ProviderBookingRoutes);

// Onboarding / setup (approval not required to configure, only to go ONLINE)
router.get("/services", auth, providerAuth, ProviderController.listServices);
router.put("/services", auth, providerAuth, validate({ body: upsertProviderServiceSchema }), ProviderController.upsertService);
router.patch("/availability", auth, providerAuth, validate({ body: providerAvailabilitySchema }), ProviderController.setAvailability);

export const ProviderRoutes = router;
export default router;
