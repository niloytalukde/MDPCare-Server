// =====================================================================
// PROVIDER LOCATION / ONLINE - request validation
// =====================================================================

import { z } from "zod";

// { "latitude": 22.5726, "longitude": 88.3639 }
export const locationSchema = z.object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
});

// POST /provider/online needs a starting location (same shape)
export const goOnlineSchema = locationSchema;
