import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../errors/AppError.js";
import { Prisma } from "../../generated/prisma/client.js";
import { money } from "../../utils/money.js";
import { checkCanJoinAgency } from "../Auth/account-rules.js";

// Registration, "my agency profile" and "update agency profile" are in
// profile/agency-profile.service.ts

export const myAgencies = async (userId: number) =>
    prisma.agencyMember.findMany({
        where: { userId, status: { in: ["ACTIVE", "INVITED"] } },
        select: {
            id: true, role: true, status: true, joinedAt: true,
            agency: { select: { id: true, name: true, slug: true, status: true, verificationStatus: true, availabilityStatus: true, city: true } },
        },
    });

export const setAgencyAvailability = async (
    agencyId: number,
    input: { status: "ONLINE" | "OFFLINE"; latitude?: number | undefined; longitude?: number | undefined }
) => {
    if (input.status === "ONLINE") {
        const a = await prisma.agency.findUniqueOrThrow({ where: { id: agencyId }, select: { status: true } });
        if (a.status !== "APPROVED") throw new AppError(403, "Agency must be approved before going online");
    }
    return prisma.agency.update({
        where: { id: agencyId },
        data: {
            availabilityStatus: input.status,
            ...(input.latitude !== undefined && { latitude: new Prisma.Decimal(input.latitude).toDecimalPlaces(7) }),
            ...(input.longitude !== undefined && { longitude: new Prisma.Decimal(input.longitude).toDecimalPlaces(7) }),
        },
        select: { id: true, availabilityStatus: true, latitude: true, longitude: true },
    });
};

// ---------------------------------------------------------------
// Services offered by the agency
// ---------------------------------------------------------------

export const upsertAgencyService = async (
    agencyId: number,
    input: { serviceId: number; customPrice?: number | null | undefined; isActive?: boolean | undefined }
) => {
    const service = await prisma.service.findUnique({ where: { id: input.serviceId }, select: { id: true } });
    if (!service) throw new AppError(404, "Service not found");

    const customPrice = input.customPrice === undefined ? undefined : input.customPrice === null ? null : money(input.customPrice.toString());

    return prisma.agencyService.upsert({
        where: { agencyId_serviceId: { agencyId, serviceId: input.serviceId } },
        update: { ...(customPrice !== undefined && { customPrice }), ...(input.isActive !== undefined && { isActive: input.isActive }) },
        create: { agencyId, serviceId: input.serviceId, customPrice: customPrice ?? null, isActive: input.isActive ?? true },
    });
};

// ---------------------------------------------------------------
// Staff
// ---------------------------------------------------------------

/**
 * Owner adds staff by phone. Creates the User if needed (unverified; they verify
 * via normal OTP login). Membership starts INVITED and becomes ACTIVE only when
 * the staff member accepts it themselves.
 */
export const addStaff = async (agencyId: number, input: { phone: string; displayName?: string | undefined; experienceYears?: number | undefined }) => {
    return prisma.$transaction(async (tx) => {
        const user =
            (await tx.user.findUnique({ where: { phone: input.phone }, select: { id: true, accountStatus: true } })) ??
            (await tx.user.create({ data: { phone: input.phone }, select: { id: true, accountStatus: true } }));

        if (user.accountStatus !== "ACTIVE") throw new AppError(409, "This user account is not active");

        // Business rule: an individual provider can't also be agency staff (see Auth/account-rules.ts)
        await checkCanJoinAgency(user.id);

        const existing = await tx.agencyMember.findUnique({ where: { agencyId_userId: { agencyId, userId: user.id } } });
        if (existing && existing.status !== "REMOVED") {
            throw new AppError(409, "This person is already a member of the agency");
        }

        const data = {
            role: "STAFF" as const,
            status: "INVITED" as const,
            displayName: input.displayName ?? null,
            phone: input.phone,
            experienceYears: input.experienceYears ?? 0,
            removedAt: null,
            joinedAt: null,
        };

        return existing
            ? tx.agencyMember.update({ where: { id: existing.id }, data })
            : tx.agencyMember.create({ data: { agencyId, userId: user.id, ...data } });
    });
};

/** Staff accepts their own invitation (the invite is bound to their user id). */
export const acceptMembership = async (userId: number, memberId: number) => {
    return prisma.$transaction(async (tx) => {
        const res = await tx.agencyMember.updateMany({
            where: { id: memberId, userId, status: "INVITED" },
            data: { status: "ACTIVE", joinedAt: new Date() },
        });
        if (res.count !== 1) throw new AppError(404, "Invitation not found");

        await tx.userRole.upsert({
            where: { userId_role: { userId, role: "AGENCY_STAFF" } },
            update: {},
            create: { userId, role: "AGENCY_STAFF" },
        });
        return tx.agencyMember.findUniqueOrThrow({ where: { id: memberId }, select: { id: true, agencyId: true, status: true, role: true } });
    });
};

export const setMemberStatus = async (agencyId: number, memberId: number, status: "ACTIVE" | "SUSPENDED" | "REMOVED") => {
    const member = await prisma.agencyMember.findFirst({ where: { id: memberId, agencyId } });
    if (!member) throw new AppError(404, "Member not found");
    if (member.role === "OWNER") throw new AppError(400, "The owner's membership cannot be changed here");
    if (member.status === "INVITED" && status === "ACTIVE") throw new AppError(400, "Invited staff must accept the invitation themselves");

    if (status !== "ACTIVE") {
        const busy = await prisma.agencyBookingAssignment.count({
            where: { staffMemberId: memberId, status: { in: ["ASSIGNED", "ACCEPTED", "STARTED"] } },
        });
        if (busy > 0) throw new AppError(409, "Reassign this member's active bookings first");
    }

    return prisma.agencyMember.update({
        where: { id: memberId },
        data: { status, ...(status === "REMOVED" && { removedAt: new Date() }) },
        select: { id: true, status: true },
    });
};

/** Replaces a member's service qualifications. Only services the agency actively offers are allowed. */
export const setStaffServices = async (agencyId: number, memberId: number, serviceIds: number[]) => {
    const member = await prisma.agencyMember.findFirst({ where: { id: memberId, agencyId }, select: { id: true } });
    if (!member) throw new AppError(404, "Member not found");

    const offered = await prisma.agencyService.findMany({
        where: { agencyId, serviceId: { in: serviceIds }, isActive: true },
        select: { serviceId: true },
    });
    if (offered.length !== new Set(serviceIds).size) {
        throw new AppError(400, "Staff can only be qualified for services the agency offers");
    }

    return prisma.$transaction(async (tx) => {
        await tx.agencyStaffService.updateMany({
            where: { agencyMemberId: memberId, serviceId: { notIn: serviceIds } },
            data: { isActive: false },
        });
        for (const serviceId of new Set(serviceIds)) {
            await tx.agencyStaffService.upsert({
                where: { agencyMemberId_serviceId: { agencyMemberId: memberId, serviceId } },
                update: { isActive: true },
                create: { agencyMemberId: memberId, serviceId },
            });
        }
        return tx.agencyStaffService.findMany({ where: { agencyMemberId: memberId, isActive: true }, select: { serviceId: true } });
    });
};

export const listMembers = async (agencyId: number) =>
    prisma.agencyMember.findMany({
        where: { agencyId, status: { not: "REMOVED" } },
        orderBy: { createdAt: "asc" },
        select: {
            id: true, role: true, status: true, displayName: true, phone: true, experienceYears: true, joinedAt: true,
            services: { where: { isActive: true }, select: { serviceId: true } },
        },
    });
