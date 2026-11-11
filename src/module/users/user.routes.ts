import { Router } from "express";
import { userController } from "./user.controller.js";
import auth from "../../middleware/auth.js";

const router = Router();

router.post("/", userController.createUser);
router.get("/", auth, userController.getAllUsers);
router.get("/:id", auth, userController.getSingleUser);
router.patch("/:id", auth, userController.updateUser);
router.delete("/:id", auth, userController.deleteUser);

export const UserRoutes = router;
export default router;
