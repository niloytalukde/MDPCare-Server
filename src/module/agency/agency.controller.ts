import type { Request, Response } from "express";
import catchAsync from "../../utils/catchAsync.js";
import sendResponse from "../../utils/sendResponse.js";
import * as Agency from "./agency.service.js";
import * as Assign from "./agency-assignment.service.js";
import * as Accept from "../booking/booking-accept.service.js";
import * as Booking from "../booking/booking.service.js";
import { requireAgencyMember, requireApprovedAgencyOwner } from "./agency.access.js";

const uid = (req: Request) => Number(req.user?.id);
const p = (res: Response) => res.locals.validated.params as { agencyId: number; bookingId: number; memberId: number; assignmentId: number };
const ok = (res: Response, message: string, data?: unknown, statusCode = 200) => sendResponse(res, { success: true, statusCode, message, data });
const owner = (req: Request, res: Response) => requireAgencyMember(uid(req), p(res).agencyId, ["OWNER"]);

// ---- My agencies (registration is in profile/agency-profile.controller.ts) ----
export const mine = catchAsync(async (req, res) => ok(res, "Memberships retrieved", await Agency.myAgencies(uid(req))));

// ---- Owner management ----
export const upsertService = catchAsync(async (req, res) => {
    await owner(req, res);
    return ok(res, "Service saved", await Agency.upsertAgencyService(p(res).agencyId, req.body));
});
export const listMembers = catchAsync(async (req, res) => {
    await owner(req, res);
    return ok(res, "Members retrieved", await Agency.listMembers(p(res).agencyId));
});
export const addStaff = catchAsync(async (req, res) => {
    await owner(req, res);
    return ok(res, "Staff invited", await Agency.addStaff(p(res).agencyId, req.body), 201);
});
export const setMemberStatus = catchAsync(async (req, res) => {
    await owner(req, res);
    return ok(res, "Member updated", await Agency.setMemberStatus(p(res).agencyId, p(res).memberId, req.body.status));
});
export const setStaffServices = catchAsync(async (req, res) => {
    await owner(req, res);
    return ok(res, "Qualifications updated", await Agency.setStaffServices(p(res).agencyId, p(res).memberId, req.body.serviceIds));
});

// ---- Owner booking handling ----
export const bookingRequests = catchAsync(async (req, res) => {
    await owner(req, res);
    return ok(res, "Open booking requests", await Accept.agencyRequests(p(res).agencyId));
});
export const agencyBookings = catchAsync(async (req, res) => {
    await owner(req, res);
    return ok(res, "Bookings retrieved", await Assign.listAgencyBookings(p(res).agencyId));
});
export const acceptBooking = catchAsync(async (req, res) => {
    await requireApprovedAgencyOwner(uid(req), p(res).agencyId);
    return ok(res, "Booking accepted - assign a staff member next", await Accept.agencyAccept(p(res).bookingId, { userId: uid(req), agencyId: p(res).agencyId }));
});
export const rejectBooking = catchAsync(async (req, res) => {
    await owner(req, res);
    return ok(res, "Booking request rejected", await Accept.agencyReject(p(res).bookingId, p(res).agencyId));
});
export const assignStaff = catchAsync(async (req, res) => {
    const m = await requireApprovedAgencyOwner(uid(req), p(res).agencyId);
    return ok(res, "Staff assigned", await Assign.assignStaff(p(res).agencyId, p(res).bookingId, { memberId: m.id }, req.body));
});
export const history = catchAsync(async (req, res) => {
    await owner(req, res);
    return ok(res, "Assignment history", await Assign.assignmentHistory(p(res).agencyId, p(res).bookingId));
});

// ---- Staff (scoped to the caller's own memberships/assignments) ----
export const acceptMembership = catchAsync(async (req, res) => ok(res, "Joined agency", await Agency.acceptMembership(uid(req), p(res).memberId)));
export const myAssignments = catchAsync(async (req, res) => ok(res, "Assignments retrieved", await Assign.listMyAssignments(uid(req))));
export const acceptAssignment = catchAsync(async (req, res) => ok(res, "Assignment accepted", await Assign.respondToAssignment(uid(req), p(res).assignmentId, "ACCEPT")));
export const rejectAssignment = catchAsync(async (req, res) =>
    ok(res, "Assignment rejected", await Assign.respondToAssignment(uid(req), p(res).assignmentId, "REJECT", req.body.reason))
);
export const startAssignment = catchAsync(async (req, res) => {
    const { bookingId, performer } = await Assign.performerForAssignment(uid(req), p(res).assignmentId);
    return ok(res, "Service started", await Booking.startService(bookingId, performer));
});
export const completeAssignment = catchAsync(async (req, res) => {
    const { bookingId, performer } = await Assign.performerForAssignment(uid(req), p(res).assignmentId);
    return ok(res, "Service completed", await Booking.completeService(bookingId, performer, req.body.otp));
});
