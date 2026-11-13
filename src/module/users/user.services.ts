import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../errors/AppError.js";
import { paginationMeta, toSkipTake } from "../../utils/validators.js";

// Device identifiers (fcmToken, deviceImei) and tokenVersion are never returned (SEC-01).
const safeUserSelect = {
    id: true,
    phone: true,
    name: true,
    email: true,
    gender: true,
    accountStatus: true,
    isPhoneVerified: true,
    isEmailVerified: true,
    createdAt: true,
    updatedAt: true,
    userRoles: { select: { role: true } },
} as const;

interface CreateUserData {
    phone: string;
    name?: string | undefined;
    email?: string | undefined;
}

interface UpdateUserData {
    name?: string | undefined;
    email?: string | null | undefined;
}

const createUser = async (data: CreateUserData) => {
    const existingUser = await prisma.user.findUnique({ where: { phone: data.phone }, select: { id: true } });
    if (existingUser) {
        throw new AppError(409, "User with this phone already exists");
    }

    return prisma.user.create({
        data: {
            phone: data.phone,
            ...(data.name !== undefined && { name: data.name }),
            ...(data.email !== undefined && { email: data.email }),
        },
        select: safeUserSelect,
    });
};

const getAllUsers = async (q: { page: number; limit: number; search?: string | undefined }) => {
    const where = q.search
        ? {
              OR: [
                  { phone: { contains: q.search } },
                  { name: { contains: q.search, mode: "insensitive" as const } },
                  { email: { contains: q.search, mode: "insensitive" as const } },
              ],
          }
        : {};

    const [data, total] = await prisma.$transaction([
        prisma.user.findMany({ where, orderBy: { createdAt: "desc" }, select: safeUserSelect, ...toSkipTake(q) }),
        prisma.user.count({ where }),
    ]);

    return { data, meta: paginationMeta(q, total) };
};

const getSingleUser = async (id: number) => {
    const user = await prisma.user.findUnique({
        where: { id },
        select: { ...safeUserSelect, location: true, familyMembers: true },
    });

    if (!user) {
        throw new AppError(404, "User not found");
    }

    return user;
};

const updateUser = async (id: number, data: UpdateUserData) => {
    return prisma.user.update({
        where: { id },
        data: {
            ...(data.name !== undefined && { name: data.name }),
            ...(data.email !== undefined && { email: data.email }),
        },
        select: safeUserSelect,
    });
};

/**
 * Hard delete (existing behaviour, now admin-only). Fails with 409 when the user
 * has bookings (FK RESTRICT) - booking history is never cascaded away.
 * Recommended future change: soft delete via accountStatus=DELETED.
 */
const deleteUser = async (id: number) => {
    await prisma.user.delete({ where: { id } });
    return { id };
};

export const userService = {
    createUser,
    getAllUsers,
    getSingleUser,
    updateUser,
    deleteUser,
};
