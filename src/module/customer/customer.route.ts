// =====================================================================
// CUSTOMER - routes   (mounted at /api/v1/customer)
//
//   GET   /api/v1/customer/profile   -> my profile
//   PATCH /api/v1/customer/profile   -> update my profile
//
// Login / registration for customers is in /api/v1/auth (Auth module).
// =====================================================================

import { Router } from "express";
import auth from "../../middleware/auth.js";
import validate from "../../middleware/validate.js";
import { CustomerController } from "./customer.controller.js";
import { updateCustomerProfileSchema } from "./customer.validation.js";

const router = Router();

// Every customer route needs a logged-in user
router.use(auth);

router.get("/profile", CustomerController.getMyProfile);
router.patch("/profile", validate({ body: updateCustomerProfileSchema }), CustomerController.updateMyProfile);

export const CustomerRoutes = router;
export default router;
