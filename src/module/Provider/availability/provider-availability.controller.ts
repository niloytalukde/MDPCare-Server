// =====================================================================
// PROVIDER ONLINE / OFFLINE + LOCATION - controllers
// =====================================================================

import type { Request, Response } from "express";
import catchAsync from "../../../utils/catchAsync.js";
import sendResponse from "../../../utils/sendResponse.js";
import { goOnline, goOffline } from "./provider-availability.service.js";
import { updateMyLocation, getMyLocation } from "../location/provider-location.service.js";

const getUserId = (req: Request) => Number(req.user?.id);

// POST /api/v1/provider/online     { latitude, longitude }
export const online = catchAsync(async (req: Request, res: Response) => {
    const result = await goOnline(getUserId(req), req.body.latitude, req.body.longitude);
    return sendResponse(res, { success: true, statusCode: 200, message: "You are online", data: result });
});

// POST /api/v1/provider/offline
export const offline = catchAsync(async (req: Request, res: Response) => {
    const result = await goOffline(getUserId(req));
    return sendResponse(res, { success: true, statusCode: 200, message: "You are offline", data: result });
});

// POST /api/v1/provider/location   { latitude, longitude }   (every 30 seconds)
export const updateLocation = catchAsync(async (req: Request, res: Response) => {
    const result = await updateMyLocation(getUserId(req), req.body.latitude, req.body.longitude);
    return sendResponse(res, { success: true, statusCode: 200, message: "Location updated", data: result });
});

// GET /api/v1/provider/location
export const myLocation = catchAsync(async (req: Request, res: Response) => {
    const result = await getMyLocation(getUserId(req));
    return sendResponse(res, { success: true, statusCode: 200, message: "Location retrieved", data: result });
});
