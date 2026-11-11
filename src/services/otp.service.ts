
import { env } from "../config/env.js";

export const sendOTP = async (phone: string) => {
    if (!env.TEST_OTP_ENABLED) {
        throw new Error("Test OTP is disabled");
    }

    if (phone !== env.TEST_PHONE_NUMBER) {
        throw new Error("This is not an authorized test number");
    }

    console.log(`[TEST OTP] ${env.TEST_OTP_CODE}`);

    return {
        status: "pending",
        message: "Test OTP sent successfully",
    };
};

export const verifyOTP = async (
    phone: string,
    code: string
): Promise<boolean> => {
    return (
        env.TEST_OTP_ENABLED &&
        phone === env.TEST_PHONE_NUMBER &&
        code === env.TEST_OTP_CODE
    );
};
