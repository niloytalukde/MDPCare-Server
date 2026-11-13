// =====================================================================
// PLACES - request validation
// =====================================================================

import { z } from "zod";

// The app makes one random token per "search session" (from opening the
// search box to picking a place). Google bills the whole session once.
const sessionToken = z.string().trim().regex(/^[A-Za-z0-9_-]{8,36}$/, "Invalid session token");

const latitude = z.coerce.number().min(-90).max(90);
const longitude = z.coerce.number().min(-180).max(180);

// GET /places/search?text=park%20street&sessionToken=...&latitude=22.57&longitude=88.36
export const searchQuery = z.object({
    text: z.string().trim().min(2, "Type at least 2 letters").max(200),
    sessionToken,
    latitude: latitude.optional(),
    longitude: longitude.optional(),
});

// GET /places/details/:placeId?sessionToken=...
export const placeIdParam = z.object({
    placeId: z.string().trim().regex(/^[A-Za-z0-9_-]{10,300}$/, "Invalid place id"),
});
export const detailsQuery = z.object({ sessionToken });

// GET /places/reverse-geocode?latitude=22.57&longitude=88.36
export const reverseGeocodeQuery = z.object({ latitude, longitude });
