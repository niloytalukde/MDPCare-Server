import { Router } from "express";
import { CategoryController } from "./category.controller.js";
import auth from "../../../middleware/auth.js";

const router = Router();

// Public routes for browsing categories
router.get("/", CategoryController.getAllCategories);
router.get("/:id", CategoryController.getSingleCategory);

// Protected routes (admin/authorized)
router.post("/", auth, CategoryController.createCategory);
router.patch("/:id", auth, CategoryController.updateCategory);
router.delete("/:id", auth, CategoryController.deleteCategory);

export const CategoryRoutes = router;
export default router;
