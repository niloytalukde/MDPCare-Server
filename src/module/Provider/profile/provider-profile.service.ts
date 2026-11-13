// =====================================================================
// INDIVIDUAL PROVIDER PROFILE - business logic
//
// Where each field is saved:
//   User            -> name, email, gender, dateOfBirth, profileImageUrl
//   ProviderProfile -> profession, displayName, bio, experienceYears,
//                      address, city, state, pincode, serviceRadiusKm
//
// A new provider starts as status PENDING. The admin must approve them
// (and verify their documents) before they can go ONLINE.
// =====================================================================

import { prisma } from "../../../lib/prisma.js";
import { AppError } from "../../../errors/AppError.js";
import { personalDetailsSelect, toUserUpdateData } from "../../Auth/personal-details.js";
import { checkCanBecomeIndividualProvider } from "../../Auth/account-rules.js";
import type { RegisterProviderInput, UpdateProviderProfileInput } from "./provider-profile.validation.js";

// ---------------------------------------------------------------
// Helper: split the request body into User data and ProviderProfile data
// ---------------------------------------------------------------

const splitInput = (input: UpdateProviderProfileInput) => {
    const { name, email, gender, dateOfBirth, profileImageUrl, ...work } = input;

    return {
        userData: toUserUpdateData({ name, email, gender, dateOfBirth, profileImageUrl }),
        // Remove keys that were not sent, so we only change what was sent
        profileData: Object.fromEntries(Object.entries(work).filter(([, value]) => value !== undefined)),
    };
};

// ---------------------------------------------------------------
// GET my provider profile
// ---------------------------------------------------------------

const getProviderProfile = async (userId: number) => {
    const profile = await prisma.providerProfile.findUnique({
        where: { userId },
        select: {
            id: true,
            // work details
            profession: true,
            displayName: true,
            bio: true,
            experienceYears: true,
            address: true,
            city: true,
            state: true,
            pincode: true,
            serviceRadiusKm: true,
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
            // personal details from User
            user: { select: personalDetailsSelect },
            _count: { select: { services: true, documents: true } },
        },
    });

    if (!profile) {
        throw new AppError(404, "Provider profile not found. Please register as a provider first.");
    }

    const { user, _count, ...work } = profile;

    return {
        personal: user,
        work,
        stats: { servicesSelected: _count.services, documentsUploaded: _count.documents },
        // simple checklist for the app's "finish your setup" screen
        nextSteps: {
            uploadDocuments: _count.documents === 0,
            selectServices: _count.services === 0,
            waitForApproval: work.status === "PENDING",
        },
    };
};

// ---------------------------------------------------------------
// REGISTER as an individual provider (after logging in)
// ---------------------------------------------------------------

const registerProvider = async (userId: number, input: RegisterProviderInput) => {
    const existing = await prisma.providerProfile.findUnique({ where: { userId }, select: { id: true } });
    if (existing) {
        throw new AppError(409, "You are already registered as a provider");
    }

    // Business rule: not allowed if this person is in an agency
    await checkCanBecomeIndividualProvider(userId);

    const { userData, profileData } = splitInput(input);

    // All 4 steps succeed together, or none of them happen
    await prisma.$transaction(async (tx) => {
        // 1. save personal details
        await tx.user.update({ where: { id: userId }, data: userData });

        // 2. create the provider profile (waits for admin approval)
        const profile = await tx.providerProfile.create({
            data: {
                userId,
                profession: input.profession,
                city: input.city,
                state: input.state,
                pincode: input.pincode,
                ...profileData,
                status: "PENDING",
                verificationStatus: "NOT_SUBMITTED",
                availabilityStatus: "OFFLINE",
                isAvailable: false,
            },
            select: { id: true },
        });

        // 3. give the PROVIDER role
        await tx.userRole.upsert({
            where: { userId_role: { userId, role: "PROVIDER" } },
            update: {},
            create: { userId, role: "PROVIDER" },
        });

        // 4. create an empty wallet
        await tx.providerWallet.create({ data: { providerId: profile.id } });
    });

    return getProviderProfile(userId);
};

// ---------------------------------------------------------------
// UPDATE my provider profile
// ---------------------------------------------------------------

const updateProviderProfile = async (userId: number, input: UpdateProviderProfileInput) => {
    const profile = await prisma.providerProfile.findUnique({ where: { userId }, select: { id: true } });
    if (!profile) {
        throw new AppError(404, "Provider profile not found. Please register as a provider first.");
    }

    const { userData, profileData } = splitInput(input);

    await prisma.$transaction(async (tx) => {
        if (Object.keys(userData).length > 0) {
            await tx.user.update({ where: { id: userId }, data: userData });
        }
        if (Object.keys(profileData).length > 0) {
            await tx.providerProfile.update({ where: { id: profile.id }, data: profileData });
        }
    });

    return getProviderProfile(userId);
};

export const ProviderProfileService = {
    registerProvider,
    getProviderProfile,
    updateProviderProfile,
};
