// =====================================================================
// CUSTOMER APP - login / registration   (mounted at /api/v1/auth)
//
// The real OTP work is in phone-login.service.ts (shared with the
// provider app). This file only adds what is special for customers:
// every user who logs in through the customer app gets the CUSTOMER role.
// =====================================================================

import {
    sendLoginOtp,
    verifyLoginOtp,
    refreshLoginTokens,
    logoutEverywhere,
    giveRole,
} from "./phone-login.service.js";
import { CustomerService } from "../customer/customer.service.js";

// ---------------------------------------------------------------
// 1. Send OTP
// ---------------------------------------------------------------

const sendOTPToPhone = async (phone: string) => {
    const result = await sendLoginOtp(phone);

    return {
        ...result,
        message: result.isNewUser ? "Registration OTP sent successfully" : "Login OTP sent successfully",
    };
};

// ---------------------------------------------------------------
// 2. Verify OTP -> login (or register if the phone is new)
// ---------------------------------------------------------------

const verifyOTPAndLogin = async (phone: string, code: string) => {
    const login = await verifyLoginOtp(phone, code);

    // Anyone using the customer app is a customer
    await giveRole(login.userId, "CUSTOMER");

    const profile = await CustomerService.getCustomerProfile(login.userId);

    return {
        message: login.isNewUser ? "Registration successful" : "Login successful",
        isNewUser: login.isNewUser,
        needsProfileCompletion: profile.needsProfileCompletion,
        user: profile,
        tokens: login.tokens,
    };
};

export const AuthService = {
    sendOTPToPhone,
    verifyOTPAndLogin,
    refreshAccessToken: refreshLoginTokens,
    logout: logoutEverywhere,
};
