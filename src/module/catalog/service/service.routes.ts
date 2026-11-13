import { Router } from "express";
import { ServiceController } from "./service.controller.js";
import auth from "../../../middleware/auth.js";
import requireRole from "../../../middleware/requireRole.js";

const router = Router();

// Public routes for browsing services
router.get("/", ServiceController.getAllServices);
router.get("/:id", ServiceController.getSingleService);

// SEC-02: catalog writes are ADMIN-only
router.post("/", auth, requireRole("ADMIN"), ServiceController.createService);
router.patch("/:id", auth, requireRole("ADMIN"), ServiceController.updateService);
router.delete("/:id", auth, requireRole("ADMIN"), ServiceController.deleteService);

export const ServiceRoutes = router;
export default router;
