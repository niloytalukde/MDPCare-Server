// =====================================================================
// PROVIDER APP - login / registration   (mounted at /api/v1/provider/auth)
//
// ONE provider app is used by:
//   - individual providers
//   - agency owners, managers and staff
//
// Logging in does NOT make anyone a provider. After login the app reads
// `account.nextStep` and shows the right screen:
//
//   "CHOOSE_ACCOUNT_TYPE"   new person -> show 2 buttons:
//                           "Register as individual"  -> POST /api/v1/provider/register
//                           "Create an agency"        -> POST /api/v1/agencies
//   "ACCEPT_AGENCY_INVITE"  an agency invited this phone -> accept the invite
//   "PROVIDER_HOME"         individual provider home screen
//   "AGENCY_HOME"           agency home screen
// =====================================================================

import { prisma } from "../../../lib/prisma.js";
import { AppError } from "../../../errors/AppError.js";
import { sendLoginOtp, verifyLoginOtp } from "../../Auth/phone-login.service.js";
import { personalDetailsSelect, toUserUpdateData, type PersonalDetailsInput } from "../../Auth/personal-details.js";

// ---------------------------------------------------------------
// Who is this person in the provider app?
// ---------------------------------------------------------------

const getProviderAppAccount = async (userId: number) => {
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
            ...personalDetailsSelect,
            userRoles: { select: { role: true } },
            providerProfile: {
                select: { id: true, status: true, verificationStatus: true, availabilityStatus: true },
            },
            agencyMemberships: {
                where: { status: { in: ["ACTIVE", "INVITED"] } },
                select: {
                    id: true,
                    role: true,
                    status: true,
                    agency: { select: { id: true, name: true, status: true, logoUrl: true } },
                },
            },
        },
    });

    if (!user) {
        throw new AppError(404, "User not found");
    }

    const { userRoles, providerProfile, agencyMemberships, ...personal } = user;

    const activeAgencies = agencyMemberships.filter((m) => m.status === "ACTIVE");
    const pendingInvites = agencyMemberships.filter((m) => m.status === "INVITED");

    // Decide which screen the app should open
    let accountType: "INDIVIDUAL_PROVIDER" | "AGENCY" | "NONE" = "NONE";
    let nextStep: "PROVIDER_HOME" | "AGENCY_HOME" | "ACCEPT_AGENCY_INVITE" | "CHOOSE_ACCOUNT_TYPE";

    if (providerProfile) {
        accountType = "INDIVIDUAL_PROVIDER";
        nextStep = "PROVIDER_HOME";
    } else if (activeAgencies.length > 0) {
        accountType = "AGENCY";
        nextStep = "AGENCY_HOME";
    } else if (pendingInvites.length > 0) {
        nextStep = "ACCEPT_AGENCY_INVITE";
    } else {
        nextStep = "CHOOSE_ACCOUNT_TYPE";
    }

    return {
        accountType,
        nextStep,
        user: { ...personal, roles: userRoles.map((r) => r.role) },
        providerProfile, // null if not an individual provider
        agencies: activeAgencies.map((m) => ({
            memberId: m.id,
            myRole: m.role, // OWNER | MANAGER | STAFF
            agency: m.agency,
        })),
        pendingInvites: pendingInvites.map((m) => ({
            memberId: m.id,
            agency: m.agency,
        })),
    };
};

// ---------------------------------------------------------------
// 1. Send OTP
// ---------------------------------------------------------------

const sendProviderOTP = async (phone: string) => {
    const result = await sendLoginOtp(phone);
    return { ...result, message: "OTP sent successfully" };
};

// ---------------------------------------------------------------
// 2. Verify OTP -> login (creates the User if the phone is new)
// ---------------------------------------------------------------

const verifyProviderOTP = async (phone: string, code: string) => {
    const login = await verifyLoginOtp(phone, code);
    const account = await getProviderAppAccount(login.userId);

    return {
        message: login.isNewUser ? "Registration successful" : "Login successful",
        isNewUser: login.isNewUser,
        account,
        tokens: login.tokens,
    };
};

// ---------------------------------------------------------------
// 3. Update my personal details (anyone in the provider app,
//    e.g. an agency owner changing their own name or photo)
// ---------------------------------------------------------------

const updateMyPersonalDetails = async (userId: number, input: PersonalDetailsInput) => {
    await prisma.user.update({
        where: { id: userId },
        data: toUserUpdateData(input),
    });
    return getProviderAppAccount(userId);
};

export const ProviderAuthService = {
    sendProviderOTP,
    verifyProviderOTP,
    getProviderAppAccount,
    updateMyPersonalDetails,
};
