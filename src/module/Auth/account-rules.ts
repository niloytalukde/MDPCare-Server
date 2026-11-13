// =====================================================================
// ACCOUNT RULES for the provider app
//
// One phone number = one User. In the provider app that user can be:
//   - an INDIVIDUAL PROVIDER  (has a ProviderProfile), or
//   - in an AGENCY            (has an AgencyMember row: OWNER / MANAGER / STAFF)
//
// BUSINESS RULE: can the same person be both?
//   false (current) = NO.  Earnings and wallets stay clearly separate, and
//                          nobody takes an individual job while doing an
//                          agency job.
//   true            = YES. Change this one line if the business decides so.
// =====================================================================

import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../errors/AppError.js";

export const ALLOW_PROVIDER_AND_AGENCY_TOGETHER = false;

// Called before creating a ProviderProfile
export const checkCanBecomeIndividualProvider = async (userId: number) => {
    if (ALLOW_PROVIDER_AND_AGENCY_TOGETHER) return;

    const membership = await prisma.agencyMember.findFirst({
        where: { userId, status: { in: ["ACTIVE", "INVITED"] } },
        select: { id: true },
    });

    if (membership) {
        throw new AppError(409, "This phone number is already part of an agency, so it can't register as an individual provider");
    }
};

// Called before creating an Agency or adding someone as agency staff
export const checkCanJoinAgency = async (userId: number) => {
    if (ALLOW_PROVIDER_AND_AGENCY_TOGETHER) return;

    const providerProfile = await prisma.providerProfile.findUnique({
        where: { userId },
        select: { id: true },
    });

    if (providerProfile) {
        throw new AppError(409, "This phone number is already registered as an individual provider, so it can't join an agency");
    }
};
