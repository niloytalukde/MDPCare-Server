import { Router } from "express";
import { CategoryController } from "./category.controller.js";
import auth from "../../../middleware/auth.js";
import requireRole from "../../../middleware/requireRole.js";

const router = Router();

// Public routes for browsing categories
router.get("/", CategoryController.getAllCategories);
router.get("/:id", CategoryController.getSingleCategory);

// SEC-02: catalog writes are ADMIN-only
router.post("/", auth, requireRole("ADMIN"), CategoryController.createCategory);
router.patch("/:id", auth, requireRole("ADMIN"), CategoryController.updateCategory);
router.delete("/:id", auth, requireRole("ADMIN"), CategoryController.deleteCategory);

export const CategoryRoutes = router;
export default router;
