import { Router } from "express";
import { ProviderAuthRoutes } from "./Auth/provider-auth.route.js";
import { ProviderProfileRoutes } from "./profile/provider-profile.route.js";
import { ProviderBookingRoutes } from "../booking/booking.route.js";
import { ProviderController } from "./provider.controller.js";
import auth from "../../middleware/auth.js";
import providerAuth from "../../middleware/providerAuth.js";
import validate from "../../middleware/validate.js";
import { upsertProviderServiceSchema } from "./provider.validation.js";
import { ProviderAvailabilityRoutes } from "./availability/provider-availability.route.js";

const router = Router();

// Login (individual providers AND agency people)
router.use("/auth", ProviderAuthRoutes);

// Register / my profile / update profile (individual providers)
router.use("/", ProviderProfileRoutes);

// Online / offline / live location
router.use("/", ProviderAvailabilityRoutes);

router.use("/bookings", ProviderBookingRoutes);

// Services I offer (approval not required to set these up)
router.get("/services", auth, providerAuth, ProviderController.listServices);
router.put("/services", auth, providerAuth, validate({ body: upsertProviderServiceSchema }), ProviderController.upsertService);

export const ProviderRoutes = router;
export default router;
