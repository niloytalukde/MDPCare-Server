// =====================================================================
// CUSTOMER - business logic
//
// A customer is simply a User (there is no separate customer table).
// Their extra data is in Address, FamilyMember and Booking.
// =====================================================================

import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../errors/AppError.js";
import { personalDetailsSelect, toUserUpdateData } from "../Auth/personal-details.js";
import type { UpdateCustomerProfileInput } from "./customer.validation.js";

// ---------------------------------------------------------------
// GET my profile
// ---------------------------------------------------------------

const getCustomerProfile = async (userId: number) => {
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
            ...personalDetailsSelect,
            userRoles: { select: { role: true } },
            _count: {
                select: { location: true, familyMembers: true, bookings: true },
            },
        },
    });

    if (!user) {
        throw new AppError(404, "User not found");
    }

    // Reshape into a simple object for the app
    const { userRoles, _count, ...personal } = user;

    return {
        ...personal,
        roles: userRoles.map((r) => r.role),
        // true = the app should show the "complete your profile" screen
        needsProfileCompletion: !personal.name,
        stats: {
            savedAddresses: _count.location,
            familyMembers: _count.familyMembers,
            bookings: _count.bookings,
        },
    };
};

// ---------------------------------------------------------------
// UPDATE my profile
// ---------------------------------------------------------------

const updateCustomerProfile = async (userId: number, input: UpdateCustomerProfileInput) => {
    await prisma.user.update({
        where: { id: userId },
        data: toUserUpdateData(input),
    });

    // Return the full, fresh profile
    return getCustomerProfile(userId);
};

export const CustomerService = {
    getCustomerProfile,
    updateCustomerProfile,
};
