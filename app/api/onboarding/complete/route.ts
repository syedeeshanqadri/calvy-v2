import { safeRoute } from "@/lib/api";
import { NextResponse } from "next/server";
import { wizardOwner } from "@/lib/onboardingAuth";
import { completeOnboarding } from "@/lib/onboardingDb";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { convertSignupLead } from "@/lib/leads";
import { createSetupToken } from "@/lib/auth-tokens";
import { notify } from "@/lib/notifications/enqueue";
import { authEmail } from "@/lib/notifications/events";

export const dynamic = "force-dynamic";

/** Finish the wizard: marks it complete and sends the "business is live" email once. */
async function POST_handler() {
  const w = await wizardOwner();
  if (!w) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const r = await completeOnboarding(w.business.id, w.user);
  if (r.firstTime) {
    // The lead is converted with the plan chosen, and an owner who signed up by email (so is still unverified, with no password) gets the
    // "Set your password" email: one single-use link, 7 days, which sets the password and verifies the address. Google owners are already verified.
    const plan = (await prisma.business.findUnique({ where: { id: w.business.id }, select: { intendedPlan: true } }))?.intendedPlan ?? "free";
    await convertSignupLead(prisma, w.user, plan).catch((err) => logger.error("[onboarding] lead not converted", { err }));
    try {
      const u = await prisma.user.findUnique({ where: { id: w.user.id }, select: { password: true, emailVerified: true } });
      if (u && !u.password && !u.emailVerified) {
        const { token, tokenHash, expiresAt } = createSetupToken();
        await prisma.$transaction([
          prisma.passwordResetToken.deleteMany({ where: { userId: w.user.id, usedAt: null } }),
          prisma.passwordResetToken.create({ data: { userId: w.user.id, tokenHash, expiresAt } }),
        ]);
        await notify(authEmail({ template: "owner_account_setup", userId: w.user.id, to: w.user.email, name: w.user.name, token }));
      }
    } catch (err) {
      logger.error("[onboarding] set-password email not queued", { err });
    }
  }
  return NextResponse.json({ success: true, slug: r.slug });
}

export const POST = safeRoute(POST_handler);
