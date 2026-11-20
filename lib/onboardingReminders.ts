// Reminders to owners who stopped during onboarding: +1h, +24h, +3d and +7d after their last activity (lib/leads.ts decides when). Each email carries a
// one-click resume link (a single-use magic link that signs them in and opens onboarding where they stopped) and a stop link. Plain wording, from the
// transactional sender. They stop when onboarding completes or the owner unsubscribes, and each send is recorded on the lead.
import type { Prisma, PrismaClient } from "@prisma/client";
import { logger } from "@/lib/logger";
import { notify } from "@/lib/notifications/enqueue";
import { onboardingReminderEmail } from "@/lib/notifications/events";
import { sign, verifySignature } from "@/lib/notifications/secret";
import { issueOwnerLoginToken } from "@/lib/ownerLogin";
import { dueReminder, MAX_REMINDERS } from "@/lib/leads";

type Db = PrismaClient | Prisma.TransactionClient;
const PURPOSE = "onboarding-unsubscribe";
const appUrl = () => (process.env.NEXT_PUBLIC_APP_URL ?? "https://calvy.io").replace(/\/+$/, "");

export const leadUnsubscribeSignature = (leadId: string) => sign(PURPOSE, leadId);
export const isValidLeadUnsubscribe = (leadId: string, signature: string) => verifySignature(PURPOSE, leadId, signature);
/** `page` is the footer link; `oneClick` is the List-Unsubscribe URL mail apps POST to. */
export function leadUnsubscribeLinks(leadId: string): { page: string; oneClick: string } {
  const q = new URLSearchParams({ l: leadId, s: leadUnsubscribeSignature(leadId) }).toString();
  return { page: `${appUrl()}/unsubscribe/onboarding?${q}`, oneClick: `${appUrl()}/api/unsubscribe/onboarding?${q}` };
}

const BATCH = 100;

/** Queue every reminder that is due. Safe to run every couple of minutes: a reminder is counted on the lead before it is queued, and the queue ignores repeats. */
export async function queueOnboardingReminders(db: Db, now = new Date()): Promise<{ queued: number; converted: number }> {
  const leads = await db.lead.findMany({
    where: { source: "signup", userId: { not: null }, convertedAt: null, unsubscribedAt: null, remindersSent: { lt: MAX_REMINDERS }, lastActivityAt: { not: null } },
    orderBy: { lastActivityAt: "asc" },
    take: BATCH,
  });
  let queued = 0, converted = 0;
  for (const lead of leads) {
    const n = dueReminder(lead, now);
    if (!n || !lead.userId) continue;
    const owner = await db.user.findUnique({ where: { id: lead.userId }, select: { id: true, name: true, email: true, business: { select: { onboardingCompletedAt: true, onboardingStep: true } } } });
    // The owner is gone, or finished onboarding some other way: close the lead instead of nagging.
    if (!owner || !owner.business || owner.business.onboardingCompletedAt) {
      if (owner?.business?.onboardingCompletedAt) { await db.lead.update({ where: { id: lead.id }, data: { status: "converted", convertedAt: now } }); converted++; }
      continue;
    }
    try {
      // Claim the slot first (conditional on the count we read), so two runs cannot both send reminder n.
      const claimed = await db.lead.updateMany({ where: { id: lead.id, remindersSent: lead.remindersSent }, data: { remindersSent: n, lastReminderAt: now } });
      if (claimed.count !== 1) continue;
      const token = await issueOwnerLoginToken(db, owner.id, "resume", owner.business.onboardingStep, now);
      await notify(onboardingReminderEmail({ leadId: lead.id, to: owner.email, name: owner.name, n, token, activityAt: lead.lastActivityAt as Date }));
      queued++;
    } catch (err) {
      logger.error("[onboarding-reminders] could not queue", { err, leadId: lead.id });
    }
  }
  return { queued, converted };
}

/** At send time: false means skip it (the lead converted or unsubscribed since it was queued). */
export async function reminderStillWanted(db: Db, leadId: string): Promise<string | null> {
  const lead = await db.lead.findUnique({ where: { id: leadId }, select: { convertedAt: true, unsubscribedAt: true } });
  if (!lead) return "lead gone";
  if (lead.unsubscribedAt) return "unsubscribed";
  if (lead.convertedAt) return "onboarding complete";
  return null;
}

/** A reminder really went out: write it on the lead, where the team reads it. */
export async function recordReminderSent(db: Db, leadId: string, n: number, at = new Date()): Promise<void> {
  const lead = await db.lead.findUnique({ where: { id: leadId }, select: { notes: true } });
  if (!lead) return;
  const line = `[auto] Onboarding reminder ${n} of ${MAX_REMINDERS} emailed ${at.toISOString().slice(0, 16).replace("T", " ")} UTC`;
  await db.lead.update({ where: { id: leadId }, data: { notes: lead.notes ? `${lead.notes}\n${line}` : line } });
}
