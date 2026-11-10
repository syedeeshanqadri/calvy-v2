import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { adminAudit, type AdminActor } from "@/lib/admin/audit";
import { notify } from "@/lib/notifications/enqueue";
import { authEmail } from "@/lib/notifications/events";
import { ownerLive } from "@/lib/notifications/business";
import { createSetupToken } from "@/lib/auth-tokens";
import { createBusinessForUser } from "@/lib/createBusiness";
import { tryNormalizeEmail } from "@/lib/email-normalize";
import { PACK_IDS } from "@/lib/packs/types";
import { REGIONS, currencyForRegion } from "@/lib/regions";
import { phoneField } from "@/lib/validation/common";

const reason = z.string().trim().min(8, "Give a reason (at least 8 characters).").max(500);
const optText = (max: number) => z.preprocess((v) => (v === "" ? undefined : v), z.string().trim().max(max).optional());

/** The things a Calvy admin can do to one business. Every one needs a reason and writes an audit row in the same transaction. */
export const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("edit"), reason, name: optText(120), phone: z.preprocess((v) => (v === "" ? undefined : v), phoneField.optional()), email: z.preprocess((v) => (v === "" ? undefined : v), z.string().trim().toLowerCase().email().max(254).optional()), address: optText(300), website: optText(300), description: optText(2000) }),
  z.object({ action: z.literal("suspend"), reason }),
  z.object({ action: z.literal("unsuspend"), reason }),
  z.object({ action: z.literal("plan_override"), reason, plan: z.enum(["free", "professional", "business"]), until: z.preprocess((v) => (v === "" ? undefined : v), z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()) }),
  z.object({ action: z.literal("plan_override_clear"), reason }),
  z.object({ action: z.literal("resend_setup_email"), reason }),
  z.object({ action: z.literal("resend_live_email"), reason }),
  z.object({ action: z.literal("reset_onboarding"), reason }),
]);
export type BusinessAction = z.infer<typeof actionSchema>;

export const createBusinessSchema = z.object({
  reason,
  ownerName: z.string().trim().min(1).max(120),
  ownerEmail: z.string().trim().toLowerCase().email().max(254),
  businessName: z.string().trim().min(1).max(120),
  packId: z.enum(PACK_IDS),
  country: z.enum(REGIONS.map((r) => r.code) as [string, ...string[]]),
  phone: z.preprocess((v) => (v === "" ? undefined : v), phoneField.optional()),
});

export type ActionResult = { ok: true; message: string } | { ok: false; status: number; error: string };
const fail = (status: number, error: string): ActionResult => ({ ok: false, status, error });

/** End of the chosen day (UTC): an override "until 2026-12-31" lasts through that day. */
export const endOfDayUtc = (d: string) => new Date(`${d}T23:59:59.999Z`);

