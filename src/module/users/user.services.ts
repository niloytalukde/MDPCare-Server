
import { prisma } from "../../lib/prisma.js";

interface UserData {
    phone: string;
    name?: string;
    email?: string;
}

const createUser = async (userData: UserData) => {
    if (!userData.phone?.trim()) {
        throw new Error("Phone number is required");
    }

    const existingUser = await prisma.user.findUnique({
        where: { phone: userData.phone },
    });

    if (existingUser) {
        throw new Error("User with this phone already exists");
    }

    return prisma.user.create({
        data: userData,
    });
};

const getAllUsers = async () => {
    return prisma.user.findMany({
        orderBy: { createdAt: "desc" },
    });
};

const getSingleUser = async (id: number) => {
    const user = await prisma.user.findUnique({
        where: { id },
        include: {
            location: true,
            familyMembers: true,
        },
    });

    if (!user) {
        throw new Error("User not found");
    }

    return user;
};

const updateUser = async (
    id: number,
    userData: Partial<UserData>
) => {
    return prisma.user.update({
        where: { id },
        data: userData,
    });
};

const deleteUser = async (id: number) => {
    return prisma.user.delete({
        where: { id },
    });
};

export const userService = {
    createUser,
    getAllUsers,
    getSingleUser,
    updateUser,
    deleteUser,
};
