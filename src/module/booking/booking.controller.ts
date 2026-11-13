// =====================================================================
// BOOKING - controllers
//
// Each controller only:  1. reads the request
//                        2. calls one service function
//                        3. sends the reply
// All the rules are in the *.service.ts files.
// =====================================================================

import type { Request, Response } from "express";
import catchAsync from "../../utils/catchAsync.js";
import sendResponse from "../../utils/sendResponse.js";
import { createBooking } from "./booking-create.service.js";
import { getBookingForUser, listCustomerBookings, listProviderBookings } from "./booking-view.service.js";
import { cancelBooking } from "./booking-cancel.service.js";
import { startService, issueCompletionOtp, completeService } from "./booking-work.service.js";
import { providerAccept, providerReject, providerRequests, markProviderRequestsDelivered } from "./booking-accept.service.js";

// ---------------------------------------------------------------
// Small helpers to read values that middleware already checked
// ---------------------------------------------------------------

// logged-in user id (set by the `auth` middleware)
const getUserId = (req: Request) => Number(req.user?.id);

// :id from the URL (checked by validate({ params: idParam }))
const getBookingId = (res: Response) => res.locals.validated.params.id as number;

// the provider (set by the `requireApprovedProvider` middleware)
const getProvider = (res: Response) => res.locals.provider as { id: number; userId: number };

// =====================================================================
// CUSTOMER   /api/v1/bookings
// =====================================================================

// POST /api/v1/bookings
export const create = catchAsync(async (req: Request, res: Response) => {
    const booking = await createBooking(getUserId(req), req.body);
    return sendResponse(res, { success: true, statusCode: 201, message: "Booking created", data: booking });
});

// GET /api/v1/bookings?page=1&limit=20&status=...
export const listMine = catchAsync(async (req: Request, res: Response) => {
    const result = await listCustomerBookings(getUserId(req), res.locals.validated.query);
    return sendResponse(res, {
        success: true,
        statusCode: 200,
        message: "Bookings retrieved",
        data: result.data,
        meta: result.meta,
    });
});

// GET /api/v1/bookings/:id   (customer, provider, agency or admin - see booking-view.service.ts)
export const getOne = catchAsync(async (req: Request, res: Response) => {
    const isAdmin = Boolean(req.user?.roles.includes("ADMIN"));
    const booking = await getBookingForUser(getBookingId(res), { userId: getUserId(req), isAdmin });
    return sendResponse(res, { success: true, statusCode: 200, message: "Booking retrieved", data: booking });
});

// POST /api/v1/bookings/:id/cancel
export const cancel = catchAsync(async (req: Request, res: Response) => {
    const result = await cancelBooking(getBookingId(res), { userId: getUserId(req), kind: "CUSTOMER" }, req.body.reason);
    return sendResponse(res, { success: true, statusCode: 200, message: "Booking cancelled", data: result });
});

// POST /api/v1/bookings/:id/completion-otp
export const completionOtp = catchAsync(async (req: Request, res: Response) => {
    const result = await issueCompletionOtp(getBookingId(res), getUserId(req));
    return sendResponse(res, {
        success: true,
        statusCode: 200,
        message: "Share this code with your service professional when the job is done",
        data: result,
    });
});

// =====================================================================
// INDIVIDUAL PROVIDER   /api/v1/provider/bookings
// =====================================================================

// GET /api/v1/provider/bookings/requests   (new job requests)
export const providerRequestList = catchAsync(async (_req: Request, res: Response) => {
    const providerId = getProvider(res).id;

    const requests = await providerRequests(providerId);
    await markProviderRequestsDelivered(providerId); // SENT -> DELIVERED

    return sendResponse(res, { success: true, statusCode: 200, message: "Open booking requests", data: requests });
});

// GET /api/v1/provider/bookings   (my accepted bookings)
export const providerBookingList = catchAsync(async (_req: Request, res: Response) => {
    const bookings = await listProviderBookings(getProvider(res).id);
    return sendResponse(res, { success: true, statusCode: 200, message: "Bookings retrieved", data: bookings });
});

// POST /api/v1/provider/bookings/:id/accept
export const providerAcceptBooking = catchAsync(async (_req: Request, res: Response) => {
    const result = await providerAccept(getBookingId(res), getProvider(res));
    return sendResponse(res, { success: true, statusCode: 200, message: "Booking accepted", data: result });
});

// POST /api/v1/provider/bookings/:id/reject
export const providerRejectBooking = catchAsync(async (_req: Request, res: Response) => {
    const result = await providerReject(getBookingId(res), getProvider(res).id);
    return sendResponse(res, { success: true, statusCode: 200, message: "Booking request rejected", data: result });
});

// POST /api/v1/provider/bookings/:id/start
export const providerStartBooking = catchAsync(async (_req: Request, res: Response) => {
    const provider = getProvider(res);
    const result = await startService(getBookingId(res), {
        kind: "PROVIDER",
        userId: provider.userId,
        providerId: provider.id,
    });
    return sendResponse(res, { success: true, statusCode: 200, message: "Service started", data: result });
});

// POST /api/v1/provider/bookings/:id/complete   { "otp": "123456" }
export const providerCompleteBooking = catchAsync(async (req: Request, res: Response) => {
    const provider = getProvider(res);
    const result = await completeService(
        getBookingId(res),
        { kind: "PROVIDER", userId: provider.userId, providerId: provider.id },
        req.body.otp
    );
    return sendResponse(res, { success: true, statusCode: 200, message: "Service completed", data: result });
});
