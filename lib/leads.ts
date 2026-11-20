// Sign-up leads: every owner who signs up becomes a Lead (source "signup") the moment the account exists, carries the onboarding step they reached,
// and turns "converted" (with the plan they chose) when onboarding finishes. Abandoned onboarding is chased by four reminder emails
// (lib/onboardingReminders.ts), counted from the owner's last activity and stopped by completion or an unsubscribe.
import type { Prisma, PrismaClient } from "@prisma/client";

type Db = PrismaClient | Prisma.TransactionClient;

/** Hours after the owner's last activity at which reminders 1 to 4 go: +1h, +24h, +3d, +7d. */
export const REMINDER_DELAYS_MS = [1 * 3_600_000, 24 * 3_600_000, 3 * 86_400_000, 7 * 86_400_000] as const;
export const MAX_REMINDERS = REMINDER_DELAYS_MS.length;

/**
 * Pure: which reminder (1 to 4) is due now, or null. A lead gets them in order, one per run, each measured from its last activity. A lead that was
 * away so long that several are overdue gets only the next one in line, never a burst.
 */
export function dueReminder(lead: { remindersSent: number; lastActivityAt: Date | null; convertedAt: Date | null; unsubscribedAt: Date | null }, now: Date): number | null {
  if (lead.convertedAt || lead.unsubscribedAt || !lead.lastActivityAt) return null;
  if (lead.remindersSent >= MAX_REMINDERS) return null;
  const next = lead.remindersSent + 1;
  return now.getTime() - lead.lastActivityAt.getTime() >= REMINDER_DELAYS_MS[next - 1] ? next : null;
}

export async function upsertSignupLead(db: Db, user: { id: string; name: string; email: string }, opts: { phone?: string | null; step: number }, now = new Date()) {
  return db.lead.upsert({
    where: { userId: user.id },
    create: { userId: user.id, name: user.name, email: user.email, phone: opts.phone ?? null, source: "signup", status: "new", onboardingStep: opts.step, lastActivityAt: now },
    update: {},
  });
}

/** The owner saved a step. Progress restarts the reminder clock; a lead that was converted stays converted. */
export async function touchSignupLead(db: Db, user: { id: string; name: string; email: string }, step: number, now = new Date()) {
  const lead = await upsertSignupLead(db, user, { step }, now);
  if (lead.convertedAt) return lead;
  const progressed = step > (lead.onboardingStep ?? 0);
  return db.lead.update({
    where: { id: lead.id },
    data: { onboardingStep: Math.max(step, lead.onboardingStep ?? 0), lastActivityAt: now, ...(progressed ? { remindersSent: 0 } : {}) },
  });
}

/** Onboarding finished: the lead is converted, with the plan the owner picked. */
export async function convertSignupLead(db: Db, user: { id: string; name: string; email: string }, plan: string | null, now = new Date()) {
  const lead = await upsertSignupLead(db, user, { step: 7 }, now);
  return db.lead.update({ where: { id: lead.id }, data: { status: "converted", convertedAt: lead.convertedAt ?? now, onboardingStep: 7, plan: plan ?? lead.plan, lastActivityAt: now } });
}
