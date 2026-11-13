import { Router } from "express";
import auth from "../../middleware/auth.js";
import validate from "../../middleware/validate.js";
import { bookingOtpLimiter } from "../../middleware/rateLimiter.js";
import * as C from "./agency.controller.js";
import * as V from "./agency.validation.js";
import { AgencyProfileRoutes } from "./profile/agency-profile.route.js";

// Mounted at /api/v1/agencies. Every route requires auth; agency-scoped routes
// additionally verify membership of the :agencyId in the URL (agency.access.ts).
const router = Router();
router.use(auth);

// Register / agency profile / update profile  (profile/agency-profile.route.ts)
router.use("/", AgencyProfileRoutes);

// My memberships
router.get("/mine", C.mine);

// Staff self-service (static paths before /:agencyId)
router.post("/memberships/:memberId/accept", validate({ params: V.memberIdParam }), C.acceptMembership);
router.get("/assignments", C.myAssignments);
router.post("/assignments/:assignmentId/accept", validate({ params: V.assignmentIdParam }), C.acceptAssignment);
router.post("/assignments/:assignmentId/reject", validate({ params: V.assignmentIdParam, body: V.respondSchema }), C.rejectAssignment);
router.post("/assignments/:assignmentId/start", validate({ params: V.assignmentIdParam }), C.startAssignment);
router.post("/assignments/:assignmentId/complete", bookingOtpLimiter, validate({ params: V.assignmentIdParam, body: V.completeSchema }), C.completeAssignment);

// Owner: agency setup
router.patch("/:agencyId/availability", validate({ params: V.agencyIdParam, body: V.agencyAvailabilitySchema }), C.setAvailability);
router.put("/:agencyId/services", validate({ params: V.agencyIdParam, body: V.agencyServiceSchema }), C.upsertService);
router.get("/:agencyId/members", validate({ params: V.agencyIdParam }), C.listMembers);
router.post("/:agencyId/members", validate({ params: V.agencyIdParam, body: V.addStaffSchema }), C.addStaff);
router.patch("/:agencyId/members/:memberId", validate({ params: V.agencyMemberParams, body: V.memberStatusSchema }), C.setMemberStatus);
router.put("/:agencyId/members/:memberId/services", validate({ params: V.agencyMemberParams, body: V.staffServicesSchema }), C.setStaffServices);

// Owner: bookings
router.get("/:agencyId/booking-requests", validate({ params: V.agencyIdParam }), C.bookingRequests);
router.get("/:agencyId/bookings", validate({ params: V.agencyIdParam }), C.agencyBookings);
router.post("/:agencyId/bookings/:bookingId/accept", validate({ params: V.agencyBookingParams }), C.acceptBooking);
router.post("/:agencyId/bookings/:bookingId/reject", validate({ params: V.agencyBookingParams }), C.rejectBooking);
router.post("/:agencyId/bookings/:bookingId/assign", validate({ params: V.agencyBookingParams, body: V.assignStaffSchema }), C.assignStaff);
router.get("/:agencyId/bookings/:bookingId/assignment-history", validate({ params: V.agencyBookingParams }), C.history);

export const AgencyRoutes = router;
export default router;
