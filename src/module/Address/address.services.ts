import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../errors/AppError.js";
import type { AddressType } from "../../generated/prisma/enums.js";
import type { Prisma } from "../../generated/prisma/client.js";

// CODE-01: all default-address changes run in one transaction, serialized per
// user with an advisory lock, so a user can never end up with 0 or 2 defaults.
const withUserLock = <T>(userId: number, fn: (tx: Prisma.TransactionClient) => Promise<T>) =>
    prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"address:" + userId}))`;
        return fn(tx);
    });

export interface CreateAddressInput {
    buildingName?: string | null;
    floor?: string | null;
    flatNo?: string | null;
    street?: string | null;
    area?: string | null;
    city: string;
    state: string;
    pincode: string;
    latitude?: number | null;
    longitude?: number | null;
    addressType?: AddressType;
    isDefault?: boolean;
}

export interface UpdateAddressInput {
    buildingName?: string | null;
    floor?: string | null;
    flatNo?: string | null;
    street?: string | null;
    area?: string | null;
    city?: string;
    state?: string;
    pincode?: string;
    latitude?: number | null;
    longitude?: number | null;
    addressType?: AddressType;
    isDefault?: boolean;
}

// ---------------------------------------------
// 1. Create Address
// ---------------------------------------------
const createAddress = async (userId: number, payload: CreateAddressInput) => {
    const city = payload.city?.trim();
    const state = payload.state?.trim();
    const pincode = payload.pincode?.trim();

    if (!city || !state || !pincode) {
        throw new AppError(400, "City, state, and pincode are required");
    }

    return withUserLock(userId, async (tx) => {
    // Check existing address count for the user
    const existingCount = await tx.address.count({
        where: { userId },
    });

    // If marked default or first address, set as default
    const isDefault = payload.isDefault !== undefined ? payload.isDefault : existingCount === 0;

    // If this address is set as default, reset other default addresses
    if (isDefault && existingCount > 0) {
        await tx.address.updateMany({
            where: { userId, isDefault: true },
            data: { isDefault: false },
        });
    }

    const newAddress = await tx.address.create({
        data: {
            userId,
            buildingName: payload.buildingName?.trim() || null,
            floor: payload.floor?.trim() || null,
            flatNo: payload.flatNo?.trim() || null,
            street: payload.street?.trim() || null,
            area: payload.area?.trim() || null,
            city,
            state,
            pincode,
            latitude: payload.latitude !== undefined && payload.latitude !== null ? Number(payload.latitude) : null,
            longitude: payload.longitude !== undefined && payload.longitude !== null ? Number(payload.longitude) : null,
            addressType: payload.addressType || "HOME",
            isDefault,
        },
    });

    return newAddress;
    });
};

// ---------------------------------------------
// 2. Get All Addresses for User
// ---------------------------------------------
const getAllAddresses = async (userId: number) => {
    return prisma.address.findMany({
        where: { userId },
        orderBy: [
            { isDefault: "desc" },
            { createdAt: "desc" },
        ],
    });
};

// ---------------------------------------------
// 3. Get Single Address by ID
// ---------------------------------------------
const getSingleAddress = async (userId: number, addressId: number) => {
    if (!Number.isSafeInteger(addressId) || addressId <= 0) {
        throw new AppError(400, "Invalid address ID");
    }

    const address = await prisma.address.findFirst({
        where: { id: addressId, userId },
    });

    if (!address) {
        throw new AppError(404, "Address not found");
    }

    return address;
};

// ---------------------------------------------
// 4. Update Address
// ---------------------------------------------
const updateAddress = async (
    userId: number,
    addressId: number,
    payload: UpdateAddressInput
) => {
    if (!Number.isSafeInteger(addressId) || addressId <= 0) {
        throw new AppError(400, "Invalid address ID");
    }

    const existingAddress = await prisma.address.findFirst({
        where: { id: addressId, userId },
    });

    if (!existingAddress) {
        throw new AppError(404, "Address not found");
    }

    return withUserLock(userId, async (tx) => {
    // If updating to default, unset previous default addresses
    if (payload.isDefault === true) {
        await tx.address.updateMany({
            where: { userId, isDefault: true, id: { not: addressId } },
            data: { isDefault: false },
        });
    }

    const updated = await tx.address.update({
        where: { id: addressId },
        data: {
            ...(payload.buildingName !== undefined && {
                buildingName: payload.buildingName?.trim() || null,
            }),
            ...(payload.floor !== undefined && {
                floor: payload.floor?.trim() || null,
            }),
            ...(payload.flatNo !== undefined && {
                flatNo: payload.flatNo?.trim() || null,
            }),
            ...(payload.street !== undefined && {
                street: payload.street?.trim() || null,
            }),
            ...(payload.area !== undefined && {
                area: payload.area?.trim() || null,
            }),
            ...(payload.city !== undefined && {
                city: payload.city.trim(),
            }),
            ...(payload.state !== undefined && {
                state: payload.state.trim(),
            }),
            ...(payload.pincode !== undefined && {
                pincode: payload.pincode.trim(),
            }),
            ...(payload.latitude !== undefined && {
                latitude: payload.latitude !== null ? Number(payload.latitude) : null,
            }),
            ...(payload.longitude !== undefined && {
                longitude: payload.longitude !== null ? Number(payload.longitude) : null,
            }),
            ...(payload.addressType !== undefined && {
                addressType: payload.addressType,
            }),
            ...(payload.isDefault !== undefined && {
                isDefault: payload.isDefault,
            }),
        },
    });

    // Unsetting the only default would leave none: promote the most recent other address
    if (payload.isDefault === false && existingAddress.isDefault) {
        const next = await tx.address.findFirst({
            where: { userId, id: { not: addressId } },
            orderBy: { createdAt: "desc" },
            select: { id: true },
        });
        if (next) await tx.address.update({ where: { id: next.id }, data: { isDefault: true } });
    }

    return updated;
    });
};

// ---------------------------------------------
// 5. Delete Address
// ---------------------------------------------
const deleteAddress = async (userId: number, addressId: number) => {
    if (!Number.isSafeInteger(addressId) || addressId <= 0) {
        throw new AppError(400, "Invalid address ID");
    }

    const existingAddress = await prisma.address.findFirst({
        where: { id: addressId, userId },
    });

    if (!existingAddress) {
        throw new AppError(404, "Address not found");
    }

    await withUserLock(userId, async (tx) => {
    await tx.address.delete({
        where: { id: addressId },
    });

    // If deleted address was default, promote the next recent address
    if (existingAddress.isDefault) {
        const nextAddress = await tx.address.findFirst({
            where: { userId },
            orderBy: { createdAt: "desc" },
        });

        if (nextAddress) {
            await tx.address.update({
                where: { id: nextAddress.id },
                data: { isDefault: true },
            });
        }
    }
    });

    return { id: addressId };
};

// ---------------------------------------------
// 6. Set Default Address
// ---------------------------------------------
const setDefaultAddress = async (userId: number, addressId: number) => {
    if (!Number.isSafeInteger(addressId) || addressId <= 0) {
        throw new AppError(400, "Invalid address ID");
    }

    const existingAddress = await prisma.address.findFirst({
        where: { id: addressId, userId },
    });

    if (!existingAddress) {
        throw new AppError(404, "Address not found");
    }

    return withUserLock(userId, async (tx) => {
        await tx.address.updateMany({
            where: { userId, isDefault: true },
            data: { isDefault: false },
        });

        return tx.address.update({
            where: { id: addressId },
            data: { isDefault: true },
        });
    });
};

export const AddressService = {
    createAddress,
    getAllAddresses,
    getSingleAddress,
    updateAddress,
    deleteAddress,
    setDefaultAddress,
};
