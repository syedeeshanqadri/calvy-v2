// Calvy Levels (database side). Rules and the default settings live in ./levels.ts; the settings an admin edits are the LevelConfig row.
//  - onAttended: a visit was marked attended: earn, fast-track, hold, level up (grant the Insider gift, queue the level-up email).
//  - currentLevel / feeForCustomer: what a customer holds now (retention applied) and the confirmation fee that follows, for checkout.
//  - levelView: everything the account page shows, never the exact thresholds.
import type { Prisma } from "@prisma/client";
import type { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { PLAN_LIMITS } from "@/lib/plans";
import { utcToZoned } from "@/lib/time";
import { notify } from "@/lib/notifications/enqueue";
import { identityKey } from "./rules";
import { quarterOf } from "./ladder";
import {
  BAND_TEXT, GIFT_LEVEL, LEVEL_LABEL, boostedLevel, earnedLevel, earnsGift, fastTrackReached, hasQuarterlyPerk, heldLevel, higherLevel, isLevel,
  levelFee, levelIndex, parseLevelConfig, progressToNext, streakMonths, type History, type LevelConfigData, type LevelId,
} from "./levels";

type Db = Prisma.TransactionClient | typeof prisma;

export const CONFIG_ID = "default";
/** India time is Calvy's calendar: days, months and quarters follow it. */
export const istDay = (now: Date): string => utcToZoned(now, "Asia/Kolkata").date;

export async function getLevelConfig(db: Db): Promise<LevelConfigData> {
  try {
    const row = await db.levelConfig.findUnique({ where: { id: CONFIG_ID } });
    return parseLevelConfig(row?.config);
  } catch (err) {
    logger.error("[Levels] could not read the settings", { err });
    return parseLevelConfig(null);
  }
}

export async function loadHistory(db: Db, identity: string): Promise<History> {
  const [rows, referralsAttended] = await Promise.all([
    db.rewardCount.findMany({ where: { identity, kind: "VISIT" }, select: { day: true }, orderBy: { day: "desc" }, take: 800 }),
    db.referral.count({ where: { referrerIdentity: identity, status: { in: ["REWARDED", "CAPPED"] } } }),
  ]);
  return { days: rows.map((r) => r.day), referralsAttended };
}

/** The level this person holds now (retention applied). Starter when they have none. */
export async function currentLevel(db: Db, identity: string, cfg: LevelConfigData, now = new Date()): Promise<LevelId> {
  const row = await db.customerLevel.findUnique({ where: { identity } });
  if (!row || !isLevel(row.level)) return "STARTER";
  return heldLevel(row.level, row.lastAttendedAt, now, cfg.retentionDays);
}

/**
 * The confirmation fee for this person, decided ONCE at checkout (the caller stores it on the booking, so a later level change never alters
 * an existing order). Only for a verified customer and only where Calvy's own fee exists: the caller passes the plan's base fee (0 = none).
 */
export async function feeForCustomer(db: Db, contact: { email?: string | null; phone?: string | null }, baseFeeMinor: number, now = new Date()): Promise<{ level: LevelId; feeMinor: number }> {
  const identity = identityKey(contact);
  if (!identity || baseFeeMinor <= 0) return { level: "STARTER", feeMinor: Math.max(0, baseFeeMinor) };
  try {
    const cfg = await getLevelConfig(db);
    const level = await currentLevel(db, identity, cfg, now);
    return { level, feeMinor: levelFee(level, baseFeeMinor, cfg) };
  } catch (err) {
    logger.error("[Levels] fee lookup failed, using the plan fee", { err });
    return { level: "STARTER", feeMinor: baseFeeMinor };
  }
}

/**
 * A visit was marked attended and its day was newly counted. Works out the earned level from the windows, applies a fast-track boost
 * (once per calendar month, never above the cap), holds the higher of that and what retention still holds, and on a level-up records the
 * celebration, grants the Insider gift once and queues the email. Never throws into the caller.
 */
export async function onAttended(db: Db, p: { identity: string; day: string; offerId: string; now?: Date }): Promise<LevelId | null> {
  const now = p.now ?? new Date();
  try {
    const cfg = await getLevelConfig(db);
    const history = await loadHistory(db, p.identity);
    const before = await currentLevel(db, p.identity, cfg, now);
    let after = higherLevel(before, earnedLevel(history, cfg, p.day));

    // Fast-track: enough attended days this month lifts one level, once a month. The unique (identity, month) row is the cap.
    if (fastTrackReached(history.days, p.day, cfg)) {
      const lifted = boostedLevel(after, cfg);
      if (levelIndex(lifted) > levelIndex(after)) {
        const made = await db.fastTrackBoost.createMany({ data: [{ identity: p.identity, month: p.day.slice(0, 7) }], skipDuplicates: true });
        if (made.count === 1) after = lifted;
      }
    }

    const up = levelIndex(after) > levelIndex(before);
    await db.customerLevel.upsert({
      where: { identity: p.identity },
      create: { identity: p.identity, level: after, lastAttendedAt: now, pendingLevelUp: up ? after : null },
      update: { level: after, lastAttendedAt: now, ...(up ? { levelSince: now, pendingLevelUp: after } : {}) },
    });
    if (!up) return after;

    // Insider and above: one free booking the first time the level is reached (once per person, whichever level they reach it at).
    if (earnsGift(after)) {
      const gift = await db.tierGrant.createMany({ data: [{ identity: p.identity, tier: GIFT_LEVEL }], skipDuplicates: true });
      if (gift.count === 1) {
        await db.rewardProgress.upsert({
          where: { offerId_identity: { offerId: p.offerId, identity: p.identity } },
          create: { offerId: p.offerId, identity: p.identity, counted: 0, earned: 0, bonus: 1 },
          update: { bonus: { increment: 1 } },
        });
      }
    }
    await queueLevelUpEmail(p.identity, after, cfg, now);
    return after;
  } catch (err) {
    logger.error("[Levels] could not update the level", { err, identity: p.identity });
    return null;
  }
}

async function queueLevelUpEmail(identity: string, level: LevelId, cfg: LevelConfigData, now: Date) {
  if (!identity.startsWith("e:")) return; // phone-only customers have no email to send to
  try {
    const base = PLAN_LIMITS.free.platformFeeMinorIN;
    await notify({
      event: "level.up", audience: "CUSTOMER", subjectId: identity, version: `${level}:${istDay(now)}`, recipient: identity.slice(2), template: "level_up",
      payload: { level, levelLabel: LEVEL_LABEL[level], feeMinor: levelFee(level, base, cfg), baseFeeMinor: base, perk: PERK_TEXT[level] ?? null, accountUrl: `${(process.env.NEXT_PUBLIC_APP_URL ?? "https://calvy.io").replace(/\/+$/, "")}/account` },
    });
  } catch (err) {
    logger.error("[Levels] level-up email failed", { err });
  }
}

export const PERK_TEXT: Partial<Record<LevelId, string>> = {
  INSIDER: "One free booking, on us, for reaching Insider.",
  PRO: "One free confirmation every quarter (it ends when the quarter does).",
  LEGEND: "One free confirmation every quarter (it ends when the quarter does).",
};

/** Pro and Legend: this quarter's free Rs 10 is there and not yet used. */
export async function quarterlyPerkReady(db: Db, identity: string, level: LevelId, now = new Date()): Promise<boolean> {
  if (!hasQuarterlyPerk(level)) return false;
  const used = await db.quarterlyPerk.findUnique({ where: { identity_quarter: { identity, quarter: quarterOf(istDay(now)) } } });
  return !used;
}

export interface LevelView {
  level: LevelId;
  label: string;
  /** The confirmation fee this level pays at a Basic (India) business, in minor units. */
  feeMinor: number;
  baseFeeMinor: number;
  streakMonths: number;
  nextLabel: string | null;
  /** 0 to 1 and a plain phrase: the exact requirements are never shown. */
  progressRatio: number;
  progressText: string;
  perk: string | null;
  perkReady: boolean;
  /** A level reached and not yet celebrated. */
  pendingLevelUp: { level: LevelId; label: string } | null;
}

/** The customer's level for the account page. Null when rewards are off or there is no identity (never throws). */
export async function levelView(db: Db, c: { email?: string | null; phone?: string | null }, now = new Date()): Promise<LevelView | null> {
  try {
    const identity = identityKey(c);
    if (!identity) return null;
    const offer = await db.offer.findUnique({ where: { key: "LOYALTY_EVERY_8TH" } });
    if (!offer || !offer.enabled) return null;
    const cfg = await getLevelConfig(db);
    const row = await db.customerLevel.findUnique({ where: { identity } });
    const level = row && isLevel(row.level) ? heldLevel(row.level, row.lastAttendedAt, now, cfg.retentionDays) : "STARTER";
    const history = await loadHistory(db, identity);
    const today = istDay(now);
    const progress = progressToNext(level, history, cfg, today);
    const base = PLAN_LIMITS.free.platformFeeMinorIN;
    return {
      level, label: LEVEL_LABEL[level], feeMinor: levelFee(level, base, cfg), baseFeeMinor: base, streakMonths: streakMonths(history.days, today),
      nextLabel: progress.next ? LEVEL_LABEL[progress.next] : null, progressRatio: progress.ratio, progressText: BAND_TEXT[progress.band],
      perk: PERK_TEXT[level] ?? null, perkReady: await quarterlyPerkReady(db, identity, level, now),
      pendingLevelUp: row?.pendingLevelUp && isLevel(row.pendingLevelUp) ? { level: row.pendingLevelUp, label: LEVEL_LABEL[row.pendingLevelUp] } : null,
    };
  } catch (err) {
    logger.error("[Levels] view failed", { err });
    return null;
  }
}

/** The level-up screen was shown. */
export async function markLevelUpSeen(db: Db, c: { email?: string | null; phone?: string | null }): Promise<void> {
  const identity = identityKey(c);
  if (identity) await db.customerLevel.updateMany({ where: { identity }, data: { pendingLevelUp: null } });
}

/** Admin: set a person's level by hand. Retention starts from now. Returns what it was and is, for the audit entry. */
export async function adjustLevel(db: Db, identity: string, level: LevelId, now = new Date()): Promise<{ before: LevelId; after: LevelId }> {
  const cfg = await getLevelConfig(db);
  const before = await currentLevel(db, identity, cfg, now);
  await db.customerLevel.upsert({
    where: { identity },
    create: { identity, level, lastAttendedAt: now },
    update: { level, lastAttendedAt: now, ...(level !== before ? { levelSince: now } : {}), pendingLevelUp: null },
  });
  return { before, after: level };
}

/** Admin lookup of one person by email or phone. */
export async function lookupLevel(db: Db, q: string, now = new Date()) {
  const identity = q.includes("@") ? identityKey({ email: q }) : identityKey({ phone: q });
  if (!identity) return null;
  const cfg = await getLevelConfig(db);
  const row = await db.customerLevel.findUnique({ where: { identity } });
  const history = await loadHistory(db, identity);
  const level = row && isLevel(row.level) ? heldLevel(row.level, row.lastAttendedAt, now, cfg.retentionDays) : "STARTER";
  return {
    identity, level, storedLevel: row?.level ?? "STARTER", lastAttendedAt: row?.lastAttendedAt ?? null, levelSince: row?.levelSince ?? null,
    attendedDays90: history.days.filter((d) => d >= istDay(new Date(now.getTime() - 90 * 86_400_000))).length, attendedDaysTotal: history.days.length,
    referralsAttended: history.referralsAttended, streakMonths: streakMonths(history.days, istDay(now)),
    feeMinor: levelFee(level, PLAN_LIMITS.free.platformFeeMinorIN, cfg),
  };
}
