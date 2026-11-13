// =====================================================================
// PLACES - controllers
// =====================================================================

import type { Request, Response } from "express";
import catchAsync from "../../utils/catchAsync.js";
import sendResponse from "../../utils/sendResponse.js";
import { searchPlaces, getPlaceDetails, addressFromGps } from "./places.service.js";

// Values already checked by validate(...) in places.route.ts
const getQuery = <T>(res: Response) => res.locals.validated.query as T;
const getParams = <T>(res: Response) => res.locals.validated.params as T;

// GET /api/v1/places/search
export const search = catchAsync(async (_req: Request, res: Response) => {
    const query = getQuery<{ text: string; sessionToken: string; latitude?: number; longitude?: number }>(res);
    const suggestions = await searchPlaces(query);
    return sendResponse(res, { success: true, statusCode: 200, message: "Suggestions", data: suggestions });
});

// GET /api/v1/places/details/:placeId
export const details = catchAsync(async (_req: Request, res: Response) => {
    const { placeId } = getParams<{ placeId: string }>(res);
    const { sessionToken } = getQuery<{ sessionToken: string }>(res);
    const place = await getPlaceDetails(placeId, sessionToken);
    return sendResponse(res, { success: true, statusCode: 200, message: "Place details", data: place });
});

// GET /api/v1/places/reverse-geocode
export const reverseGeocode = catchAsync(async (_req: Request, res: Response) => {
    const { latitude, longitude } = getQuery<{ latitude: number; longitude: number }>(res);
    const address = await addressFromGps(latitude, longitude);
    return sendResponse(res, { success: true, statusCode: 200, message: "Address", data: address });
});
