// Customer account deletion: ask, wait 30 days (and be able to cancel), then the person is anonymised.
//  - Blocked while the customer has upcoming bookings (confirmed or pending, in the future), at the request AND again at processing.
//  - Anonymising keeps the business-side records (date, service, amount, receipt) and the rewards history, but cuts every link to the person:
//    name -> "Deleted customer"; email, phone, login, Google link, sessions, tokens, referral codes, devices and message addresses are removed;
//    the rewards identities ("e:<email>", "p:<phone>") become an anonymised id that nothing can be traced back from.
//  - Business owner accounts are not touched by any of this.
import type { Prisma } from "@prisma/client";
import type { prisma } from "@/lib/prisma";
import { generateToken, hashToken } from "@/lib/auth-tokens";
import { tryNormalizeEmail } from "@/lib/email-normalize";
import { logger } from "@/lib/logger";

type Db = Prisma.TransactionClient | typeof prisma;

export const GRACE_DAYS = 30;
export const ANON_NAME = "Deleted customer";
export const executeAfterFrom = (now: Date): Date => new Date(now.getTime() + GRACE_DAYS * 86_400_000);
/** Statuses that count as "still coming up": a booking that is live and in the future. */
export const UPCOMING_STATUSES = ["confirmed", "pending", "pending_payment"] as const;

export interface UpcomingBooking { id: string; businessName: string; date: Date }

/** Live bookings still ahead for this email, at any business. Held (unpaid, lapsed) ones do not count. */
export async function upcomingBookings(db: Db, emailInput: string, now = new Date()): Promise<UpcomingBooking[]> {
  const email = tryNormalizeEmail(emailInput);
  if (!email) return [];
  const rows = await db.appointment.findMany({
    where: {
      date: { gte: now }, status: { in: [...UPCOMING_STATUSES] },
      NOT: { status: "pending_payment", holdExpiresAt: { lte: now } },
      client: { email: { equals: email, mode: "insensitive" } },
    },
    select: { id: true, date: true, business: { select: { name: true } } },
    orderBy: { date: "asc" },
    take: 20,
  });
  return rows.map((r) => ({ id: r.id, businessName: r.business.name, date: r.date }));
}

export type RequestResult =
  | { ok: true; executeAfter: Date; token: string }
  | { ok: false; reason: "UPCOMING"; bookings: UpcomingBooking[] }
  | { ok: false; reason: "PENDING"; executeAfter: Date }
  | { ok: false; reason: "GONE" };

/** Start the 30 days. Refused while bookings are upcoming; asking twice returns the existing date (no new token, no second email). */
export async function requestDeletion(db: Db, customerId: string, now = new Date()): Promise<RequestResult> {
  const c = await db.customer.findUnique({ where: { id: customerId }, select: { id: true, email: true, anonymisedAt: true } });
  if (!c || c.anonymisedAt) return { ok: false, reason: "GONE" };
  const existing = await db.customerDeletionRequest.findUnique({ where: { customerId } });
  if (existing?.status === "PENDING") return { ok: false, reason: "PENDING", executeAfter: existing.executeAfter };
  const bookings = await upcomingBookings(db, c.email, now);
  if (bookings.length > 0) return { ok: false, reason: "UPCOMING", bookings };
  const token = generateToken();
  const executeAfter = executeAfterFrom(now);
  const data = { status: "PENDING", requestedAt: now, executeAfter, cancelTokenHash: hashToken(token), processedAt: null, processedBy: null, reason: null };
  await db.customerDeletionRequest.upsert({ where: { customerId }, create: { customerId, ...data }, update: data });
  return { ok: true, executeAfter, token };
}

/** Cancel by the customer (signed in) or by the emailed link (token). Only a PENDING request can be cancelled. */
export async function cancelDeletion(db: Db, who: { customerId: string } | { token: string }, by: string, reason: string | null = null, now = new Date()): Promise<boolean> {
  const where = "token" in who
    ? (/^[a-f0-9]{64}$/.test(who.token) ? { cancelTokenHash: hashToken(who.token), status: "PENDING" } : null)
    : { customerId: who.customerId, status: "PENDING" };
  if (!where) return false;
  const done = await db.customerDeletionRequest.updateMany({ where, data: { status: "CANCELLED", cancelTokenHash: null, processedAt: now, processedBy: by, reason } });
  return done.count === 1;
}

const digits = (s: string) => s.replace(/\D/g, "");

export type AnonymiseResult = "done" | "blocked" | "missing" | "already";

/**
 * Anonymise one customer, inside the caller's transaction. Safe to run twice (the second is "already"). Refuses ("blocked") when the person
 * has upcoming bookings again, so nobody with a booking ahead is cut off from it.
 */
