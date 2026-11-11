import { Router } from "express";
import { AuthController } from "./auth.controller.js";
import auth from "../../middleware/auth.js";

const router = Router();

// Public authentication routes
router.post("/send-otp", AuthController.sendOTP);
router.post("/verify-otp", AuthController.verifyOTP);
router.post("/refresh-token", AuthController.refreshAccessToken);

// Protected routes (requires Bearer JWT access token)
router.get("/me", auth, AuthController.getMyProfile);
router.patch("/profile", auth, AuthController.updateProfile);

export const AuthRoutes = router;
export default router;
