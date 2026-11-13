import { Router } from "express";
import { userController } from "./user.controller.js";
import auth from "../../middleware/auth.js";
import requireRole from "../../middleware/requireRole.js";
import validate from "../../middleware/validate.js";
import { idParam } from "../../utils/validators.js";
import { createUserSchema, updateUserSchema, listUsersQuery } from "./user.validation.js";

const router = Router();

// SEC-01: user administration is ADMIN-only. Customers manage themselves via /auth/me and /auth/profile.
router.use(auth, requireRole("ADMIN"));

router.post("/", validate({ body: createUserSchema }), userController.createUser);
router.get("/", validate({ query: listUsersQuery }), userController.getAllUsers);
router.get("/:id", validate({ params: idParam }), userController.getSingleUser);
router.patch("/:id", validate({ params: idParam, body: updateUserSchema }), userController.updateUser);
router.delete("/:id", validate({ params: idParam }), userController.deleteUser);

export const UserRoutes = router;
export default router;
