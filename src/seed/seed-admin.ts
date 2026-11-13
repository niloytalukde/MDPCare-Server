// =====================================================================
// SEED ADMIN - runs every time the server starts
// =====================================================================
//
// Makes sure the admin account from .env exists:
//
//   ADMIN_PHONE=+919812345678     (required for the seed - E.164 format)
//   ADMIN_NAME=MDPCare Admin      (optional, only used when creating)
//
//   1. ADMIN_PHONE not set              -> skip (nothing to do)
//   2. That phone is already an ADMIN   -> skip ("admin already exists")
//   3. User with that phone exists      -> give them the ADMIN role
//   4. No user with that phone          -> create the user + ADMIN role
//
// The admin then logs in to the admin panel with this phone + OTP.
// Running it again and again is safe: it never creates a second admin
// and never changes anything that is already there.
// =====================================================================

import { env } from "../config/env.js";
import { prisma } from "../lib/prisma.js";

// "+" then 8 to 15 digits, e.g. +919812345678
const E164_PHONE = /^\+[1-9]\d{7,14}$/;

export const seedAdmin = async () => {
    const phone = env.ADMIN_PHONE;

    // 1. Not set up in .env
    if (!phone) {
        console.log("Admin seed: ADMIN_PHONE is not set in .env - skipped.");
        return;
    }
    if (!E164_PHONE.test(phone)) {
        console.warn(`Admin seed: ADMIN_PHONE "${phone}" is not valid (use +91XXXXXXXXXX) - skipped.`);
        return;
    }

    // 2. Already an admin?
    const existingUser = await prisma.user.findUnique({
        where: { phone },
        select: { id: true, userRoles: { select: { role: true } } },
    });

    const isAlreadyAdmin = existingUser?.userRoles.some((r) => r.role === "ADMIN") ?? false;
    if (isAlreadyAdmin) {
        console.log(`Admin seed: admin ${phone} already exists - skipped.`);
        return;
    }

    // 3 + 4. Create the user if needed, then give the ADMIN role.
    // upsert = "create it, or leave it as it is if it's already there",
    // so two servers starting at the same time can't make duplicates.
    const user = await prisma.user.upsert({
        where: { phone },
        create: { phone, name: env.ADMIN_NAME },
        update: {}, // existing user: change nothing
        select: { id: true },
    });

    await prisma.userRole.upsert({
        where: { userId_role: { userId: user.id, role: "ADMIN" } },
        create: { userId: user.id, role: "ADMIN" },
        update: {},
    });

    console.log(
        existingUser
            ? `Admin seed: gave the ADMIN role to the existing user ${phone}.`
            : `Admin seed: created the admin ${phone}.`
    );
};
