import { z } from "zod";

export const upsertProviderServiceSchema = z.object({
    serviceId: z.number().int().positive(),
    customPrice: z.number().nonnegative().max(10_000_000).nullable().optional(),
    isActive: z.boolean().optional(),
});
