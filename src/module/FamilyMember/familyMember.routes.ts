import { Router } from "express";
import { FamilyMemberController } from "./familyMember.controller.js";
import auth from "../../middleware/auth.js";

const router = Router();

// Protect all family member routes with JWT auth middleware
router.use(auth);

// Family Member CRUD Routes
router.post("/", FamilyMemberController.createFamilyMember);
router.get("/", FamilyMemberController.getAllFamilyMembers);
router.get("/:id", FamilyMemberController.getSingleFamilyMember);
router.patch("/:id", FamilyMemberController.updateFamilyMember);
router.delete("/:id", FamilyMemberController.deleteFamilyMember);

export const FamilyMemberRoutes = router;
export default router;
