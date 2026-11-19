// Coupons (database side). Rules live in ./rules.ts.
//  - findCoupon / couponUse: look a code up and count its use. Use is counted from the usage log AFTER a sweep that frees uses
//    that never became a real booking or plan (cancelled or expired bookings, lapsed payment holds, abandoned checkouts).
//  - redeem*: take a use inside the caller's transaction, under a per-coupon lock, re-checking everything, so two checkouts racing for
//    the last use (or one customer's second use) cannot both win.
import type { Prisma } from "@prisma/client";
import type { prisma } from "@/lib/prisma";
import { identityKey } from "@/lib/rewards/rules";
import { tryNormalizeEmail } from "@/lib/email-normalize";
import { normalizePhone } from "@/lib/phone";
import { evaluateCoupon, normalizeCode, type CouponContext, type CouponDef, type CouponUse, type CouponVerdict } from "./rules";

type Db = Prisma.TransactionClient | typeof prisma;

export const CALVY_OWNER = "CALVY";

export async function findCoupon(db: Db, ownerKey: string, code: string): Promise<CouponDef | null> {
  const c = normalizeCode(code);
  if (!c) return null;
  return (await db.coupon.findUnique({ where: { ownerKey_code: { ownerKey, code: c } } })) as CouponDef | null;
}

/** Free uses that no longer count: the booking was cancelled or expired, its payment hold lapsed, it no longer exists, or the plan checkout was abandoned. */
export async function sweepStaleUses(db: Db, couponId: string, now = new Date()): Promise<void> {
  await db.$executeRaw`
    DELETE FROM "CouponRedemption" r
    WHERE r."couponId" = ${couponId} AND r."appointmentId" IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM "Appointment" a WHERE a.id = r."appointmentId"
        AND a.status NOT IN ('cancelled', 'expired')
        AND NOT (a.status = 'pending_payment' AND a."holdExpiresAt" <= ${now})
    )`;
  await db.$executeRaw`
    DELETE FROM "CouponRedemption" r
    WHERE r."couponId" = ${couponId} AND r."subscriptionId" IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM "Subscription" s WHERE s.id = r."subscriptionId"
        AND NOT (s.state = 'PENDING' AND s."createdAt" <= ${new Date(now.getTime() - 24 * 3_600_000)})
        AND NOT (s.state = 'ENDED' AND s."currentPeriodStart" IS NULL)
    )`;
}

export async function couponUse(db: Db, couponId: string, identity: string | null): Promise<CouponUse> {
  const [total, byCustomer] = await Promise.all([
    db.couponRedemption.count({ where: { couponId } }),
    identity ? db.couponRedemption.count({ where: { couponId, identity } }) : Promise.resolve(0),
  ]);
  return { total, byCustomer };
}

/** Has this person (matched by email or phone, across all businesses or one) booked before? Cancelled and expired bookings do not count. */
export async function hasPriorBooking(db: Db, p: { email?: string | null; phone?: string | null; tz?: string | null; businessId?: string | null; excludeAppointmentId?: string | null }): Promise<boolean> {
  const email = tryNormalizeEmail(p.email) || null;
  const phone = normalizePhone(p.phone, p.tz);
  const who = [...(email ? [{ email: { equals: email, mode: "insensitive" as const } }] : []), ...(phone ? [{ phone }] : [])];
  if (who.length === 0) return false;
  const n = await db.appointment.count({
    where: {
      status: { notIn: ["cancelled", "expired"] },
      ...(p.excludeAppointmentId ? { id: { not: p.excludeAppointmentId } } : {}),
      client: { OR: who, ...(p.businessId ? { businessId: p.businessId } : {}) },
    },
  });
  return n > 0;
}

export interface PreviewInput {
  ownerKey: string;
  code: string;
  ctx: Omit<CouponContext, "now" | "isFirstBooking">;
  customer?: { email?: string | null; phone?: string | null; tz?: string | null };
  now?: Date;
}
export type Preview = { coupon: CouponDef | null; verdict: CouponVerdict };

