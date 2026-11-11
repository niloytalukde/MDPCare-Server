import twilio from "twilio";
import { env } from "../config/env.js";

const getVerifyService = () => {
    if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN || !env.TWILIO_VERIFY_SERVICE_SID) {
        throw new Error("Twilio credentials are not fully configured in environment variables");
    }

    const client = twilio(
        env.TWILIO_ACCOUNT_SID,
        env.TWILIO_AUTH_TOKEN
    );

    return client.verify.v2.services(env.TWILIO_VERIFY_SERVICE_SID);
};

export const sendOTP = async (phone: string) => {
    const verifyService = getVerifyService();
    return verifyService.verifications.create({
        to: phone,
        channel: "sms",
    });
};

export const verifyOTP = async (
    phone: string,
    code: string
) => {
    const verifyService = getVerifyService();
    const result = await verifyService.verificationChecks.create({
        to: phone,
        code,
    });

    return result.status === "approved";
};
