// =====================================================================
// AGENCY PROFILE - business logic
//
// An agency is a company. The person who creates it becomes its OWNER
// (an AgencyMember row with role OWNER). A new agency starts as PENDING;
// the admin must approve it before it can receive bookings.
//
// Who can do what with the profile:
//   view   -> OWNER, MANAGER, STAFF of that agency
//   update -> OWNER only
// =====================================================================

import crypto from "node:crypto";
import { prisma } from "../../../lib/prisma.js";
import { AppError } from "../../../errors/AppError.js";
import { Prisma } from "../../../generated/prisma/client.js";
import { personalDetailsSelect } from "../../Auth/personal-details.js";
import { checkCanJoinAgency } from "../../Auth/account-rules.js";
import { requireAgencyMember } from "../agency.access.js";
import { LEGAL_FIELD_NAMES, type RegisterAgencyInput, type UpdateAgencyProfileInput } from "./agency-profile.validation.js";

// ---------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------

// "Sunrise Care Services" -> "sunrise-care-services-a1b2c3" (used in URLs)
const makeSlug = (name: string) => {
    const base =
        name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50) ||
        "agency";
    return `${base}-${crypto.randomBytes(3).toString("hex")}`;
};

// GPS numbers are stored as Decimal(10,7) in the database
const toCoordinate = (value: number) => new Prisma.Decimal(value).toDecimalPlaces(7);

// Turn the request body into data for prisma.agency.create / update
const toAgencyData = (input: UpdateAgencyProfileInput) => {
    const { latitude, longitude, ...rest } = input;

    // keep only the fields that were sent
    const data: Record<string, unknown> = Object.fromEntries(
        Object.entries(rest).filter(([, value]) => value !== undefined)
    );
    if (latitude !== undefined) data.latitude = toCoordinate(latitude);
    if (longitude !== undefined) data.longitude = toCoordinate(longitude);

    return data;
};

// ---------------------------------------------------------------
// REGISTER a new agency (after logging in to the provider app)
// ---------------------------------------------------------------

const registerAgency = async (userId: number, input: RegisterAgencyInput) => {
    // Business rule: an individual provider can't also run an agency
    await checkCanJoinAgency(userId);

    const { ownerName, ...agencyInput } = input;

    // All steps succeed together, or none of them happen
    const agency = await prisma.$transaction(async (tx) => {
        // 1. save the owner's own name, if sent
        if (ownerName) {
            await tx.user.update({ where: { id: userId }, data: { name: ownerName } });
        }

        // 2. create the agency (waits for admin approval)
        const created = await tx.agency.create({
            data: {
                ...(toAgencyData(agencyInput) as Prisma.AgencyCreateInput),
                name: agencyInput.name,
                phone: agencyInput.phone,
                city: agencyInput.city,
                state: agencyInput.state,
                pincode: agencyInput.pincode,
                slug: makeSlug(agencyInput.name),
                status: "PENDING",
                verificationStatus: "NOT_SUBMITTED",
                availabilityStatus: "OFFLINE",
            },
            select: { id: true },
        });

        // 3. make this user the OWNER
        await tx.agencyMember.create({
            data: { agencyId: created.id, userId, role: "OWNER", status: "ACTIVE", joinedAt: new Date() },
        });

        // 4. give the AGENCY_OWNER role
        await tx.userRole.upsert({
            where: { userId_role: { userId, role: "AGENCY_OWNER" } },
            update: {},
            create: { userId, role: "AGENCY_OWNER" },
        });

        // 5. create an empty agency wallet
        await tx.agencyWallet.create({ data: { agencyId: created.id } });

        return created;
    });

    return getAgencyProfile(userId, agency.id);
};

// ---------------------------------------------------------------
// GET the agency profile (any active member of that agency)
// ---------------------------------------------------------------

const getAgencyProfile = async (userId: number, agencyId: number) => {
    // 404 if this user is not an ACTIVE member of THIS agency
    const me = await requireAgencyMember(userId, agencyId, ["OWNER", "MANAGER", "STAFF"]);

    const agency = await prisma.agency.findUniqueOrThrow({
        where: { id: agencyId },
        select: {
            id: true,
            slug: true,
            // business details
            name: true,
            description: true,
            phone: true,
            alternatePhone: true,
            email: true,
            website: true,
            logoUrl: true,
            coverImageUrl: true,
            address: true,
            city: true,
            state: true,
            country: true,
            pincode: true,
            latitude: true,
            longitude: true,
            serviceRadiusKm: true,
            // legal details
            legalName: true,
            registrationNumber: true,
            gstNumber: true,
            panNumber: true,
            // approval
            status: true,
            verificationStatus: true,
            rejectionReason: true,
            approvedAt: true,
            // online / offline
            availabilityStatus: true,
            // ratings and counts
            averageRating: true,
            totalReviews: true,
            completedBookings: true,
            createdAt: true,
            _count: { select: { members: true, services: true, documents: true } },
        },
    });

    const owner = await prisma.agencyMember.findFirst({
        where: { agencyId, role: "OWNER", status: "ACTIVE" },
        select: { user: { select: { id: true, name: true, phone: true, profileImageUrl: true } } },
    });

    const myPersonal = await prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: personalDetailsSelect,
    });

    const { _count, ...details } = agency;

    return {
        agency: details,
        owner: owner?.user ?? null,
        me: { memberId: me.id, role: me.role, personal: myPersonal },
        stats: { members: _count.members, servicesOffered: _count.services, documentsUploaded: _count.documents },
        // true = legal details can still be edited (only before approval)
        canEditLegalDetails: details.status === "PENDING" || details.status === "REJECTED",
    };
};

// ---------------------------------------------------------------
// UPDATE the agency profile (OWNER only)
// ---------------------------------------------------------------

const updateAgencyProfile = async (userId: number, agencyId: number, input: UpdateAgencyProfileInput) => {
    await requireAgencyMember(userId, agencyId, ["OWNER"]);

    // Legal details are checked by the admin, so lock them after approval
    const changingLegal = LEGAL_FIELD_NAMES.some((field) => field in input);
    if (changingLegal) {
        const agency = await prisma.agency.findUniqueOrThrow({ where: { id: agencyId }, select: { status: true } });
        if (agency.status === "APPROVED" || agency.status === "SUSPENDED") {
            throw new AppError(
                403,
                "Legal details (legal name, registration, GST, PAN) can't be changed after approval. Please contact support."
            );
        }
    }

    await prisma.agency.update({
        where: { id: agencyId },
        data: toAgencyData(input),
    });

    return getAgencyProfile(userId, agencyId);
};

export const AgencyProfileService = {
    registerAgency,
    getAgencyProfile,
    updateAgencyProfile,
};
