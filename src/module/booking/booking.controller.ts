import type { Request, Response } from "express";
import catchAsync from "../../utils/catchAsync.js";
import sendResponse from "../../utils/sendResponse.js";
import * as Booking from "./booking.service.js";
import * as Accept from "./booking-accept.service.js";
import { prisma } from "../../lib/prisma.js";

const uid = (req: Request) => Number(req.user?.id);
const id = (res: Response) => res.locals.validated.params.id as number;
const ok = (res: Response, message: string, data?: unknown, statusCode = 200, meta?: Record<string, unknown>) =>
    sendResponse(res, { success: true, statusCode, message, data, ...(meta && { meta }) });

// ---------------- Customer ----------------
export const create = catchAsync(async (req, res) => ok(res, "Booking created", await Booking.createBooking(uid(req), req.body), 201));

export const listMine = catchAsync(async (req, res) => {
    const r = await Booking.listCustomerBookings(uid(req), res.locals.validated.query);
    return ok(res, "Bookings retrieved", r.data, 200, r.meta);
});

export const getOne = catchAsync(async (req, res) =>
    ok(res, "Booking retrieved", await Booking.getBookingForUser(id(res), { userId: uid(req), isAdmin: Boolean(req.user?.roles.includes("ADMIN")) }))
);

export const cancel = catchAsync(async (req, res) =>
    ok(res, "Booking cancelled", await Booking.cancelBooking(id(res), { userId: uid(req), kind: "CUSTOMER" }, req.body.reason))
);

export const completionOtp = catchAsync(async (req, res) =>
    ok(res, "Share this code with your service professional when the job is done", await Booking.issueCompletionOtp(id(res), uid(req)))
);

// ---------------- Provider ----------------
const provider = (res: Response) => res.locals.provider as { id: number; userId: number };

export const providerRequests = catchAsync(async (_req, res) => {
    const data = await Accept.providerRequests(provider(res).id);
    await Accept.markProviderRequestsDelivered(provider(res).id);
    return ok(res, "Open booking requests", data);
});

export const providerBookings = catchAsync(async (_req, res) => {
    const data = await prisma.booking.findMany({
        where: { providerId: provider(res).id },
        orderBy: { createdAt: "desc" },
        take: 50,
        include: { items: true },
    });
    return ok(res, "Bookings retrieved", data);
});

export const providerAccept = catchAsync(async (_req, res) => ok(res, "Booking accepted", await Accept.providerAccept(id(res), provider(res))));
export const providerReject = catchAsync(async (_req, res) => ok(res, "Booking request rejected", await Accept.providerReject(id(res), provider(res).id)));

export const providerStart = catchAsync(async (_req, res) =>
    ok(res, "Service started", await Booking.startService(id(res), { kind: "PROVIDER", userId: provider(res).userId, providerId: provider(res).id }))
);

export const providerComplete = catchAsync(async (req, res) =>
    ok(res, "Service completed", await Booking.completeService(id(res), { kind: "PROVIDER", userId: provider(res).userId, providerId: provider(res).id }, req.body.otp))
);
