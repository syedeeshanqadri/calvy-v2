// Referrals (database side). Rules live in ./ladder.ts. A friend is referred at their FIRST booking; the reward is only granted when that
// friend's first visit is ATTENDED (marked completed). Nothing here ever blocks a booking: callers catch and log.
import { randomInt } from "node:crypto";
import type { Prisma } from "@prisma/client";
import type { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { hasPriorBooking } from "@/lib/coupons/service";
import { CODE_ALPHABET, REFERRAL_CODE_LENGTH, capReached, isReferralCode, monthOf, needsReview, referralBlock, type ReferralBlock } from "./ladder";
import { identityKey } from "./rules";

type Db = Prisma.TransactionClient | typeof prisma;

function newCode(): string {
  let s = "";
  for (let i = 0; i < REFERRAL_CODE_LENGTH; i++) s += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return s;
}

/** This person's referral code, made on first ask (one per identity). Null when they have no usable identity. */
export async function ensureReferralCode(db: Db, c: { email?: string | null; phone?: string | null }): Promise<string | null> {
  const identity = identityKey(c);
  if (!identity) return null;
  const have = await db.referralCode.findUnique({ where: { identity } });
  if (have) return have.code;
  for (let i = 0; i < 5; i++) {
    const code = newCode();
    const made = await db.referralCode.createMany({ data: [{ identity, code }], skipDuplicates: true });
    if (made.count === 1) return code;
    const again = await db.referralCode.findUnique({ where: { identity } });
    if (again) return again.code;
  }
  return null;
}

export async function recordDevice(db: Db, identity: string, hash: string | null): Promise<void> {
  if (!hash) return;
  await db.deviceSeen.createMany({ data: [{ identity, deviceHash: hash }], skipDuplicates: true });
}

export type RegisterResult = "registered" | ReferralBlock | "UNKNOWN_CODE" | "ALREADY_REFERRED" | "OFF" | "NO_IDENTITY";

async function partyOf(db: Db, identity: string) {
  const emails: string[] = [];
  const phones: string[] = [];
  if (identity.startsWith("e:")) {
    const email = identity.slice(2);
    emails.push(email);
    const rows = await db.client.findMany({ where: { email: { equals: email, mode: "insensitive" } }, select: { phone: true }, take: 50 });
    for (const r of rows) if (r.phone) phones.push(r.phone);
  } else {
    const digits = identity.slice(2);
    phones.push(digits);
    const rows = await db.client.findMany({ where: { phone: { in: [`+${digits}`, digits] } }, select: { email: true }, take: 50 });
    for (const r of rows) if (r.email) emails.push(r.email.toLowerCase());
  }
  return { identity, emails, phones };
}

/** Who referred `identity`, and who referred them, and so on (a few levels), to spot a loop. */
async function chainAbove(db: Db, identity: string): Promise<string[]> {
  const out: string[] = [];
  let cur = identity;
  for (let depth = 0; depth < 6; depth++) {
    const r = await db.referral.findUnique({ where: { referredIdentity: cur } });
    if (!r || r.status === "REJECTED") break;
    out.push(r.referrerIdentity);
    cur = r.referrerIdentity;
  }
  return out;
}

/**
 * Called after a booking succeeded (never before, never blocking it). Records the booker's device, and, when they came with a referral
 * code, registers the referral as PENDING or REJECTED (with the reason, so an admin can see attempts).
 */
export async function afterBooking(db: Db, p: { appointmentId: string; referralCode?: string | null; deviceHash: string | null }): Promise<RegisterResult | null> {
  const appt = await db.appointment.findUnique({ where: { id: p.appointmentId }, select: { id: true, client: { select: { email: true, phone: true } }, business: { select: { timezone: true } } } });
  if (!appt) return null;
  const referredIdentity = identityKey(appt.client);
  if (!referredIdentity) return "NO_IDENTITY";
  await recordDevice(db, referredIdentity, p.deviceHash);
  const code = (p.referralCode ?? "").trim().toUpperCase();
  if (!code || !isReferralCode(code)) return null;

  const offer = await db.offer.findUnique({ where: { key: "LOYALTY_EVERY_8TH" } });
  if (!offer || !offer.enabled) return "OFF";
  const ref = await db.referralCode.findUnique({ where: { code } });
  if (!ref) return "UNKNOWN_CODE";
  if (await db.referral.findUnique({ where: { referredIdentity } })) return "ALREADY_REFERRED";

  const referrer = await partyOf(db, ref.identity);
  const devices = (await db.deviceSeen.findMany({ where: { identity: ref.identity }, select: { deviceHash: true }, take: 200 })).map((d) => d.deviceHash);
  const block = referralBlock({
    referrer, referred: { identity: referredIdentity, email: appt.client.email, phone: appt.client.phone }, referredDevice: p.deviceHash, referrerDevices: devices,
    chain: await chainAbove(db, ref.identity),
    hadPriorBooking: await hasPriorBooking(db, { email: appt.client.email, phone: appt.client.phone, tz: appt.business.timezone, excludeAppointmentId: appt.id }),
  });
  const made = await db.referral.createMany({
    data: [{ referrerIdentity: ref.identity, referredIdentity, appointmentId: appt.id, status: block ? "REJECTED" : "PENDING", reason: block }],
    skipDuplicates: true,
  });
  if (made.count !== 1) return "ALREADY_REFERRED";
  return block ?? "registered";
}

async function grantBonus(db: Db, offerId: string, identity: string) {
  await db.rewardProgress.upsert({
    where: { offerId_identity: { offerId, identity } },
    create: { offerId, identity, counted: 0, earned: 0, bonus: 1 },
    update: { bonus: { increment: 1 } },
  });
}

/**
 * The referred person just had their first attended visit. Rewards BOTH a free Rs 10, unless the referrer already has 5 rewarded referrals
 * this month (then it is CAPPED, kept for the record). Runs in a transaction under a per-referrer lock so two friends qualifying at
 * once cannot both take the last slot, and the PENDING -> REWARDED switch is conditional so the reward is paid once.
 */
export async function qualifyReferral(db: Db, offerId: string, referredIdentity: string, now = new Date()): Promise<"rewarded" | "capped" | "none"> {
  const ref = await db.referral.findUnique({ where: { referredIdentity } });
  if (!ref || ref.status !== "PENDING") return "none";
  const work = async (tx: Prisma.TransactionClient): Promise<"rewarded" | "capped" | "none"> => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`referrer:${ref.referrerIdentity}`}, 0))`;
    const start = new Date(`${monthOf(now)}-01T00:00:00Z`);
    const rewarded = await tx.referral.count({ where: { referrerIdentity: ref.referrerIdentity, status: "REWARDED", qualifiedAt: { gte: start } } });
    if (capReached(rewarded)) {
      const c = await tx.referral.updateMany({ where: { id: ref.id, status: "PENDING" }, data: { status: "CAPPED", reason: "MONTHLY_CAP", qualifiedAt: now } });
      return c.count === 1 ? "capped" : "none";
    }
    const won = await tx.referral.updateMany({ where: { id: ref.id, status: "PENDING" }, data: { status: "REWARDED", qualifiedAt: now } });
    if (won.count !== 1) return "none";
    await grantBonus(tx, offerId, ref.referrerIdentity);
    await grantBonus(tx, offerId, referredIdentity);
    return "rewarded";
  };
  const anyDb = db as unknown as { $transaction?: (fn: (tx: Prisma.TransactionClient) => Promise<"rewarded" | "capped" | "none">) => Promise<"rewarded" | "capped" | "none"> };
  try {
    return anyDb.$transaction ? await anyDb.$transaction(work) : await work(db as Prisma.TransactionClient);
  } catch (err) {
    logger.error("[Referral] could not qualify", { err, referredIdentity });
    return "none";
  }
}

export interface ReferralAdminView {
  month: string;
  flagged: { referrer: string; attempts: number; rewarded: number; rejected: number }[];
  recent: { id: string; referrer: string; referred: string; status: string; reason: string | null; createdAt: Date }[];
}

/** For /admin/referrals: referrers with more than 5 attempts this month, and the latest referrals. Identities are shown as stored (email or phone). */
export async function referralAdminView(db: Db, now = new Date()): Promise<ReferralAdminView> {
  const start = new Date(`${monthOf(now)}-01T00:00:00Z`);
  const rows = await db.referral.findMany({ where: { createdAt: { gte: start } }, select: { referrerIdentity: true, status: true }, take: 5000 });
  const by = new Map<string, { attempts: number; rewarded: number; rejected: number }>();
  for (const r of rows) {
    const e = by.get(r.referrerIdentity) ?? { attempts: 0, rewarded: 0, rejected: 0 };
    e.attempts++;
    if (r.status === "REWARDED") e.rewarded++;
    if (r.status === "REJECTED") e.rejected++;
    by.set(r.referrerIdentity, e);
  }
  const flagged = [...by.entries()].filter(([, v]) => needsReview(v.attempts)).map(([referrer, v]) => ({ referrer: referrer.slice(2), ...v })).sort((a, b) => b.attempts - a.attempts);
  const recent = (await db.referral.findMany({ orderBy: { createdAt: "desc" }, take: 50 })).map((r) => ({ id: r.id, referrer: r.referrerIdentity.slice(2), referred: r.referredIdentity.slice(2), status: r.status, reason: r.reason, createdAt: r.createdAt }));
  return { month: monthOf(now), flagged, recent };
}
