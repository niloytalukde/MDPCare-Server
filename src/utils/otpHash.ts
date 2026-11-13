import crypto from "node:crypto";
import { env } from "../config/env.js";

/**
 * Booking OTPs are short numeric codes, so they are hashed with a keyed HMAC
 * (server-side pepper) rather than a plain hash: a leaked DB row alone cannot be
 * brute-forced offline. Key is derived from the access secret unless
 * BOOKING_OTP_PEPPER is set.
 */
const pepper = crypto
    .createHmac("sha256", process.env.BOOKING_OTP_PEPPER || env.JWT_ACCESS_SECRET)
    .update("mdpcare:booking-otp:v1")
    .digest();

export const hashBookingOtp = (bookingId: number, code: string) =>
    crypto.createHmac("sha256", pepper).update(`${bookingId}:${code}`).digest("hex");

export const verifyBookingOtpHash = (bookingId: number, code: string, storedHex: string) => {
    const a = Buffer.from(hashBookingOtp(bookingId, code), "hex");
    const b = Buffer.from(storedHex, "hex");
    return a.length === b.length && crypto.timingSafeEqual(a, b);
};

export const generateNumericOtp = (digits = 6) =>
    crypto.randomInt(0, 10 ** digits).toString().padStart(digits, "0");
