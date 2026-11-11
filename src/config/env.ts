import "dotenv/config";

const requiredEnv = ["DATABASE_URL"];

for (const key of requiredEnv) {
    if (!process.env[key]) {
        throw new Error(`Missing environment variable: ${key}`);
    }
}

export const env = {
    NODE_ENV: process.env.NODE_ENV || "development",
    PORT: Number(process.env.PORT) || 5000,
    CORS_ORIGIN: process.env.CORS_ORIGIN || "*",
    JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET || "mdpcare_access_secret_key_change_in_production",
    JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET || "mdpcare_refresh_secret_key_change_in_production",
    JWT_ACCESS_EXPIRES_IN: process.env.JWT_ACCESS_EXPIRES_IN || "15m",
    JWT_REFRESH_EXPIRES_IN: process.env.JWT_REFRESH_EXPIRES_IN || "30d",
    TWILIO_ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID,
    TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN,
    TWILIO_VERIFY_SERVICE_SID: process.env.TWILIO_VERIFY_SERVICE_SID,
    TEST_OTP_ENABLED: process.env.TEST_OTP_ENABLED === "true",
    TEST_PHONE_NUMBER: process.env.TEST_PHONE_NUMBER,
    TEST_OTP_CODE: process.env.TEST_OTP_CODE,
};
