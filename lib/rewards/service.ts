// Rewards engine (database side). Rules live in ./rules.ts.
//  - recordAttended: a booking became "completed": count its (business-local) day once for the person, earn a reward every `every` days.
//  - claimReward / releaseReward: spend one on a booking inside its transaction; give it back when the booking is cancelled.
// Nothing here touches money: the booking route turns an available reward into a zero Rs 10 charge.
import { Prisma } from "@prisma/client";
import type { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { safeTimeZone, utcToZoned } from "@/lib/time";
import { LOYALTY_KEY, countsTowardReward, earnedFor, identityKey, progressView, type ProgressView, type Tally } from "./rules";

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
  const made = await db.rewardCount.createMany({ data: [{ offerId: offer.id, identity, day, appointmentId }], skipDuplicates: true });
  if (made.count !== 1) return false;
  // Increment first (atomic), then derive `earned` from the stored count, so two days counted at once cannot lose a reward.
  const key = { offerId_identity: { offerId: offer.id, identity } };
  const row = await db.rewardProgress.upsert({ where: key, create: { offerId: offer.id, identity, counted: 1, earned: earnedFor(1, offer.every) }, update: { counted: { increment: 1 } } });
  const earned = earnedFor(row.counted, offer.every);
  if (earned !== row.earned) await db.rewardProgress.update({ where: { id: row.id }, data: { earned } });
  return true;
}

async function tallyOf(db: Db, offerId: string, identity: string): Promise<Tally> {
  const p = await db.rewardProgress.findUnique({ where: { offerId_identity: { offerId, identity } } });
  return { counted: p?.counted ?? 0, earned: p?.earned ?? 0, used: p?.used ?? 0 };
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
    return progressView(await tallyOf(db, offer.id, identity), offer.every);
  } catch (err) {
    logger.error("[Rewards] progress lookup failed", { err });
    return null;
  }
}

export async function rewardAvailable(db: Db, c: { email?: string | null; phone?: string | null }): Promise<boolean> {
  return ((await progressFor(db, c))?.available ?? 0) > 0;
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
  if (!cur || cur.earned - cur.used <= 0) return false;
  const claimed = await tx.rewardProgress.updateMany({ where: { id: cur.id, used: cur.used }, data: { used: { increment: 1 } } });
  if (claimed.count !== 1) return false;
  await tx.rewardRedemption.create({ data: { offerId: offer.id, identity, appointmentId: p.appointmentId } });
  return true;
}

/** The booking that used a reward is cancelled: the reward goes back. Safe to call twice. */
export async function releaseReward(tx: Prisma.TransactionClient, appointmentId: string): Promise<void> {
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
