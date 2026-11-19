// Rewards engine (database side). Rules live in ./rules.ts.
//  - recordAttended: a booking became "completed": count its (business-local) day once for the person, earn a reward every `every` days.
//  - claimReward / releaseReward: spend one on a booking inside its transaction; give it back when the booking is cancelled.
// Nothing here touches money: the booking route turns an available reward into a zero Rs 10 charge.
import { Prisma } from "@prisma/client";
import type { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { safeTimeZone, utcToZoned } from "@/lib/time";
import { LOYALTY_KEY, countsTowardReward, earnedFor, identityKey, progressView, type ProgressView, type Tally } from "./rules";
import { hasQuarterlyPerk, isComeback, nextTier, quarterOf, tierFor, hasFreeReschedule, TIERS, type TierId } from "./ladder";
import { qualifyReferral } from "./referrals";

type Db = Prisma.TransactionClient | typeof prisma;

export async function loyaltyOffer(db: Db) {
  return db.offer.findUnique({ where: { key: LOYALTY_KEY } });
}

/**
 * The booking was marked completed. Counts its day once for this person; safe to call again (same booking, or another booking
 * the same day: the unique day row stops a second count). Returns true when it counted a new day.
 */
export async function recordAttended(db: Db, appointmentId: string): Promise<boolean> {
  const appt = await db.appointment.findUnique({
    where: { id: appointmentId },
    select: { id: true, status: true, source: true, date: true, client: { select: { email: true, phone: true } }, business: { select: { timezone: true } } },
  });
  if (!appt || !countsTowardReward(appt)) return false;
  const identity = identityKey(appt.client);
  if (!identity) return false;
  const offer = await loyaltyOffer(db);
  if (!offer || !offer.enabled) return false;
  const day = utcToZoned(appt.date, safeTimeZone(appt.business.timezone)).date;

  // skipDuplicates (ON CONFLICT DO NOTHING): a repeat never raises, so this is safe inside a booking/queue transaction too.
  const made = await db.rewardCount.createMany({ data: [{ offerId: offer.id, identity, day, kind: "VISIT", appointmentId }], skipDuplicates: true });
  if (made.count !== 1) return false;
  // Comeback: attending within 30 days of the previous attended day earns one extra stamp (once per day, attended days only).
  const previous = await db.rewardCount.findFirst({ where: { offerId: offer.id, identity, kind: "VISIT", day: { lt: day } }, orderBy: { day: "desc" }, select: { day: true } });
  let stamps = 1;
  if (isComeback(previous?.day ?? null, day)) {
    const bonus = await db.rewardCount.createMany({ data: [{ offerId: offer.id, identity, day: `${day}~comeback`, kind: "COMEBACK", appointmentId }], skipDuplicates: true });
    if (bonus.count === 1) stamps = 2;
  }
  // Increment first (atomic), then derive `earned` from the stored count, so two days counted at once cannot lose a reward.
  const key = { offerId_identity: { offerId: offer.id, identity } };
  const row = await db.rewardProgress.upsert({ where: key, create: { offerId: offer.id, identity, counted: stamps, earned: earnedFor(stamps, offer.every) }, update: { counted: { increment: stamps } } });
  const earned = earnedFor(row.counted, offer.every);
  if (earned !== row.earned) await db.rewardProgress.update({ where: { id: row.id }, data: { earned } });
  // A referred friend's FIRST attended visit pays out the referral (both get a free Rs 10). Never lets a failure undo the count.
  if ((await db.rewardCount.count({ where: { offerId: offer.id, identity, kind: "VISIT" } })) === 1) {
    try { await qualifyReferral(db, offer.id, identity); } catch (err) { logger.error("[Rewards] referral payout failed", { err }); }
  }
  return true;
}

async function tallyOf(db: Db, offerId: string, identity: string): Promise<Tally> {
  const p = await db.rewardProgress.findUnique({ where: { offerId_identity: { offerId, identity } } });
  return { counted: p?.counted ?? 0, earned: p?.earned ?? 0, used: p?.used ?? 0, bonus: p?.bonus ?? 0 };
}

/**
 * The person's progress for the loyalty offer, or null when the offer is off, there is no identity, or the lookup fails:
 * rewards are a bonus and must never stop a booking or its confirmation email.
 */
export async function progressFor(db: Db, c: { email?: string | null; phone?: string | null }): Promise<ProgressView | null> {
  try {
    const identity = identityKey(c);
    const offer = await loyaltyOffer(db);
    if (!identity || !offer || !offer.enabled) return null;
    const t = await tallyOf(db, offer.id, identity);
    const view = progressView(t, offer.every);
    // Gold's quarterly Rs 10 counts as one more free confirmation while it is unused this quarter.
    return (await perkReady(db, identity, t.counted)) ? { ...view, available: view.available + 1 } : view;
  } catch (err) {
    logger.error("[Rewards] progress lookup failed", { err });
    return null;
  }
}

export async function rewardAvailable(db: Db, c: { email?: string | null; phone?: string | null }): Promise<boolean> {
  return ((await progressFor(db, c))?.available ?? 0) > 0;
}

/** Calvy runs on India time: the quarter (and so Gold's perk) changes at midnight IST on 1 Jan, Apr, Jul and Oct. */
function currentQuarter(now = new Date()): string {
  return quarterOf(utcToZoned(now, "Asia/Kolkata").date);
}

/** Gold, and the perk is not yet used this quarter. */
async function perkReady(db: Db, identity: string, counted: number): Promise<boolean> {
  if (!hasQuarterlyPerk(tierFor(counted))) return false;
  const used = await db.quarterlyPerk.findUnique({ where: { identity_quarter: { identity, quarter: currentQuarter() } } });
  return !used;
}

export interface LadderView {
  tier: TierId;
  label: string;
  attendedDays: number;
  next: { label: string; daysNeeded: number } | null;
  perks: string[];
  freeReschedule: boolean;
  perkReady: boolean;
}

/** The customer's tier and what it gives, for the account page. Null when rewards are off or there is no identity (never throws). */
export async function ladderFor(db: Db, c: { email?: string | null; phone?: string | null }): Promise<LadderView | null> {
  try {
    const identity = identityKey(c);
    const offer = await loyaltyOffer(db);
    if (!identity || !offer || !offer.enabled) return null;
    const t = await tallyOf(db, offer.id, identity);
    const tier = tierFor(t.counted);
    const n = nextTier(t.counted);
    return {
      tier, label: tier === "NONE" ? "Not yet" : (TIERS.find((x) => x.id === tier)?.label ?? ""), attendedDays: t.counted,
      next: n ? { label: n.label, daysNeeded: n.daysNeeded } : null,
      perks: TIERS.find((x) => x.id === tier)?.perks ?? [], freeReschedule: hasFreeReschedule(tier), perkReady: await perkReady(db, identity, t.counted),
    };
  } catch (err) {
    logger.error("[Rewards] ladder lookup failed", { err });
    return null;
  }
}

/**
 * Spend one reward on a new booking (inside its transaction). The conditional update makes two parallel bookings unable to
 * spend the same one. Returns true when this booking got it.
 */
export async function claimReward(tx: Prisma.TransactionClient, p: { appointmentId: string; email?: string | null; phone?: string | null }): Promise<boolean> {
  const identity = identityKey(p);
  const offer = await loyaltyOffer(tx);
  if (!identity || !offer || !offer.enabled) return false;
  const cur = await tx.rewardProgress.findUnique({ where: { offerId_identity: { offerId: offer.id, identity } } });
  // Gold's quarterly perk goes first: it expires at quarter end, the stamp rewards never do. ON CONFLICT DO NOTHING keeps the transaction healthy.
  if (cur && hasQuarterlyPerk(tierFor(cur.counted))) {
    const got = await tx.quarterlyPerk.createMany({ data: [{ identity, quarter: currentQuarter(), appointmentId: p.appointmentId }], skipDuplicates: true });
    if (got.count === 1) return true;
  }
  if (!cur || cur.earned + cur.bonus - cur.used <= 0) return false;
  const claimed = await tx.rewardProgress.updateMany({ where: { id: cur.id, used: cur.used }, data: { used: { increment: 1 } } });
  if (claimed.count !== 1) return false;
  await tx.rewardRedemption.create({ data: { offerId: offer.id, identity, appointmentId: p.appointmentId } });
  return true;
}

/** The booking that used a reward is cancelled: the reward goes back. Safe to call twice. */
export async function releaseReward(tx: Prisma.TransactionClient, appointmentId: string): Promise<void> {
  await tx.quarterlyPerk.deleteMany({ where: { appointmentId } });
  const r = await tx.rewardRedemption.findUnique({ where: { appointmentId } });
  if (!r) return;
  const gone = await tx.rewardRedemption.deleteMany({ where: { id: r.id } });
  if (gone.count !== 1) return;
  await tx.rewardProgress.updateMany({ where: { offerId: r.offerId, identity: r.identity, used: { gt: 0 } }, data: { used: { decrement: 1 } } });
}

export class RewardTakenError extends Error {
  constructor() { super("Your free booking was just used. Please try again."); this.name = "RewardTakenError"; }
}

/** Admin lookup: one person's progress by email or phone. */
export async function lookupProgress(db: Db, q: string) {
  const identity = q.includes("@") ? identityKey({ email: q }) : identityKey({ phone: q });
  const offer = await loyaltyOffer(db);
  if (!identity || !offer) return null;
  const t = await tallyOf(db, offer.id, identity);
  const [days, redemptions] = await Promise.all([
    db.rewardCount.findMany({ where: { offerId: offer.id, identity }, orderBy: { day: "desc" }, take: 20, select: { day: true } }),
    db.rewardRedemption.count({ where: { offerId: offer.id, identity } }),
  ]);
  return { identity, offer: { key: offer.key, enabled: offer.enabled, every: offer.every }, ...t, view: progressView(t, offer.every), recentDays: days.map((d) => d.day), openRedemptions: redemptions };
}
