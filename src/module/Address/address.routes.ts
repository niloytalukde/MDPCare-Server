import { Router } from "express";
import { AddressController } from "./address.controller.js";
import auth from "../../middleware/auth.js";
import validate from "../../middleware/validate.js";
import { createAddressSchema, updateAddressSchema } from "./address.validation.js";

const router = Router();

// Protect all address routes with JWT auth middleware
router.use(auth);

// Address CRUD Routes
router.post("/", validate({ body: createAddressSchema }), AddressController.createAddress);
router.get("/", AddressController.getAllAddresses);
router.get("/:id", AddressController.getSingleAddress);
router.patch("/:id", validate({ body: updateAddressSchema }), AddressController.updateAddress);
router.patch("/:id/default", AddressController.setDefaultAddress);
router.delete("/:id", AddressController.deleteAddress);

export const AddressRoutes = router;
export default router;
