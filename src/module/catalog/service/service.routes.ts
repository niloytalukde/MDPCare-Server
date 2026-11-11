import { Router } from "express";
import { ServiceController } from "./service.controller.js";
import auth from "../../../middleware/auth.js";

const router = Router();

// Public routes for browsing services
router.get("/", ServiceController.getAllServices);
router.get("/:id", ServiceController.getSingleService);

// Protected routes (admin/authorized)
router.post("/", auth, ServiceController.createService);
router.patch("/:id", auth, ServiceController.updateService);
router.delete("/:id", auth, ServiceController.deleteService);

export const ServiceRoutes = router;
export default router;
