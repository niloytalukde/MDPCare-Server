/**
 * Grants the ADMIN role to an existing user. There is intentionally no API for this.
 *   npx tsx scripts/grant-admin.ts +919812345678
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma.js";

const phone = process.argv[2];
if (!phone) {
    console.error("Usage: npx tsx scripts/grant-admin.ts <E.164 phone>");
    process.exit(1);
}

const user = await prisma.user.findUnique({ where: { phone }, select: { id: true } });
if (!user) {
    console.error("No user with that phone. Log in once via OTP first.");
    process.exit(1);
}

await prisma.userRole.upsert({
    where: { userId_role: { userId: user.id, role: "ADMIN" } },
    update: {},
    create: { userId: user.id, role: "ADMIN" },
});
console.log(`ADMIN granted to user ${user.id}`);
await prisma.$disconnect();
