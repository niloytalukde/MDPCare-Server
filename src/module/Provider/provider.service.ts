import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../errors/AppError.js";
import { Prisma } from "../../generated/prisma/client.js";
import { money } from "../../utils/money.js";
import { findProviderByUserId } from "./provider.repository.js";

const requireProfile = async (userId: number) => {
    const p = await findProviderByUserId(userId);
    if (!p) throw new AppError(404, "Provider profile not found");
    return p;
};

export const upsertService = async (
    userId: number,
    input: { serviceId: number; customPrice?: number | null | undefined; isActive?: boolean | undefined }
) => {
    const provider = await requireProfile(userId);
    const service = await prisma.service.findUnique({ where: { id: input.serviceId }, select: { id: true } });
    if (!service) throw new AppError(404, "Service not found");

    const customPrice = input.customPrice === undefined ? undefined : input.customPrice === null ? null : money(input.customPrice.toString());

    return prisma.providerService.upsert({
        where: { providerId_serviceId: { providerId: provider.id, serviceId: input.serviceId } },
        update: { ...(customPrice !== undefined && { customPrice }), ...(input.isActive !== undefined && { isActive: input.isActive }) },
        create: { providerId: provider.id, serviceId: input.serviceId, customPrice: customPrice ?? null, isActive: input.isActive ?? true },
    });
};

export const listServices = async (userId: number) => {
    const provider = await requireProfile(userId);
    return prisma.providerService.findMany({
        where: { providerId: provider.id },
        include: { service: { select: { id: true, name: true, price: true, discountPrice: true } } },
    });
};

export const setAvailability = async (
    userId: number,
    input: { status: "ONLINE" | "OFFLINE"; latitude?: number | undefined; longitude?: number | undefined; serviceRadiusKm?: number | undefined }
) => {
    const provider = await requireProfile(userId);
    if (input.status === "ONLINE" && (provider.status !== "APPROVED" || provider.verificationStatus !== "VERIFIED")) {
        throw new AppError(403, "Your account must be approved and verified before going online");
    }

    return prisma.providerProfile.update({
        where: { id: provider.id },
        data: {
            availabilityStatus: input.status,
            isAvailable: input.status === "ONLINE",
            ...(input.latitude !== undefined && {
                latitude: new Prisma.Decimal(input.latitude).toDecimalPlaces(7),
                longitude: new Prisma.Decimal(input.longitude as number).toDecimalPlaces(7),
                locationUpdatedAt: new Date(),
            }),
            ...(input.serviceRadiusKm !== undefined && { serviceRadiusKm: input.serviceRadiusKm }),
        },
        select: { id: true, availabilityStatus: true, isAvailable: true, latitude: true, longitude: true, serviceRadiusKm: true },
    });
};

export const ProviderService = { upsertService, listServices, setAvailability };
