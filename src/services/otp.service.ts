import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma.js";
import { env } from "../config/env.js";
import { AppError } from "../errors/AppError.js";
import * as twilio from "./twilio.service.js";

export type OtpPurpose = "REGISTRATION" | "LOGIN";

const MAX_OTP_ATTEMPTS = 5;
const RESEND_COOLDOWN_SECONDS = 60;

const twilioConfigured = () =>
    Boolean(env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_VERIFY_SERVICE_SID);

/**
 * The fixed test OTP only works outside production, and only for the
 * configured test number (SEC-06). env.ts refuses to boot with
 * TEST_OTP_ENABLED=true in production.
 */
const isTestNumber = (phone: string) =>
    !env.isProduction &&
    env.TEST_OTP_ENABLED &&
    Boolean(env.TEST_OTP_CODE) &&
    phone === env.TEST_PHONE_NUMBER;

// ---------------------------------------------
// Send
// ---------------------------------------------

export const sendOTP = async (phone: string, purpose: OtpPurpose = "REGISTRATION") => {
    if (isTestNumber(phone)) {
        return sendTestOTP(phone, purpose);
    }

    if (!twilioConfigured()) {
        throw new AppError(503, "OTP service is not available. Please try again later.");
    }

    try {
        await twilio.sendOTP(phone);
    } catch (error) {
        console.error("Twilio send failed:", (error as Error).message);
        throw new AppError(502, "Could not send OTP. Please try again.");
    }

    return { status: "pending", message: "OTP sent successfully" };
};

const sendTestOTP = async (phone: string, purpose: OtpPurpose) => {
    const now = new Date();
    const otpHash = await bcrypt.hash(env.TEST_OTP_CODE as string, 10);

    // Cooldown check + invalidate + create in one transaction so two
    // concurrent requests cannot both pass the cooldown (SEC-07).
    await prisma.$transaction(async (tx) => {
        // Serialize per phone for the duration of this transaction
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"otp:" + phone}))`;

        const recentOtp = await tx.otpCode.findFirst({
            where: {
                phone,
                createdAt: { gt: new Date(now.getTime() - RESEND_COOLDOWN_SECONDS * 1000) },
            },
            select: { id: true },
        });

        if (recentOtp) {
            throw new AppError(429, `Please wait ${RESEND_COOLDOWN_SECONDS} seconds before requesting another OTP`);
        }

        await tx.otpCode.updateMany({
            where: { phone, consumedAt: null },
            data: { consumedAt: now },
        });

        await tx.otpCode.create({
            data: {
                phone,
                otpHash,
                purpose,
                expiresAt: new Date(now.getTime() + env.OTP_EXPIRES_IN_MINUTES * 60 * 1000),
            },
        });
    });

    if (env.NODE_ENV === "development") {
        console.log(`[TEST OTP] issued for test number (code from TEST_OTP_CODE)`);
    }

    return { status: "pending", message: "Test OTP sent successfully" };
};

// ---------------------------------------------
// Verify
// ---------------------------------------------

export const verifyOTP = async (phone: string, code: string): Promise<boolean> => {
    if (isTestNumber(phone)) {
        return verifyTestOTP(phone, code);
    }

    if (!twilioConfigured()) {
        throw new AppError(503, "OTP service is not available. Please try again later.");
    }

    try {
        return await twilio.verifyOTP(phone, code);
    } catch (error) {
        // Twilio returns 404 when no pending verification exists / max attempts hit
        console.error("Twilio verify failed:", (error as Error).message);
        return false;
    }
};

const verifyTestOTP = async (phone: string, code: string): Promise<boolean> => {
    const now = new Date();

    const otpRecord = await prisma.otpCode.findFirst({
        where: {
            phone,
            consumedAt: null,
            verifiedAt: null,
            expiresAt: { gt: now },
            attempts: { lt: MAX_OTP_ATTEMPTS },
        },
        orderBy: { createdAt: "desc" },
    });

    if (!otpRecord) return false;

    const isValid = await bcrypt.compare(code, otpRecord.otpHash);

    if (!isValid) {
        await prisma.otpCode.updateMany({
            where: { id: otpRecord.id, consumedAt: null, verifiedAt: null, attempts: { lt: MAX_OTP_ATTEMPTS } },
            data: { attempts: { increment: 1 } },
        });
        return false;
    }

    // Atomic single-use consumption (replay protection)
    const result = await prisma.otpCode.updateMany({
        where: {
            id: otpRecord.id,
            consumedAt: null,
            verifiedAt: null,
            expiresAt: { gt: now },
            attempts: { lt: MAX_OTP_ATTEMPTS },
        },
        data: { verifiedAt: now, consumedAt: now },
    });

    return result.count === 1;
};
