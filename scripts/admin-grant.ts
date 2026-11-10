// Make a user a Calvy super admin (or take it away, or reset their 2FA). This is the ONLY way: no page or API can do it.
//   npm run admin:grant -- you@example.com
//   npm run admin:revoke -- you@example.com
//   npm run admin:reset-2fa -- you@example.com     (lost phone and recovery codes: they enroll again at next sign-in)
// It uses the database in DATABASE_URL (the npm script loads .env.local, so that is your dev database).
import { PrismaClient } from "@prisma/client";

const mode = process.argv[2] as "grant" | "revoke" | "reset-2fa" | undefined;
const email = (process.argv[3] ?? "").trim().toLowerCase();

async function main() {
  if (!mode || !["grant", "revoke", "reset-2fa"].includes(mode) || !email.includes("@")) {
    console.error("Usage: tsx scripts/admin-grant.ts <grant|revoke|reset-2fa> <email>");
    process.exit(1);
  }
  const prisma = new PrismaClient();
  try {
    const user = await prisma.user.findFirst({ where: { email: { equals: email, mode: "insensitive" } }, select: { id: true, email: true, isSuperAdmin: true } });
    if (!user) { console.error(`No Calvy user with the email ${email}. Sign up or log in once with that email first.`); process.exit(1); }
    if (mode === "grant") {
      await prisma.user.update({ where: { id: user.id }, data: { isSuperAdmin: true } });
      console.log(`${user.email} is now a super admin. At the next visit to /admin you will set up an authenticator app (2FA).`);
    } else if (mode === "revoke") {
      await prisma.user.update({ where: { id: user.id }, data: { isSuperAdmin: false, adminTotpSecret: null, adminTotpEnabledAt: null, adminTotpLastStep: null, adminRecoveryHashes: [] } });
      await prisma.adminSession.updateMany({ where: { userId: user.id, endedAt: null }, data: { endedAt: new Date() } });
      console.log(`${user.email} is no longer a super admin; their admin sessions are ended.`);
    } else {
      await prisma.user.update({ where: { id: user.id }, data: { adminTotpSecret: null, adminTotpEnabledAt: null, adminTotpLastStep: null, adminRecoveryHashes: [] } });
      await prisma.adminSession.updateMany({ where: { userId: user.id, endedAt: null }, data: { endedAt: new Date() } });
      console.log(`2FA reset for ${user.email}. They enroll again at the next /admin visit.${user.isSuperAdmin ? "" : " (They are not a super admin: run admin:grant too.)"}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}
void main();
