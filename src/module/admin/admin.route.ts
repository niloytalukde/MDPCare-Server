import { Router } from "express";
import { z } from "zod";
import auth from "../../middleware/auth.js";
import requireRole from "../../middleware/requireRole.js";
import validate from "../../middleware/validate.js";
import catchAsync from "../../utils/catchAsync.js";
import sendResponse from "../../utils/sendResponse.js";
import { idParam } from "../../utils/validators.js";
import { prisma } from "../../lib/prisma.js";
import { cancelBooking } from "../booking/booking.service.js";

const approvalSchema = z.object({
    status: z.enum(["PENDING", "APPROVED", "REJECTED", "SUSPENDED"]),
    verificationStatus: z.enum(["NOT_SUBMITTED", "PENDING", "VERIFIED", "REJECTED"]).optional(),
    rejectionReason: z.string().trim().max(500).optional(),
});
const accountStatusSchema = z.object({ accountStatus: z.enum(["ACTIVE", "BLOCKED", "DELETED"]) });
const cancelSchema = z.object({ reason: z.string().trim().min(1).max(500) });

const router = Router();
router.use(auth, requireRole("ADMIN"));

// PRV-03: provider approval
router.patch("/providers/:id/approval", validate({ params: idParam, body: approvalSchema }), catchAsync(async (req, res) => {
    const now = new Date();
    const b = req.body as z.infer<typeof approvalSchema>;
    const data = await prisma.providerProfile.update({
        where: { id: res.locals.validated.params.id },
        data: {
            status: b.status,
            ...(b.verificationStatus && { verificationStatus: b.verificationStatus }),
            rejectionReason: b.rejectionReason ?? null,
            ...(b.status === "APPROVED" && { approvedAt: now }),
            ...(b.verificationStatus === "VERIFIED" && { verifiedAt: now }),
            // Suspended/rejected providers are taken offline immediately
            ...(b.status !== "APPROVED" && { availabilityStatus: "OFFLINE", isAvailable: false }),
        },
        select: { id: true, status: true, verificationStatus: true, availabilityStatus: true },
    });
    sendResponse(res, { success: true, statusCode: 200, message: "Provider updated", data });
}));

router.patch("/agencies/:id/approval", validate({ params: idParam, body: approvalSchema }), catchAsync(async (req, res) => {
    const now = new Date();
    const b = req.body as z.infer<typeof approvalSchema>;
    const data = await prisma.agency.update({
        where: { id: res.locals.validated.params.id },
        data: {
            status: b.status,
            ...(b.verificationStatus && { verificationStatus: b.verificationStatus }),
            rejectionReason: b.rejectionReason ?? null,
            ...(b.status === "APPROVED" && { approvedAt: now }),
            ...(b.verificationStatus === "VERIFIED" && { verifiedAt: now }),
            ...(b.status !== "APPROVED" && { availabilityStatus: "OFFLINE" }),
        },
        select: { id: true, status: true, verificationStatus: true, availabilityStatus: true },
    });
    sendResponse(res, { success: true, statusCode: 200, message: "Agency updated", data });
}));

// Blocking a user also revokes all their tokens (tokenVersion bump)
router.patch("/users/:id/status", validate({ params: idParam, body: accountStatusSchema }), catchAsync(async (req, res) => {
    const id = res.locals.validated.params.id as number;
    if (id === req.user?.id) {
        return sendResponse(res, { success: false, statusCode: 400, message: "You cannot change your own account status" });
    }
    const data = await prisma.user.update({
        where: { id },
        data: { accountStatus: req.body.accountStatus, ...(req.body.accountStatus !== "ACTIVE" && { tokenVersion: { increment: 1 } }) },
        select: { id: true, accountStatus: true },
    });
    sendResponse(res, { success: true, statusCode: 200, message: "User status updated", data });
}));

router.post("/bookings/:id/cancel", validate({ params: idParam, body: cancelSchema }), catchAsync(async (req, res) => {
    const data = await cancelBooking(res.locals.validated.params.id, { userId: Number(req.user?.id), kind: "ADMIN" }, req.body.reason);
    sendResponse(res, { success: true, statusCode: 200, message: "Booking cancelled", data });
}));

export const AdminRoutes = router;
export default router;
