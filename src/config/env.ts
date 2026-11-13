import "dotenv/config";

// ---------------------------------------------
// Helpers
// ---------------------------------------------

const required = (key: string): string => {
    const value = process.env[key];
    if (!value || !value.trim()) {
        throw new Error(`Missing environment variable: ${key}`);
    }
    return value;
};

const int = (key: string, fallback: number): number => {
    const raw = process.env[key];
    if (raw === undefined || raw === "") return fallback;
    const n = Number(raw);
    if (!Number.isFinite(n)) {
        throw new Error(`Environment variable ${key} must be a number`);
    }
    return n;
};

const list = (key: string, fallback: string[]): string[] => {
    const raw = process.env[key];
    if (!raw) return fallback;
    return raw.split(",").map((s) => s.trim()).filter(Boolean);
};

// Defaulting to "production" when NODE_ENV is unset is deliberate: it makes
// the error handler and OTP service fail closed if a deploy forgets the var.
const NODE_ENV = process.env.NODE_ENV || "production";
const isProduction = NODE_ENV === "production";

// ---------------------------------------------
// JWT secrets: no hard-coded fallbacks (SEC-03)
// ---------------------------------------------

const JWT_ACCESS_SECRET = required("JWT_ACCESS_SECRET");
const JWT_REFRESH_SECRET = required("JWT_REFRESH_SECRET");

if (JWT_ACCESS_SECRET.length < 32 || JWT_REFRESH_SECRET.length < 32) {
    throw new Error("JWT secrets must be at least 32 characters long");
}
if (JWT_ACCESS_SECRET === JWT_REFRESH_SECRET) {
    throw new Error("JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be different");
}

const TEST_OTP_ENABLED = process.env.TEST_OTP_ENABLED === "true";
if (TEST_OTP_ENABLED && isProduction) {
    throw new Error("TEST_OTP_ENABLED must not be true when NODE_ENV=production");
}

const radii = list("BOOKING_ROUND_RADII_KM", ["3", "6", "10"]).map(Number);
if (!radii.length || radii.some((r) => !Number.isFinite(r) || r <= 0)) {
    throw new Error("BOOKING_ROUND_RADII_KM must be a comma-separated list of positive numbers");
}

export const env = {
    NODE_ENV,
    isProduction,
    PORT: int("PORT", 5000),
    CORS_ORIGINS: list("CORS_ORIGIN", ["*"]),
    // Number of reverse proxies in front of the app (for correct client IPs in rate limiting)
    TRUST_PROXY: int("TRUST_PROXY", 0),

    DATABASE_URL: required("DATABASE_URL"),
    REDIS_URL: process.env.REDIS_URL || undefined,

    JWT_ACCESS_SECRET,
    JWT_REFRESH_SECRET,
    JWT_ACCESS_EXPIRES_IN: process.env.JWT_ACCESS_EXPIRES_IN || "15m",
    JWT_REFRESH_EXPIRES_IN: process.env.JWT_REFRESH_EXPIRES_IN || "30d",
    JWT_ISSUER: process.env.JWT_ISSUER || "mdpcare-api",
    JWT_AUDIENCE: process.env.JWT_AUDIENCE || "mdpcare-app",

    TWILIO_ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID,
    TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN,
    TWILIO_VERIFY_SERVICE_SID: process.env.TWILIO_VERIFY_SERVICE_SID,

    TEST_OTP_ENABLED,
    TEST_PHONE_NUMBER: process.env.TEST_PHONE_NUMBER,
    TEST_OTP_CODE: process.env.TEST_OTP_CODE,
    OTP_EXPIRES_IN_MINUTES: int("OTP_EXPIRES_IN_MINUTES", 5),

    // Booking matching (business decision Q3 - configurable, not hard-coded)
    BOOKING_ROUND_RADII_KM: radii,
    BOOKING_ROUND_TIMEOUT_SECONDS: int("BOOKING_ROUND_TIMEOUT_SECONDS", 60),
    BOOKING_MAX_CANDIDATES_PER_ROUND: int("BOOKING_MAX_CANDIDATES_PER_ROUND", 25),
    BOOKING_SWEEP_INTERVAL_SECONDS: int("BOOKING_SWEEP_INTERVAL_SECONDS", 10),
    BOOKING_COMPLETION_OTP_TTL_MINUTES: int("BOOKING_COMPLETION_OTP_TTL_MINUTES", 240),
    // Provider live location (app sends it every 30 seconds)
    // - every update is kept in Redis
    // - it is written to the database at most once every PROVIDER_LOCATION_DB_SAVE_SECONDS
    // - booking search ignores providers whose saved location is older than PROVIDER_LOCATION_STALE_SECONDS
    PROVIDER_LOCATION_DB_SAVE_SECONDS: int("PROVIDER_LOCATION_DB_SAVE_SECONDS", 600), // 600 s = 10 minutes
    PROVIDER_LOCATION_STALE_SECONDS: int("PROVIDER_LOCATION_STALE_SECONDS", 900), // 900 s = 15 minutes
    // Set to "false" to run without background workers (e.g. one-off scripts, tests)
    BOOKING_WORKERS_ENABLED: process.env.BOOKING_WORKERS_ENABLED !== "false",
};

export type Env = typeof env;
