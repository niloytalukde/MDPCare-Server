import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../errors/AppError.js";

export interface CreateFamilyMemberInput {
    name?: string | null;
    relationship?: string | null;
    phone?: string | null;
}

export interface UpdateFamilyMemberInput {
    name?: string | null;
    relationship?: string | null;
    phone?: string | null;
}

// ---------------------------------------------
// 1. Create Family Member
// ---------------------------------------------
const createFamilyMember = async (
    userId: number,
    payload: CreateFamilyMemberInput
) => {
    const name = payload.name?.trim();

    if (!name) {
        throw new AppError(400, "Name is required for family member");
    }

    const member = await prisma.familyMember.create({
        data: {
            userId,
            name,
            relationship: payload.relationship?.trim() || null,
            phone: payload.phone?.trim() || null,
        },
    });

    return member;
};

// ---------------------------------------------
// 2. Get All Family Members for User
// ---------------------------------------------
const getAllFamilyMembers = async (userId: number) => {
    return prisma.familyMember.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
    });
};

// ---------------------------------------------
// 3. Get Single Family Member by ID
// ---------------------------------------------
const getSingleFamilyMember = async (
    userId: number,
    memberId: number
) => {
    if (!Number.isSafeInteger(memberId) || memberId <= 0) {
        throw new AppError(400, "Invalid family member ID");
    }

    const member = await prisma.familyMember.findFirst({
        where: { id: memberId, userId },
    });

    if (!member) {
        throw new AppError(404, "Family member not found");
    }

    return member;
};

// ---------------------------------------------
// 4. Update Family Member
// ---------------------------------------------
const updateFamilyMember = async (
    userId: number,
    memberId: number,
    payload: UpdateFamilyMemberInput
) => {
    if (!Number.isSafeInteger(memberId) || memberId <= 0) {
        throw new AppError(400, "Invalid family member ID");
    }

    const existing = await prisma.familyMember.findFirst({
        where: { id: memberId, userId },
    });

    if (!existing) {
        throw new AppError(404, "Family member not found");
    }

    const updated = await prisma.familyMember.update({
        where: { id: memberId },
        data: {
            ...(payload.name !== undefined && {
                name: payload.name?.trim() || null,
            }),
            ...(payload.relationship !== undefined && {
                relationship: payload.relationship?.trim() || null,
            }),
            ...(payload.phone !== undefined && {
                phone: payload.phone?.trim() || null,
            }),
        },
    });

    return updated;
};

// ---------------------------------------------
// 5. Delete Family Member
// ---------------------------------------------
const deleteFamilyMember = async (userId: number, memberId: number) => {
    if (!Number.isSafeInteger(memberId) || memberId <= 0) {
        throw new AppError(400, "Invalid family member ID");
    }

    const existing = await prisma.familyMember.findFirst({
        where: { id: memberId, userId },
    });

    if (!existing) {
        throw new AppError(404, "Family member not found");
    }

    await prisma.familyMember.delete({
        where: { id: memberId },
    });

    return { id: memberId };
};

export const FamilyMemberService = {
    createFamilyMember,
    getAllFamilyMembers,
    getSingleFamilyMember,
    updateFamilyMember,
    deleteFamilyMember,
};