/** Look up and judge a code without using it. */
export async function previewCoupon(db: Db, i: PreviewInput): Promise<Preview> {
  const coupon = await findCoupon(db, i.ownerKey, i.code);
  if (!coupon) return { coupon: null, verdict: evaluateCoupon(null, { ...i.ctx, now: i.now ?? new Date() }, { total: 0, byCustomer: 0 }) };
  await sweepStaleUses(db, coupon.id, i.now);
  const identity = i.customer ? identityKey(i.customer) : null;
  const use = await couponUse(db, coupon.id, identity);
  let isFirstBooking: boolean | undefined;
  if (coupon.firstBookingOnly && i.customer) {
    isFirstBooking = !(await hasPriorBooking(db, { ...i.customer, businessId: i.ctx.target === "FEE" ? null : i.ctx.businessId }));
  }
  return { coupon, verdict: evaluateCoupon(coupon, { ...i.ctx, isFirstBooking, now: i.now ?? new Date() }, use) };
}

export class CouponUnavailableError extends Error {
  constructor(message = "This code is no longer available. Please try again without it.") { super(message); this.name = "CouponUnavailableError"; }
}

async function lock(tx: Prisma.TransactionClient, couponId: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`coupon:${couponId}`}, 0))`;
}

/**
 * Take one use for a booking, inside its transaction. Everything is re-checked under the lock; a use is tied to the appointment (unique),
 * so a retry of the same booking cannot take two. Throws CouponUnavailableError when the code stopped being valid meanwhile.
 */
export async function redeemForAppointment(tx: Prisma.TransactionClient, p: { couponId: string; appointmentId: string; customer: { email?: string | null; phone?: string | null; tz?: string | null }; ctx: Omit<CouponContext, "now" | "isFirstBooking"> }): Promise<number> {
  await lock(tx, p.couponId);
  const coupon = (await tx.coupon.findUnique({ where: { id: p.couponId } })) as CouponDef | null;
  if (!coupon) throw new CouponUnavailableError();
  await sweepStaleUses(tx, coupon.id);
  const identity = identityKey(p.customer);
  if (!identity) throw new CouponUnavailableError();
  const use = await couponUse(tx, coupon.id, identity);
  const isFirstBooking = coupon.firstBookingOnly ? !(await hasPriorBooking(tx, { ...p.customer, businessId: p.ctx.target === "FEE" ? null : p.ctx.businessId, excludeAppointmentId: p.appointmentId })) : undefined;
  const v = evaluateCoupon(coupon, { ...p.ctx, isFirstBooking, now: new Date() }, use);
  if (!v.ok) throw new CouponUnavailableError(v.message);
  await tx.couponRedemption.create({ data: { couponId: coupon.id, identity, appointmentId: p.appointmentId, discountMinor: v.discountMinor } });
  return v.discountMinor;
}

/** The same for a plan checkout: the use belongs to the business ("b:<id>") and its pending subscription. */
export async function redeemForSubscription(tx: Prisma.TransactionClient, p: { couponId: string; subscriptionId: string; businessId: string; planId: string; amountMinor: number }): Promise<number> {
  await lock(tx, p.couponId);
  const coupon = (await tx.coupon.findUnique({ where: { id: p.couponId } })) as CouponDef | null;
  if (!coupon) throw new CouponUnavailableError();
  await sweepStaleUses(tx, coupon.id);
  const identity = `b:${p.businessId}`;
  const use = await couponUse(tx, coupon.id, identity);
  const v = evaluateCoupon(coupon, { target: "SUBSCRIPTION", businessId: p.businessId, planId: p.planId, amountMinor: p.amountMinor, now: new Date() }, use);
  if (!v.ok) throw new CouponUnavailableError(v.message);
  await tx.couponRedemption.create({ data: { couponId: coupon.id, identity, subscriptionId: p.subscriptionId, discountMinor: v.discountMinor } });
  return v.discountMinor;
}

/** Admin list with usage counts. */
export async function listCoupons(db: Db, where: Prisma.CouponWhereInput) {
  const rows = await db.coupon.findMany({ where, orderBy: { createdAt: "desc" }, take: 200, include: { _count: { select: { redemptions: true } } } });
  return rows;
}