export async function runBusinessAction(actor: AdminActor, businessId: string, input: BusinessAction, now = new Date()): Promise<ActionResult> {
  const b = await prisma.business.findUnique({
    where: { id: businessId },
    select: { id: true, name: true, slug: true, plan: true, planStatus: true, planOverridePlan: true, planOverrideFromPlan: true, planOverrideFromStatus: true, suspendedAt: true, owner: { select: { id: true, name: true, email: true, password: true, emailVerified: true } } },
  });
  if (!b) return fail(404, "Business not found.");
  const why = input.reason;

  switch (input.action) {
    case "edit": {
      const data: Record<string, string> = {};
      for (const k of ["name", "phone", "email", "address", "website", "description"] as const) if (input[k] !== undefined) data[k] = input[k] as string;
      if (!Object.keys(data).length) return fail(400, "Change at least one field.");
      await prisma.$transaction(async (tx) => {
        await tx.business.update({ where: { id: b.id }, data });
        await adminAudit(tx, actor, { action: "business.edit", businessId: b.id, reason: why, detail: { fields: Object.keys(data), ...(data.name ? { oldName: b.name, newName: data.name } : {}) } });
      });
      return { ok: true, message: "Details saved." };
    }
    case "suspend": {
      if (b.suspendedAt) return fail(409, "Already suspended.");
      await prisma.$transaction(async (tx) => {
        await tx.business.update({ where: { id: b.id }, data: { suspendedAt: now, suspendedReason: why } });
        await adminAudit(tx, actor, { action: "business.suspend", businessId: b.id, reason: why });
      });
      return { ok: true, message: "Suspended. New bookings are blocked; existing bookings and reminders carry on." };
    }
    case "unsuspend": {
      if (!b.suspendedAt) return fail(409, "Not suspended.");
      await prisma.$transaction(async (tx) => {
        await tx.business.update({ where: { id: b.id }, data: { suspendedAt: null, suspendedReason: null } });
        await adminAudit(tx, actor, { action: "business.unsuspend", businessId: b.id, reason: why });
      });
      return { ok: true, message: "Unsuspended." };
    }
    case "plan_override": {
      const until = input.until ? endOfDayUtc(input.until) : null;
      if (until && until.getTime() <= now.getTime()) return fail(400, "The end date must be in the future.");
      await prisma.$transaction(async (tx) => {
        // Keep the ORIGINAL plan across repeated overrides, so clearing always goes back to what the business really had.
        const fromPlan = b.planOverridePlan ? b.planOverrideFromPlan : b.plan;
        const fromStatus = b.planOverridePlan ? b.planOverrideFromStatus : b.planStatus;
        await tx.business.update({ where: { id: b.id }, data: { plan: input.plan, planStatus: "active", planOverridePlan: input.plan, planOverrideUntil: until, planOverrideFromPlan: fromPlan, planOverrideFromStatus: fromStatus } });
        await adminAudit(tx, actor, { action: "business.plan_override", businessId: b.id, reason: why, detail: { plan: input.plan, until: until?.toISOString() ?? null, from: fromPlan } });
      });
      return { ok: true, message: input.until ? `Plan set to ${input.plan} until ${input.until}.` : `Plan set to ${input.plan} until cleared.` };
    }
    case "plan_override_clear": {
      if (!b.planOverridePlan) return fail(409, "No override is active.");
      await prisma.$transaction(async (tx) => {
        await tx.business.update({ where: { id: b.id }, data: { plan: b.planOverrideFromPlan ?? "free", planStatus: b.planOverrideFromStatus ?? "free", planOverridePlan: null, planOverrideUntil: null, planOverrideFromPlan: null, planOverrideFromStatus: null } });
        await adminAudit(tx, actor, { action: "business.plan_override_clear", businessId: b.id, reason: why, detail: { backTo: b.planOverrideFromPlan } });
      });
      return { ok: true, message: "Override cleared." };
    }
    case "resend_setup_email": {
      // Only for an owner who has not set a password yet: the email verifies the address and sets the first password.
      if (b.owner.password || b.owner.emailVerified) return fail(409, "The owner already set a password. They can use Forgot password instead.");
      const { token, tokenHash, expiresAt } = createSetupToken();
      await prisma.$transaction(async (tx) => {
        await tx.passwordResetToken.deleteMany({ where: { userId: b.owner.id, usedAt: null } });
        await tx.passwordResetToken.create({ data: { userId: b.owner.id, tokenHash, expiresAt } });
        await adminAudit(tx, actor, { action: "business.resend_setup_email", businessId: b.id, reason: why });
      });
      await notify(authEmail({ template: "owner_account_setup", userId: b.owner.id, to: b.owner.email, name: b.owner.name, token }));
      return { ok: true, message: "Setup email sent to the owner." };
    }
    case "resend_live_email": {
      await prisma.$transaction((tx) => adminAudit(tx, actor, { action: "business.resend_live_email", businessId: b.id, reason: why }));
      await notify(ownerLive({ businessId: b.id, slug: b.slug, businessName: b.name, ownerName: b.owner.name, ownerEmail: b.owner.email }, `admin:${now.getTime()}`));
      return { ok: true, message: "\"Your business is live\" email sent to the owner." };
    }
    case "reset_onboarding": {
      await prisma.$transaction(async (tx) => {
        await tx.business.update({ where: { id: b.id }, data: { onboardingCompletedAt: null, onboardingStep: 1 } });
        await adminAudit(tx, actor, { action: "business.reset_onboarding", businessId: b.id, reason: why });
      });
      return { ok: true, message: "Onboarding reset: the owner sees the setup wizard at next login." };
    }
  }
}

/** Create a business by hand for an owner who has no account yet. The owner gets the same "verify and set your password" email as a sign-up. */
export async function createBusinessByAdmin(actor: AdminActor, input: z.infer<typeof createBusinessSchema>): Promise<ActionResult & { businessId?: string }> {
  const email = tryNormalizeEmail(input.ownerEmail);
  if (!email) return fail(400, "Invalid owner email.");
  if (await prisma.user.findFirst({ where: { email: { equals: email, mode: "insensitive" } }, select: { id: true } })) return fail(409, "A user with this email already exists.");
  const region = input.country === "IN" ? "IN" : "INTL";
  const user = await prisma.user.create({ data: { name: input.ownerName, email } });
  const business = await createBusinessForUser({
    ownerId: user.id, ownerName: input.ownerName, ownerEmail: email, businessName: input.businessName,
    currency: currencyForRegion(input.country) ?? "USD", region, packId: input.packId, phone: input.phone, onboardingStep: 2, welcome: false,
  });
  const { token, tokenHash, expiresAt } = createSetupToken();
  await prisma.passwordResetToken.create({ data: { userId: user.id, tokenHash, expiresAt } });
  await prisma.$transaction((tx) => adminAudit(tx, actor, { action: "business.create", businessId: business.id, reason: input.reason, detail: { pack: input.packId, country: input.country } }));
  await notify(authEmail({ template: "owner_account_setup", userId: user.id, to: email, name: input.ownerName, token }));
  return { ok: true, message: "Business created. The owner was emailed a link to verify and set a password.", businessId: business.id };
}