export async function anonymiseCustomer(tx: Prisma.TransactionClient, customerId: string, by: string, now = new Date()): Promise<AnonymiseResult> {
  const c = await tx.customer.findUnique({ where: { id: customerId }, select: { id: true, name: true, email: true, anonymisedAt: true } });
  if (!c) return "missing";
  if (c.anonymisedAt) return "already";
  if ((await upcomingBookings(tx, c.email, now)).length > 0) return "blocked";

  const email = c.email.toLowerCase();
  const clients = await tx.client.findMany({ where: { email: { equals: email, mode: "insensitive" } }, select: { id: true, name: true, phone: true } });
  const phones = [...new Set(clients.map((x) => x.phone).filter((p): p is string => !!p))];

  // Rewards identities -> one anonymised id (the customer's own id, which no longer links to any contact detail). Phone identities get a suffix
  // so two rows for the same offer can never collide.
  const map: [string, string][] = [[`e:${email}`, `a:${c.id}`], ...[...new Set(phones.map(digits))].filter((d) => d.length >= 7).map((d, i): [string, string] => [`p:${d}`, `a:${c.id}-p${i + 1}`])];
  for (const [from, to] of map) {
    const w = { identity: from }, d = { identity: to };
    await tx.rewardProgress.updateMany({ where: w, data: d });
    await tx.rewardCount.updateMany({ where: w, data: d });
    await tx.rewardRedemption.updateMany({ where: w, data: d });
    await tx.couponRedemption.updateMany({ where: w, data: d });
    await tx.tierGrant.updateMany({ where: w, data: d });
    await tx.quarterlyPerk.updateMany({ where: w, data: d });
    await tx.fastTrackBoost.updateMany({ where: w, data: d });
    await tx.customerLevel.updateMany({ where: w, data: d });
    await tx.referral.updateMany({ where: { referrerIdentity: from }, data: { referrerIdentity: to } });
    await tx.referral.updateMany({ where: { referredIdentity: from }, data: { referredIdentity: to } });
    // A referral code and the devices seen are only useful to find the person again: removed, not kept.
    await tx.referralCode.deleteMany({ where: w });
    await tx.deviceSeen.deleteMany({ where: w });
  }

  // The business's own client records keep their bookings (date, service, amount, receipt) but lose the person.
  if (clients.length > 0) {
    for (const cl of clients) {
      await tx.appointment.updateMany({ where: { clientId: cl.id, patientName: { equals: cl.name, mode: "insensitive" } }, data: { patientName: ANON_NAME } });
    }
    await tx.client.updateMany({
      where: { id: { in: clients.map((x) => x.id) } },
      data: { name: ANON_NAME, email: null, phone: null, notes: null, whatsappConsent: false, whatsappConsentAt: null, whatsappConsentSource: null, whatsappConsentBy: null },
    });
  }

  // Messages: the address is wiped from the delivery log and opt-out lists (nothing in them can reach the person again).
  await tx.notificationOutbox.updateMany({ where: { audience: "CUSTOMER", recipient: { in: [email, ...phones] } }, data: { recipient: "deleted", payload: {}, secret: null } });
  await tx.emailLog.updateMany({ where: { to: { equals: email, mode: "insensitive" } }, data: { to: "deleted" } });
  await tx.notificationOptOut.deleteMany({ where: { recipient: email } });
  if (phones.length > 0) await tx.whatsAppOptOut.deleteMany({ where: { phone: { in: phones } } });

  // The login. Customers have no push subscriptions (those belong to business users); sessions end because passwordChangedAt moves, and the
  // remembered-device cookie can no longer match any email.
  await tx.customerToken.deleteMany({ where: { customerId: c.id } });
  await tx.customer.update({
    where: { id: c.id },
    data: { name: ANON_NAME, email: `deleted-${c.id}@deleted.invalid`, password: null, googleId: null, emailVerified: null, anonymisedAt: now, passwordChangedAt: now },
  });
  await tx.customerDeletionRequest.updateMany({ where: { customerId: c.id }, data: { status: "DONE", cancelTokenHash: null, processedAt: now, processedBy: by } });
  return "done";
}

/** The nightly job: anonymise every request whose 30 days are up. One failing person never stops the rest. */
export async function processDueDeletions(db: typeof prisma, now = new Date()): Promise<{ processed: number; blocked: number; failed: number }> {
  const due = await db.customerDeletionRequest.findMany({ where: { status: "PENDING", executeAfter: { lte: now } }, select: { customerId: true }, take: 100, orderBy: { executeAfter: "asc" } });
  const out = { processed: 0, blocked: 0, failed: 0 };
  for (const r of due) {
    try {
      const res = await db.$transaction((tx) => anonymiseCustomer(tx, r.customerId, "cron", now), { timeout: 30_000 });
      if (res === "done") out.processed++; else if (res === "blocked") out.blocked++;
    } catch (err) {
      out.failed++;
      logger.error("[Deletion] could not anonymise", { err, customerId: r.customerId });
    }
  }
  return out;
}

/** For the admin list: pending and recent requests with who they are (identity is only shown while the person has not been anonymised). */
export async function deletionRequests(db: Db, now = new Date()) {
  const rows = await db.customerDeletionRequest.findMany({ orderBy: { requestedAt: "desc" }, take: 100, include: { customer: { select: { name: true, email: true, anonymisedAt: true } } } });
  const out = [];
  for (const r of rows) {
    const upcoming = r.status === "PENDING" ? await upcomingBookings(db, r.customer.email, now) : [];
    out.push({ id: r.id, status: r.status, requestedAt: r.requestedAt, executeAfter: r.executeAfter, processedAt: r.processedAt, processedBy: r.processedBy, name: r.customer.name, email: r.customer.anonymisedAt ? null : r.customer.email, upcomingCount: upcoming.length });
  }
  return out;
}
