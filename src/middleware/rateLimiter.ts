import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import type { Request } from "express";

// NOTE: default in-memory store = per-process limits. When running more than one
// instance, plug in a shared store (e.g. `rate-limit-redis`) - see changelog.

const json = (message: string) => ({ success: false, message });

const ip = (req: Request) => ipKeyGenerator(req.ip ?? "unknown");
const phoneKey = (req: Request) => {
    const phone = typeof req.body?.phone === "string" ? req.body.phone.trim() : "";
    return `${ip(req)}|${phone}`;
};

/** Baseline protection for every API route. */
export const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 600,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: json("Too many requests. Please try again later."),
});

/** OTP send: per IP+phone, to cap SMS cost and enumeration. */
export const otpSendLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 5,
    keyGenerator: phoneKey,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: json("Too many OTP requests. Please wait before trying again."),
});

/** OTP verify: per IP+phone, on top of the per-code attempt counter (SEC-05). */
export const otpVerifyLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    keyGenerator: phoneKey,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: json("Too many verification attempts. Please wait before trying again."),
});

/** Token refresh. */
export const refreshLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 60,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: json("Too many requests. Please try again later."),
});

/** Booking-side OTP verification (service completion). */
export const bookingOtpLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: json("Too many attempts. Please try again later."),
});
