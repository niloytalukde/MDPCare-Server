// =====================================================================
// BOOKING CONTACTS - who the customer and the worker see after accept
//
// Every booking reply gets a simple "contacts" section:
//
//   contacts.customer         -> shown to the provider / agency / staff
//       { name, phone, profileImageUrl, bookedFor, bookedBy }
//       null until someone accepts (they only see the job before that)
//
//   contacts.serviceProvider  -> shown to the customer
//       individual: { type: "INDIVIDUAL", name, phone, profileImageUrl,
//                     profession, experienceYears, averageRating }
//       agency:     { type: "AGENCY", agency: {...}, staff: {...} | null }
//                     (staff is null until the agency assigns someone)
//       null while still searching
// =====================================================================

import type { Prisma } from "../../generated/prisma/client.js";

// ---------------------------------------------------------------
// The database fields we need for the contacts (add to any booking query)
// ---------------------------------------------------------------

const personFields = { name: true, phone: true, profileImageUrl: true } as const;

export const contactsInclude = {
    // the customer's own account
    user: { select: personFields },

    // individual provider
    provider: {
        select: {
            id: true,
            displayName: true,
            profession: true,
            experienceYears: true,
            averageRating: true,
            user: { select: personFields },
        },
    },

    // agency
    agency: {
        select: { id: true, name: true, phone: true, logoUrl: true, averageRating: true },
    },

    // the staff member the agency sent
    agencyAssignment: {
        select: {
            id: true,
            status: true,
            assignedAt: true,
            acceptedAt: true,
            startedAt: true,
            completedAt: true,
            staffMember: {
                select: {
                    id: true,
                    displayName: true,
                    profileImageUrl: true,
                    experienceYears: true,
                    user: { select: personFields },
                },
            },
        },
    },
} satisfies Prisma.BookingInclude;

// The shape of a booking loaded with contactsInclude
type BookingWithContactFields = Prisma.BookingGetPayload<{ include: typeof contactsInclude }>;

// ---------------------------------------------------------------
// Customer contact (who the worker should visit / call)
// ---------------------------------------------------------------

const buildCustomerContact = (booking: BookingWithContactFields) => {
    const accountHolder = booking.user;

    // Booked for a family member: visit THEM, but also show who booked
    if (booking.familyMemberId !== null) {
        return {
            name: booking.customerName,
            phone: booking.customerPhone ?? accountHolder.phone, // family member may have no phone
            profileImageUrl: null,
            bookedFor: "FAMILY_MEMBER" as const,
            bookedBy: { name: accountHolder.name, phone: accountHolder.phone },
        };
    }

    // Booked for themself
    return {
        name: accountHolder.name,
        phone: accountHolder.phone,
        profileImageUrl: accountHolder.profileImageUrl,
        bookedFor: "SELF" as const,
        bookedBy: null,
    };
};

// ---------------------------------------------------------------
// Service provider contact (who is coming to the customer)
// ---------------------------------------------------------------

const buildServiceProviderContact = (booking: BookingWithContactFields) => {
    // individual provider accepted
    if (booking.provider) {
        const provider = booking.provider;
        return {
            type: "INDIVIDUAL" as const,
            providerId: provider.id,
            name: provider.displayName ?? provider.user.name,
            phone: provider.user.phone,
            profileImageUrl: provider.user.profileImageUrl,
            profession: provider.profession,
            experienceYears: provider.experienceYears,
            averageRating: provider.averageRating,
        };
    }

    // agency accepted
    if (booking.agency) {
        const staffMember = booking.agencyAssignment?.staffMember;
        const assignmentIsActive = booking.agencyAssignment && booking.agencyAssignment.status !== "CANCELLED";

        return {
            type: "AGENCY" as const,
            agency: booking.agency,
            // null until the agency assigns a staff member
            staff:
                staffMember && assignmentIsActive
                    ? {
                          memberId: staffMember.id,
                          name: staffMember.displayName ?? staffMember.user.name,
                          phone: staffMember.user.phone,
                          profileImageUrl: staffMember.profileImageUrl ?? staffMember.user.profileImageUrl,
                          experienceYears: staffMember.experienceYears,
                          assignmentStatus: booking.agencyAssignment!.status,
                      }
                    : null,
        };
    }

    // nobody accepted yet
    return null;
};

// ---------------------------------------------------------------
// Add "contacts" to a booking (and remove the raw `user` row,
// which is only needed to build the contacts)
// ---------------------------------------------------------------

export const withContacts = <T extends BookingWithContactFields>(booking: T) => {
    const { user: _customerAccount, ...rest } = booking;

    return {
        ...rest,
        contacts: {
            customer: buildCustomerContact(booking),
            serviceProvider: buildServiceProviderContact(booking),
        },
    };
};

// ---------------------------------------------------------------
// Before accepting, a provider / agency only sees the JOB:
// no customer name, phone or exact address.
// ---------------------------------------------------------------

export const withoutCustomerDetails = <T extends BookingWithContactFields>(booking: T) => {
    const visible = withContacts(booking);

    return {
        ...visible,
        customerName: null,
        customerPhone: null,
        fullAddress: "Shared after acceptance",
        landmark: null,
        contacts: { customer: null, serviceProvider: null },
    };
};
