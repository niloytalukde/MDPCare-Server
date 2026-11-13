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

/**
 * Provider location: the app sends every 30 s. Allow at most 6 per minute
 * per provider (1 every 10 s), so a buggy app can't flood the server.
 * Must run AFTER `auth` (it uses the logged-in user id).
 */
export const locationUpdateLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 6,
    keyGenerator: (req: Request) => `location|${req.user?.id ?? ip(req)}`,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: json("Location is being sent too often. Send it every 30 seconds."),
});

/**
 * Location search (/places): Google charges per call, so max 60 per minute
 * per user. Typing a search sends a few calls; this leaves plenty of room.
 */
export const placesLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 60,
    keyGenerator: (req: Request) => `places|${req.user?.id ?? ip(req)}`,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: json("Too many location searches. Please wait a moment."),
});
