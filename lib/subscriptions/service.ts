// Plan subscriptions: the database side. Every money/state change is one transaction, takes a per-subscription lock, and is idempotent
// (a webhook, the return-page recheck and the cron can all report the same payment). Business.plan is set ONLY by applySubscriptionState.
import { CALVY_OWNER, CouponUnavailableError, previewCoupon, redeemForSubscription } from "@/lib/coupons/service";
import { capSubscriptionDiscount } from "@/lib/coupons/rules";
import { Prisma, type Subscription } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { formatCurrencyAmount } from "@/lib/currency";
import { notify } from "@/lib/notifications/enqueue";
import { subscriptionNotice } from "@/lib/notifications/subscriptions";
import { alertRecipient } from "@/lib/notifications/business";
import { paymentBaseUrl } from "@/lib/paymentUrls";
import { formatDateLabel } from "@/lib/time";
import {
  addInterval, classifyChange, desiredPlan, dunningDue, financialYear, graceEnd, invoiceLines, invoiceNumber, isPaidPlan, mandateCheck,
  overrideActive, planAmountMinor, planName, quoteUpgrade, retryDue, planPriceFor, taxKindFor, type Interval, type PaidPlanId,
} from "@/lib/subscriptions/rules";
import { getSubsClient, type SubsClient } from "@/lib/subscriptions/cashfree";

