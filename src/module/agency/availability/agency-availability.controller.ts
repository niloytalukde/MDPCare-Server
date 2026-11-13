// =====================================================================
// AGENCY ONLINE / OFFLINE - controllers
// =====================================================================

import type { Request, Response } from "express";
import catchAsync from "../../../utils/catchAsync.js";
import sendResponse from "../../../utils/sendResponse.js";
import { goOnline, goOffline } from "./agency-availability.service.js";

const getUserId = (req: Request) => Number(req.user?.id);
const getAgencyId = (res: Response) => (res.locals.validated.params as { agencyId: number }).agencyId;

// POST /api/v1/agencies/:agencyId/online
export const online = catchAsync(async (req: Request, res: Response) => {
    const result = await goOnline(getUserId(req), getAgencyId(res));
    return sendResponse(res, { success: true, statusCode: 200, message: "Agency is online", data: result });
});

// POST /api/v1/agencies/:agencyId/offline
export const offline = catchAsync(async (req: Request, res: Response) => {
    const result = await goOffline(getUserId(req), getAgencyId(res));
    return sendResponse(res, { success: true, statusCode: 200, message: "Agency is offline", data: result });
});
