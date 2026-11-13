import { z } from "zod";

export const upsertProviderServiceSchema = z.object({
    serviceId: z.number().int().positive(),
    customPrice: z.number().nonnegative().max(10_000_000).nullable().optional(),
    isActive: z.boolean().optional(),
});

export const providerAvailabilitySchema = z.object({
    status: z.enum(["ONLINE", "OFFLINE"]),
    latitude: z.number().min(-90).max(90).optional(),
    longitude: z.number().min(-180).max(180).optional(),
    serviceRadiusKm: z.number().int().min(1).max(100).optional(),
}).refine((v) => v.status === "OFFLINE" || (v.latitude !== undefined && v.longitude !== undefined), {
    message: "latitude and longitude are required to go online",
});
