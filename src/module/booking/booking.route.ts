import { Router } from "express";
import auth from "../../middleware/auth.js";
import validate from "../../middleware/validate.js";
import requireApprovedProvider from "../../middleware/requireApprovedProvider.js";
import { bookingOtpLimiter } from "../../middleware/rateLimiter.js";
import { idParam } from "../../utils/validators.js";
import * as C from "./booking.controller.js";
import { createBookingSchema, listBookingsQuery, cancelBookingSchema, completeBookingSchema, rejectSchema } from "./booking.validation.js";

// ---------------- /api/v1/bookings (customer) ----------------
const customer = Router();
customer.use(auth);
customer.post("/", validate({ body: createBookingSchema }), C.create);
customer.get("/", validate({ query: listBookingsQuery }), C.listMine);
customer.get("/:id", validate({ params: idParam }), C.getOne);
customer.post("/:id/cancel", validate({ params: idParam, body: cancelBookingSchema }), C.cancel);
customer.post("/:id/completion-otp", bookingOtpLimiter, validate({ params: idParam }), C.completionOtp);

// ---------------- /api/v1/provider/bookings ----------------
const provider = Router();
provider.use(auth, requireApprovedProvider);
provider.get("/requests", C.providerRequests);
provider.get("/", C.providerBookings);
provider.post("/:id/accept", validate({ params: idParam }), C.providerAccept);
provider.post("/:id/reject", validate({ params: idParam, body: rejectSchema }), C.providerReject);
provider.post("/:id/start", validate({ params: idParam }), C.providerStart);
provider.post("/:id/complete", bookingOtpLimiter, validate({ params: idParam, body: completeBookingSchema }), C.providerComplete);

export const BookingRoutes = customer;
export const ProviderBookingRoutes = provider;
export default customer;
