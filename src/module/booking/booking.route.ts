// =====================================================================
// BOOKING - routes
//
// CUSTOMER   (mounted at /api/v1/bookings)
//   POST /                      create a booking
//   GET  /                      my bookings (?page, ?limit, ?status)
//   GET  /:id                   one booking
//   POST /:id/cancel            cancel
//   POST /:id/completion-otp    get the code to give the worker at the end
//
// INDIVIDUAL PROVIDER   (mounted at /api/v1/provider/bookings)
//   GET  /requests              new job requests
//   GET  /                      my accepted bookings
//   POST /:id/accept            accept a request
//   POST /:id/reject            reject a request
//   POST /:id/start             start the job
//   POST /:id/complete          finish the job with the customer's code
//
// AGENCY booking routes are in agency/agency.route.ts
// (/api/v1/agencies/:agencyId/bookings/... and /api/v1/agencies/assignments/...)
// =====================================================================

import { Router } from "express";
import auth from "../../middleware/auth.js";
import validate from "../../middleware/validate.js";
import requireApprovedProvider from "../../middleware/requireApprovedProvider.js";
import { bookingOtpLimiter } from "../../middleware/rateLimiter.js";
import { idParam } from "../../utils/validators.js";
import * as BookingController from "./booking.controller.js";
import {
    createBookingSchema,
    listBookingsQuery,
    cancelBookingSchema,
    completeBookingSchema,
    rejectSchema,
} from "./booking.validation.js";

// ---------------------------------------------------------------
// Customer routes: any logged-in user
// ---------------------------------------------------------------

const customerRouter = Router();
customerRouter.use(auth);

customerRouter.post("/", validate({ body: createBookingSchema }), BookingController.create);
customerRouter.get("/", validate({ query: listBookingsQuery }), BookingController.listMine);
customerRouter.get("/:id", validate({ params: idParam }), BookingController.getOne);
customerRouter.post("/:id/cancel", validate({ params: idParam, body: cancelBookingSchema }), BookingController.cancel);
customerRouter.post("/:id/completion-otp", bookingOtpLimiter, validate({ params: idParam }), BookingController.completionOtp);

// ---------------------------------------------------------------
// Provider routes: provider must be APPROVED and VERIFIED by the admin
// ---------------------------------------------------------------

const providerRouter = Router();
providerRouter.use(auth, requireApprovedProvider);

providerRouter.get("/requests", BookingController.providerRequestList);
providerRouter.get("/", BookingController.providerBookingList);
providerRouter.post("/:id/accept", validate({ params: idParam }), BookingController.providerAcceptBooking);
providerRouter.post("/:id/reject", validate({ params: idParam, body: rejectSchema }), BookingController.providerRejectBooking);
providerRouter.post("/:id/start", validate({ params: idParam }), BookingController.providerStartBooking);
providerRouter.post(
    "/:id/complete",
    bookingOtpLimiter,
    validate({ params: idParam, body: completeBookingSchema }),
    BookingController.providerCompleteBooking
);

export const BookingRoutes = customerRouter;
export const ProviderBookingRoutes = providerRouter;
export default customerRouter;