type Db = typeof prisma | Prisma.TransactionClient;
export const TX = { timeout: 20_000, maxWait: 10_000 } as const;
export const lock = (tx: Prisma.TransactionClient, id: string) => tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${"sub:" + id}, 0))`;
const intervalLabel = (i: string) => (i === "YEARLY" ? "yearly" : "monthly");
const inr = (minor: number) => formatCurrencyAmount(minor / 100, "INR");
const dateLabel = (d: Date) => formatDateLabel(d, "Asia/Kolkata");

/** Calvy's invoice details come from the environment (never hard-coded); a missing GSTIN means a plain receipt. */
export function invoiceIssuer(env: NodeJS.ProcessEnv = process.env) {
  const clean = (v?: string) => (v ?? "").replace(/\s+/g, " ").trim();
  const rate = Number(env.CALVY_GST_RATE ?? 18);
  return {
    legalName: clean(env.CALVY_LEGAL_NAME) || null,
    address: clean(env.CALVY_ADDRESS) || null,
    gstin: clean(env.CALVY_GSTIN).toUpperCase() || null,
    /** Letter of Undertaking number: set = exports are zero-rated and USD invoices carry no tax line; empty = IGST applies. */
    lutNumber: clean(env.CALVY_LUT_NUMBER) || null,
    cin: clean(env.CALVY_CIN) || null,
    gstRatePercent: Number.isFinite(rate) && rate >= 0 && rate <= 100 ? rate : 18,
  };
}

/* ── Reading ── */

/** The business's current subscription: the newest that is not ENDED, else the newest ended one (for "your plan ended" views). */
export async function currentSubscription(db: Db, businessId: string): Promise<Subscription | null> {
  const live = await db.subscription.findFirst({ where: { businessId, state: { not: "ENDED" } }, orderBy: { createdAt: "desc" } });
  if (live) return live;
  return db.subscription.findFirst({ where: { businessId }, orderBy: { createdAt: "desc" } });
}

/* ── Business.plan: the single place it is set from a subscription ── */

/**
 * Set the business's plan from its subscription. An admin plan override ALWAYS wins: while it is in force the plan is not touched
 * (only what the business returns to when the override ends is kept current). A business with no subscription is never touched.
 */
export async function applySubscriptionState(db: Db, businessId: string, now = new Date()): Promise<"applied" | "override" | "none" | "unchanged"> {
  const b = await db.business.findUnique({ where: { id: businessId }, select: { plan: true, planStatus: true, planOverridePlan: true, planOverrideUntil: true } });
  if (!b) return "none";
  const decisive = await db.subscription.findFirst({ where: { businessId, state: { in: ["ACTIVE", "PAST_DUE", "ENDED"] } }, orderBy: { createdAt: "desc" } });
  if (!decisive) return "none";
  const want = desiredPlan({ state: decisive.state, planId: decisive.planId, currentPeriodEnd: decisive.currentPeriodEnd, graceUntil: decisive.graceUntil }, now);
  if (!want) return "none";
  if (overrideActive(b, now)) {
    await db.business.update({ where: { id: businessId }, data: { planOverrideFromPlan: want.plan, planOverrideFromStatus: want.planStatus } });
    return "override";
  }
  if (b.plan === want.plan && b.planStatus === want.planStatus) return "unchanged";
  await db.business.update({ where: { id: businessId }, data: { plan: want.plan, planStatus: want.planStatus } });
  return "applied";
}

/* ── Emails ── */

async function noticeContext(db: Db, sub: Subscription) {
  const b = await db.business.findUnique({ where: { id: sub.businessId }, select: { name: true, owner: { select: { name: true } } } });
  const to = await alertRecipient(sub.businessId);
  return b && to ? { to, name: b.owner?.name ?? "there", businessName: b.name } : null;
}

export async function sendNotice(sub: Subscription, kind: Parameters<typeof subscriptionNotice>[0]["kind"], extra: Partial<Parameters<typeof subscriptionNotice>[0]> = {}) {
  try {
    const ctx = await noticeContext(prisma, sub);
    if (!ctx) return;
    await notify(subscriptionNotice({ kind, subscriptionId: sub.id, businessId: sub.businessId, planName: planName(sub.planId), intervalLabel: intervalLabel(sub.interval), ...ctx, ...extra }));
  } catch (e) {
    logger.error("[Subscriptions] email failed", { err: e, kind });
  }
}

/* ── Invoices ── */

export async function issueInvoice(tx: Prisma.TransactionClient, sub: Subscription, i: { paymentKey: string; grossMinor: number; creditMinor: number; couponMinor?: number; couponCode?: string | null; periodStart: Date; periodEnd: Date; now: Date; method: string | null }) {
  const existing = await tx.subscriptionInvoice.findUnique({ where: { paymentKey: i.paymentKey } });
  if (existing) return { invoice: existing, created: false as const };
  const issuer = invoiceIssuer();
  // Tax treatment follows who bills, never the currency: India is GST; international is zero-rated under an LUT when one is set, else IGST.
  const taxKind = taxKindFor(sub.gateway, issuer.lutNumber);
  const lines = invoiceLines({ grossMinor: i.grossMinor, creditMinor: i.creditMinor, couponMinor: i.couponMinor, gstin: issuer.gstin, gstRatePercent: issuer.gstRatePercent, taxKind });
  const fy = financialYear(i.now);
  // Atomic per-year counter: two invoices can never get the same number.
  const counter = await tx.invoiceCounter.upsert({ where: { fy }, create: { fy, last: 1 }, update: { last: { increment: 1 } } });
  const invoice = await tx.subscriptionInvoice.create({
    data: {
      businessId: sub.businessId, subscriptionId: sub.id, number: invoiceNumber(fy, counter.last), kind: lines.kind, paymentKey: i.paymentKey,
      planId: sub.planId, interval: sub.interval, periodStart: i.periodStart, periodEnd: i.periodEnd,
      grossMinor: lines.grossMinor, creditMinor: lines.creditMinor, couponMinor: lines.couponMinor, couponCode: lines.couponMinor > 0 ? i.couponCode ?? null : null, amountMinor: lines.amountMinor, taxableMinor: lines.taxableMinor, gstMinor: lines.gstMinor,
      gstRate: lines.gstRate, paymentMethodLabel: i.method, issuedAt: i.now,
      currency: sub.currency, taxKind: lines.taxKind, lutNumber: lines.taxKind === "LUT" ? issuer.lutNumber : null,
    },
  });
  return { invoice, created: true as const };
}

/** The first payment's discounts: the proration credit and the plan coupon are separate lines on the invoice (the coupon is stored folded into creditMinor). */
export async function firstInvoiceDiscounts(tx: Prisma.TransactionClient, sub: Subscription): Promise<{ creditMinor: number; couponMinor: number; couponCode: string | null }> {
  const couponMinor = Math.min(sub.couponMinor, sub.creditMinor);
  const code = couponMinor > 0 && sub.couponId ? (await tx.coupon.findUnique({ where: { id: sub.couponId }, select: { code: true } }))?.code ?? null : null;
  return { creditMinor: sub.creditMinor - couponMinor, couponMinor, couponCode: code };
}

const methodLabel = (m: string | null | undefined) => (m === "upi" ? "UPI Autopay" : m === "card" ? "Card" : m === "enach" ? "Bank e-mandate" : null);

/* ── Starting and upgrading ── */

export type CheckoutResult =
  | { ok: true; subscriptionId: string; sessionId: string; env: "sandbox" | "production"; quote: { grossMinor: number; creditMinor: number; couponMinor: number; dueMinor: number }; mandate: ReturnType<typeof mandateCheck> }
  | { ok: false; error: string; status: number };

export interface CouponQuote { couponId: string; code: string; name: string; couponMinor: number }

export async function quoteFor(businessId: string, planId: PaidPlanId, interval: Interval, now = new Date(), couponCode?: string | null, gateway: "CASHFREE" | "RAZORPAY" = "CASHFREE") {
  const current = await currentSubscription(prisma, businessId);
  // Only a subscription billed by the SAME gateway can be credited or upgraded from (India and international never mix).
  const active = current && (current.state === "ACTIVE" || current.state === "PAST_DUE") && current.gateway === gateway ? current : null;
  const newAmount = planPriceFor(gateway, planId, interval);
  const kind = classifyChange(active ? { planId: active.planId, interval: active.interval as Interval } : null, { planId, interval });
  // Credit = the unused part of what the customer actually PAID for the current period (the latest invoice), not the list price.
  const lastInvoice = active ? await prisma.subscriptionInvoice.findFirst({ where: { subscriptionId: active.id }, orderBy: { issuedAt: "desc" }, select: { amountMinor: true } }) : null;
  const credit = active?.state === "ACTIVE" && active.currentPeriodStart && active.currentPeriodEnd && lastInvoice
    ? { paidMinor: lastInvoice.amountMinor, periodStart: active.currentPeriodStart, periodEnd: active.currentPeriodEnd }
    : null;
  const base = quoteUpgrade({ newAmountMinor: newAmount, credit, now });
  // A Calvy coupon takes money off the FIRST charge only (durationMonths is reserved for later). Checked here for the preview and again,
  // under the coupon's lock, when the checkout is created.
  let coupon: CouponQuote | null = null;
  let couponError: string | null = null;
  if (couponCode?.trim()) {
    const { coupon: def, verdict } = await previewCoupon(prisma, { ownerKey: CALVY_OWNER, code: couponCode, ctx: { target: "SUBSCRIPTION", businessId, planId, amountMinor: base.dueMinor }, now });
    // A flat coupon is an amount of the currency it was made in (rupees, from the admin form): it never applies to a dollar plan. Percent coupons do.
    if (def && verdict.ok && gateway === "RAZORPAY" && def.kind === "FLAT") couponError = "This code is only for India plans.";
    else if (def && verdict.ok) {
      const couponMinor = capSubscriptionDiscount(base.dueMinor, verdict.discountMinor);
      if (couponMinor > 0) coupon = { couponId: def.id, code: def.code, name: def.name, couponMinor };
      else couponError = "This code does not reduce this plan's first payment.";
    } else couponError = verdict.ok ? null : verdict.message;
  }
  const quote = { ...base, couponMinor: coupon?.couponMinor ?? 0, dueMinor: base.dueMinor - (coupon?.couponMinor ?? 0) };
  return { active, kind, newAmount, quote, coupon, couponError };
}

/** Create the Cashfree subscription for a new plan or an upgrade and return what the browser needs to open Cashfree's authorisation page. */
export async function startCheckout(i: { businessId: string; planId: PaidPlanId; interval: Interval; method: "upi_card" | "enach"; couponCode?: string | null; now?: Date; client?: SubsClient | null }): Promise<CheckoutResult> {
  const now = i.now ?? new Date();
  const client = i.client === undefined ? getSubsClient() : i.client;
  if (!client) return { ok: false, status: 503, error: "Plan payments are not available right now. Please try again later." };
  const business = await prisma.business.findUnique({ where: { id: i.businessId }, select: { name: true, currency: true, phone: true, email: true, owner: { select: { name: true, email: true } } } });
  if (!business) return { ok: false, status: 404, error: "Business not found." };
  if ((business.currency ?? "").toUpperCase() !== "INR") return { ok: false, status: 403, error: "Plan payments for businesses outside India are coming soon." };
  const email = business.email?.trim() || business.owner?.email;
  const phone = business.phone?.replace(/[^\d]/g, "").slice(-10);
  if (!email) return { ok: false, status: 400, error: "Add a contact email in Settings first." };
  if (!phone || phone.length < 10) return { ok: false, status: 400, error: "Add a 10-digit phone number to your business profile in Settings first (your bank needs it to set up the payment)." };

  const q = await quoteFor(i.businessId, i.planId, i.interval, now, i.couponCode);
  if (i.couponCode?.trim() && !q.coupon) return { ok: false, status: 400, error: q.couponError ?? "This code is not valid." };
  if (q.kind === "same") return { ok: false, status: 409, error: "You are already on this plan." };
  // A cheaper-ranked plan that costs more per cycle than the current mandate allows also needs a new mandate (handled as a switch with credit).
  if (q.kind === "downgrade" && q.active && q.newAmount <= q.active.amountMinor) return { ok: false, status: 409, error: "A downgrade starts at the end of your billing period. Use Change plan, not checkout." };

  const subscriptionId = `calvy_sub_${i.businessId}_${now.getTime().toString(36)}`.slice(0, 240);
  const authMinor = i.method === "enach" ? 0 : q.quote.dueMinor;
  const mandate = mandateCheck(q.newAmount);
  let created;
  try {
    created = await client.createSubscription({
      subscriptionId, customer: { email, phone, name: business.owner?.name ?? business.name }, planName: `Calvy ${planName(i.planId)} ${intervalLabel(i.interval)}`.slice(0, 40),
      maxAmountMinor: q.newAmount, authorizationAmountMinor: authMinor,
      methods: i.method === "enach" ? ["enach"] : ["upi", "card"],
      returnUrl: `${paymentBaseUrl()}/dashboard/billing?subscription_id=${encodeURIComponent(subscriptionId)}`,
      expiresAt: new Date(now.getTime() + 24 * 3_600_000), tags: { businessId: i.businessId },
    });
  } catch (e) {
    logger.error("[Subscriptions] create failed", { err: e, businessId: i.businessId });
    return { ok: false, status: 502, error: "We could not start the payment. Please try again." };
  }
  try {
    await prisma.$transaction(async (tx) => {
      const sub = await tx.subscription.create({
        data: {
          businessId: i.businessId, planId: i.planId, interval: i.interval, state: "PENDING", cashfreeSubscriptionId: subscriptionId, cfSubscriptionId: created.cfSubscriptionId,
          // The coupon is folded into the credit, so the first charge, the amount check and the invoice stay consistent.
          amountMinor: q.newAmount, creditMinor: q.quote.creditMinor + q.quote.couponMinor, firstChargeMinor: q.quote.dueMinor, upgradeOfId: q.active?.id ?? null, method: i.method,
          couponId: q.coupon?.couponId ?? null, couponMinor: q.quote.couponMinor,
        },
      });
      if (q.coupon) {
        const used = await redeemForSubscription(tx, { couponId: q.coupon.couponId, subscriptionId: sub.id, businessId: i.businessId, planId: i.planId, amountMinor: q.quote.dueMinor + q.quote.couponMinor });
        if (used < q.quote.couponMinor) throw new CouponUnavailableError();
      }
    });
  } catch (e) {
    if (e instanceof CouponUnavailableError) return { ok: false, status: 409, error: e.message };
    throw e;
  }
  return { ok: true, subscriptionId, sessionId: created.sessionId, env: process.env.CASHFREE_ENV === "production" ? "production" : "sandbox", quote: q.quote, mandate };
}

/* ── Payments arriving (webhook, return page, cron all land here) ── */

/** The mandate was authorised. upi/card: the authorisation payment was the first charge. enach: authorised for 0, Calvy raises the first charge next. */
export async function onAuthorised(cashfreeSubscriptionId: string, info: { method?: string | null; now?: Date; client?: SubsClient | null } = {}): Promise<"activated" | "authorised" | "noop"> {
  const now = info.now ?? new Date();
  let notice: { sub: Subscription; kind: "started" | "upgraded"; invoiceNumber: string; amountMinor: number; creditMinor: number; end: Date } | null = null;
  let toCancel: string | null = null;
  const outcome = await prisma.$transaction(async (tx) => {
    const found = await tx.subscription.findUnique({ where: { cashfreeSubscriptionId } });
    if (!found) return "noop" as const;
    await lock(tx, found.id);
    const sub = await tx.subscription.findUniqueOrThrow({ where: { id: found.id } });
    if (sub.state !== "PENDING") return "noop" as const;
    const label = methodLabel(info.method) ?? methodLabel(sub.method === "enach" ? "enach" : "upi");
    if (sub.method === "enach") {
      await tx.subscription.update({ where: { id: sub.id }, data: { state: "AUTHORISED", paymentMethodLabel: label, nextChargeAt: now } });
      return "authorised" as const;
    }
    const end = addInterval(now, sub.interval as Interval);
    const { invoice, created } = await issueInvoice(tx, sub, { paymentKey: `first:${sub.id}`, grossMinor: sub.amountMinor, ...(await firstInvoiceDiscounts(tx, sub)), periodStart: now, periodEnd: end, now, method: label });
    await tx.subscription.update({ where: { id: sub.id }, data: { state: "ACTIVE", currentPeriodStart: now, currentPeriodEnd: end, nextChargeAt: end, paymentMethodLabel: label, failedCount: 0, firstFailedAt: null, graceUntil: null, dunningSent: 0 } });
    if (sub.upgradeOfId) {
      const old = await tx.subscription.findUnique({ where: { id: sub.upgradeOfId } });
      if (old && old.state !== "ENDED") {
        await tx.subscription.update({ where: { id: old.id }, data: { state: "ENDED", endedReason: "upgraded", pendingPlanId: null, pendingInterval: null, chargePaymentId: null } });
        toCancel = old.cashfreeSubscriptionId;
      }
    }
    await applySubscriptionState(tx, sub.businessId, now);
    if (created) notice = { sub, kind: sub.upgradeOfId ? "upgraded" : "started", invoiceNumber: invoice.number, amountMinor: invoice.amountMinor, creditMinor: invoice.creditMinor, end };
    return "activated" as const;
  }, TX);
  if (toCancel) {
    const client = info.client === undefined ? getSubsClient() : info.client;
    try { await client?.cancel(toCancel); } catch (e) { logger.error("[Subscriptions] cancelling the replaced mandate failed", { err: e }); }
  }
  if (notice) {
    const n = notice as { sub: Subscription; kind: "started" | "upgraded"; invoiceNumber: string; amountMinor: number; creditMinor: number; end: Date };
    await sendNotice(n.sub, n.kind, { amountLabel: inr(n.amountMinor), dateLabel: dateLabel(n.end), invoiceNumber: n.invoiceNumber, ...(n.creditMinor > 0 ? { creditLabel: inr(n.creditMinor) } : {}), version: `${n.kind}:${n.invoiceNumber}` });
  }
  return outcome;
}

/** Authorisation failed or the link expired before it was finished: the pending subscription is over, the business is untouched. */
export async function onAuthFailed(cashfreeSubscriptionId: string, reason = "authorisation_failed"): Promise<void> {
  await prisma.subscription.updateMany({ where: { cashfreeSubscriptionId, state: "PENDING" }, data: { state: "ENDED", endedReason: reason } });
}

/** A renewal (or the enach first) charge succeeded. Idempotent on the Cashfree payment id. */
export async function onChargeSucceeded(cashfreeSubscriptionId: string, p: { paymentId: string; amountMinor: number | null; method?: string | null; now?: Date }): Promise<"renewed" | "activated" | "noop" | "amount_mismatch"> {
  const now = p.now ?? new Date();
  let notice: { sub: Subscription; kind: "started" | "upgraded"; invoiceNumber: string; amountMinor: number; creditMinor: number; end: Date } | null = null;
  let toCancel: string | null = null;
  const out = await prisma.$transaction(async (tx) => {
    const found = await tx.subscription.findUnique({ where: { cashfreeSubscriptionId } });
    if (!found) return "noop" as const;
    await lock(tx, found.id);
    const sub = await tx.subscription.findUniqueOrThrow({ where: { id: found.id } });
    if (sub.state === "ENDED" || sub.state === "PENDING") return "noop" as const;
    // Only charges Calvy raised count as renewals (their payment id starts with our prefix). The authorisation payment of a UPI/card
    // start is reported as a payment too, but it is settled through onAuthorised and must never become a second invoice.
    if (!p.paymentId.startsWith(`calvy_ch_${sub.id}_`)) return "noop" as const;
    if (await tx.subscriptionInvoice.findUnique({ where: { paymentKey: p.paymentId } })) return "noop" as const;
    const first = sub.state === "AUTHORISED";
    const expected = first ? sub.firstChargeMinor : sub.amountMinor;
    // A paid amount that is not what we asked for is not applied (kept for review), like the booking-fee webhook.
    if (p.amountMinor !== null && p.amountMinor !== expected) { logger.warn("[Subscriptions] charge amount mismatch", { subscriptionId: sub.id, paid: p.amountMinor, expected }); return "amount_mismatch" as const; }
    const start = first ? now : sub.currentPeriodEnd ?? now;
    const end = addInterval(start, sub.interval as Interval);
    const label = methodLabel(p.method) ?? sub.paymentMethodLabel;
    const { invoice } = await issueInvoice(tx, sub, { paymentKey: p.paymentId, grossMinor: sub.amountMinor, ...(first ? await firstInvoiceDiscounts(tx, sub) : { creditMinor: 0 }), periodStart: start, periodEnd: end, now, method: label });
    await tx.subscription.update({ where: { id: sub.id }, data: { state: "ACTIVE", currentPeriodStart: start, currentPeriodEnd: end, nextChargeAt: end, chargePaymentId: null, chargeRaisedAt: null, failedCount: 0, firstFailedAt: null, graceUntil: null, dunningSent: 0, lastChargeRetryAt: null, paymentMethodLabel: label } });
    if (first && sub.upgradeOfId) {
      const old = await tx.subscription.findUnique({ where: { id: sub.upgradeOfId } });
      if (old && old.state !== "ENDED") { await tx.subscription.update({ where: { id: old.id }, data: { state: "ENDED", endedReason: "upgraded", chargePaymentId: null } }); toCancel = old.cashfreeSubscriptionId; }
    }
    await applySubscriptionState(tx, sub.businessId, now);
    if (first) notice = { sub, kind: sub.upgradeOfId ? "upgraded" : "started", invoiceNumber: invoice.number, amountMinor: invoice.amountMinor, creditMinor: invoice.creditMinor, end };
    return first ? ("activated" as const) : ("renewed" as const);
  }, TX);
  if (toCancel) { try { await getSubsClient()?.cancel(toCancel); } catch (e) { logger.error("[Subscriptions] cancelling the replaced mandate failed", { err: e }); } }
  if (notice) {
    const n = notice as { sub: Subscription; kind: "started" | "upgraded"; invoiceNumber: string; amountMinor: number; creditMinor: number; end: Date };
    await sendNotice(n.sub, n.kind, { amountLabel: inr(n.amountMinor), dateLabel: dateLabel(n.end), invoiceNumber: n.invoiceNumber, ...(n.creditMinor > 0 ? { creditLabel: inr(n.creditMinor) } : {}), version: `${n.kind}:${n.invoiceNumber}` });
  }
  return out;
}

/** A charge failed. The first failure starts the 7-day grace; paid features stay until it ends (Business.plan follows desiredPlan). */
export async function onChargeFailed(cashfreeSubscriptionId: string, now = new Date()): Promise<"past_due" | "noop"> {
  const sub = await prisma.$transaction(async (tx) => {
    const found = await tx.subscription.findUnique({ where: { cashfreeSubscriptionId } });
    if (!found) return null;
    await lock(tx, found.id);
    const s = await tx.subscription.findUniqueOrThrow({ where: { id: found.id } });
    if (s.state === "AUTHORISED") { await tx.subscription.update({ where: { id: s.id }, data: { state: "ENDED", endedReason: "first_charge_failed", chargePaymentId: null } }); return null; }
    if (s.state !== "ACTIVE" && s.state !== "PAST_DUE") return null;
    const firstFailedAt = s.firstFailedAt ?? now;
    const updated = await tx.subscription.update({ where: { id: s.id }, data: { state: "PAST_DUE", failedCount: { increment: 1 }, firstFailedAt, graceUntil: s.graceUntil ?? graceEnd(firstFailedAt), chargePaymentId: null } });
    await applySubscriptionState(tx, s.businessId, now);
    return updated;
  }, TX);
  if (!sub) return "noop";
  await advanceDunning(sub, now);
  return "past_due";
}

/** The mandate was ended on Cashfree's side (customer cancelled in their bank/UPI app, expired). */
export async function onMandateEnded(cashfreeSubscriptionId: string, now = new Date()): Promise<void> {
  const found = await prisma.subscription.findUnique({ where: { cashfreeSubscriptionId } });
  if (!found || found.state === "ENDED") return;
  if (found.state === "PENDING") { await onAuthFailed(cashfreeSubscriptionId, "mandate_ended"); return; }
  // Paid access continues to the end of the period already paid for; nothing more is charged.
  await prisma.$transaction(async (tx) => {
    await lock(tx, found.id);
    await tx.subscription.update({ where: { id: found.id }, data: { state: "ENDED", endedReason: "mandate_ended", pendingPlanId: null, pendingInterval: null, chargePaymentId: null } });
    await applySubscriptionState(tx, found.businessId, now);
  }, TX);
  await sendNotice(found, "cancelled", { dateLabel: found.currentPeriodEnd ? dateLabel(found.currentPeriodEnd) : undefined });
}

/* ── Owner changes: downgrade / cancel / undo (all at the end of the period) ── */

export async function scheduleChange(i: { businessId: string; action: "cancel" | "downgrade" | "undo"; planId?: PaidPlanId; interval?: Interval; now?: Date }): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const now = i.now ?? new Date();
  const sub = await prisma.subscription.findFirst({ where: { businessId: i.businessId, state: { in: ["ACTIVE", "PAST_DUE"] } }, orderBy: { createdAt: "desc" } });
  if (!sub) return { ok: false, status: 404, error: "You have no active subscription." };
  if (i.action === "undo") {
    // Razorpay cannot un-cancel: once the cancel or downgrade was sent to it (in the last 2 days of the period) it can no longer be undone here.
    if (sub.gateway === "RAZORPAY" && sub.chargeRaisedAt) return { ok: false, status: 409, error: "This change was already sent to the payment provider and can no longer be undone. Subscribe again after it takes effect." };
    await prisma.subscription.update({ where: { id: sub.id }, data: { pendingPlanId: null, pendingInterval: null } });
    return { ok: true };
  }
  if (i.action === "cancel") {
    await prisma.subscription.update({ where: { id: sub.id }, data: { pendingPlanId: "free", pendingInterval: null } });
    await sendNotice(sub, "cancelled", { dateLabel: sub.currentPeriodEnd ? dateLabel(sub.currentPeriodEnd) : undefined, version: `cancelled:${now.toISOString().slice(0, 10)}` });
    return { ok: true };
  }
  if (!i.planId || !i.interval) return { ok: false, status: 400, error: "Choose a plan." };
  const kind = classifyChange({ planId: sub.planId, interval: sub.interval as Interval }, { planId: i.planId, interval: i.interval });
  if (kind === "same") return { ok: false, status: 409, error: "You are already on this plan." };
  if (kind !== "downgrade" || planPriceFor(sub.gateway === "RAZORPAY" ? "RAZORPAY" : "CASHFREE", i.planId, i.interval) > sub.amountMinor) return { ok: false, status: 409, error: "That is an upgrade: it starts now, through checkout." };
  await prisma.subscription.update({ where: { id: sub.id }, data: { pendingPlanId: i.planId, pendingInterval: i.interval } });
  await sendNotice(sub, "downgrade_scheduled", { planName: planName(i.planId), intervalLabel: intervalLabel(i.interval), dateLabel: sub.currentPeriodEnd ? dateLabel(sub.currentPeriodEnd) : undefined, version: `downgrade:${i.planId}:${i.interval}` });
  return { ok: true };
}

/* ── Dunning, retries and renewals (the cron) ── */

/** Send the next dunning email that is due (days 0, 3, 6), once each. */
export async function advanceDunning(sub: Subscription, now = new Date()): Promise<number> {
  if (sub.state !== "PAST_DUE" || !sub.firstFailedAt) return 0;
  const due = dunningDue({ firstFailedAt: sub.firstFailedAt, dunningSent: sub.dunningSent, lastChargeRetryAt: sub.lastChargeRetryAt, now });
  if (!due) return 0;
  // Claim the step first: two overlapping runs cannot both send it.
  const claimed = await prisma.subscription.updateMany({ where: { id: sub.id, dunningSent: sub.dunningSent }, data: { dunningSent: due } });
  if (claimed.count !== 1) return 0;
  await sendNotice(sub, `payment_failed_${due}` as "payment_failed_1", { amountLabel: inr(sub.amountMinor), dateLabel: sub.graceUntil ? dateLabel(sub.graceUntil) : undefined, version: `dunning:${due}:${sub.firstFailedAt.toISOString().slice(0, 10)}` });
  return 1;
}

async function raiseCharge(client: SubsClient, sub: Subscription, amountMinor: number, scheduleDate: Date, suffix: string): Promise<boolean> {
  const paymentId = `calvy_ch_${sub.id}_${suffix}`.slice(0, 120);
  try {
    await client.charge({ subscriptionId: sub.cashfreeSubscriptionId, paymentId, amountMinor, scheduleDate, remarks: `Calvy ${planName(sub.planId)}` });
    await prisma.subscription.update({ where: { id: sub.id }, data: { chargePaymentId: paymentId, chargeRaisedAt: new Date() } });
    return true;
  } catch (e) {
    logger.error("[Subscriptions] raising a charge failed", { err: e, subscriptionId: sub.id });
    return false;
  }
}

export interface DueSummary { raised: number; retried: number; dunning: number; downgraded: number; ended: number; applied: number }

/**
 * One pass of the daily/2-minute cron. Raises renewal charges a day ahead (UPI pre-debit notice), applies scheduled downgrades and
 * cancellations, retries failed charges, sends dunning emails, and after the 7-day grace moves the business to Basic.
 */
export async function processDueSubscriptions(now = new Date(), client: SubsClient | null = getSubsClient()): Promise<DueSummary> {
  const s: DueSummary = { raised: 0, retried: 0, dunning: 0, downgraded: 0, ended: 0, applied: 0 };
  const ahead = new Date(now.getTime() + 24 * 3_600_000);

  // 1. Renewals and the e-mandate first charge.
  const due = await prisma.subscription.findMany({ where: { gateway: "CASHFREE", state: { in: ["ACTIVE", "AUTHORISED"] }, nextChargeAt: { lte: ahead }, chargePaymentId: null }, take: 200 });
  for (const sub of due) {
    if (sub.state === "ACTIVE" && sub.pendingPlanId === "free") {
      // Cancel at period end: nothing more is charged; paid features run to the period end (desiredPlan).
      await prisma.$transaction(async (tx) => { await lock(tx, sub.id); await tx.subscription.update({ where: { id: sub.id }, data: { state: "ENDED", endedReason: "cancelled", pendingPlanId: null, pendingInterval: null } }); await applySubscriptionState(tx, sub.businessId, now); }, TX);
      try { await client?.cancel(sub.cashfreeSubscriptionId); } catch (e) { logger.error("[Subscriptions] cancel at Cashfree failed", { err: e }); }
      s.ended++;
      continue;
    }
    let current = sub;
    if (sub.state === "ACTIVE" && sub.pendingPlanId && isPaidPlan(sub.pendingPlanId) && sub.pendingInterval) {
      const nextAmount = planAmountMinor(sub.pendingPlanId, sub.pendingInterval as Interval);
      // Only a cheaper-or-equal plan can ride the same mandate (its maximum is the old price); scheduleChange already enforces this.
      if (nextAmount <= sub.amountMinor) {
        current = await prisma.subscription.update({ where: { id: sub.id }, data: { planId: sub.pendingPlanId, interval: sub.pendingInterval, amountMinor: nextAmount, pendingPlanId: null, pendingInterval: null } });
        s.downgraded++;
      }
    }
    if (!client) continue;
    const amount = current.state === "AUTHORISED" ? current.firstChargeMinor : current.amountMinor;
    const schedule = current.nextChargeAt && current.nextChargeAt > now ? current.nextChargeAt : new Date(now.getTime() + 24 * 3_600_000);
    if (await raiseCharge(client, current, amount, schedule, schedule.toISOString().slice(0, 10).replace(/-/g, ""))) s.raised++;
  }

  // 2. Failed payments: retries, dunning emails, and the end of the grace.
  const pastDue = await prisma.subscription.findMany({ where: { gateway: "CASHFREE", state: "PAST_DUE" }, take: 200 });
  for (const sub of pastDue) {
    if (sub.graceUntil && now >= sub.graceUntil) {
      await prisma.$transaction(async (tx) => { await lock(tx, sub.id); await tx.subscription.update({ where: { id: sub.id }, data: { state: "ENDED", endedReason: "payment_failed", chargePaymentId: null } }); await applySubscriptionState(tx, sub.businessId, now); }, TX);
      try { await client?.cancel(sub.cashfreeSubscriptionId); } catch (e) { logger.error("[Subscriptions] cancel at Cashfree failed", { err: e }); }
      await sendNotice(sub, "downgraded", { version: `downgraded:${sub.firstFailedAt?.toISOString().slice(0, 10) ?? ""}` });
      s.ended++;
      continue;
    }
    s.dunning += await advanceDunning(sub, now);
    if (client && sub.firstFailedAt && !sub.chargePaymentId && retryDue({ firstFailedAt: sub.firstFailedAt, dunningSent: sub.dunningSent, lastChargeRetryAt: sub.lastChargeRetryAt, now })) {
      const day = Math.floor((now.getTime() - sub.firstFailedAt.getTime()) / 86_400_000);
      if (await raiseCharge(client, sub, sub.amountMinor, new Date(now.getTime() + 24 * 3_600_000), `r${day}`)) {
        await prisma.subscription.update({ where: { id: sub.id }, data: { lastChargeRetryAt: now } });
        s.retried++;
      }
    }
  }

  // 3. Cancelled/ended subscriptions whose paid period is over: the business goes to Basic (an override still wins).
  const over = await prisma.subscription.findMany({ where: { state: "ENDED", currentPeriodEnd: { lte: now }, business: { plan: { not: "free" } } }, select: { businessId: true }, distinct: ["businessId"], take: 200 });
  for (const o of over) if ((await applySubscriptionState(prisma, o.businessId, now)) === "applied") s.applied++;
  return s;
}

/** The return page: ask Cashfree where a pending subscription stands, so it activates even before the webhook arrives. */
export async function reconcileSubscription(cashfreeSubscriptionId: string, client: SubsClient | null = getSubsClient()): Promise<"activated" | "authorised" | "pending" | "failed" | "noop"> {
  const sub = await prisma.subscription.findUnique({ where: { cashfreeSubscriptionId } });
  if (!sub) return "noop";
  if (sub.state !== "PENDING") return sub.state === "ACTIVE" ? "activated" : sub.state === "AUTHORISED" ? "authorised" : "noop";
  if (!client) return "pending";
  const r = await client.getSubscription(cashfreeSubscriptionId).catch(() => null);
  if (!r) return "pending";
  if (r.authorizationStatus === "ACTIVE" || r.status === "ACTIVE") {
    const out = await onAuthorised(cashfreeSubscriptionId, { client });
    return out === "noop" ? "pending" : out;
  }
  if (r.status === "LINK_EXPIRED" || r.status === "EXPIRED" || r.authorizationStatus === "FAILED") { await onAuthFailed(cashfreeSubscriptionId); return "failed"; }
  return "pending";
}
