// International plan billing through Razorpay (USD, cards): the database side. India is Cashfree (./service.ts) and never reaches this file.
// Every money/state change is one transaction under a per-subscription lock and is idempotent on Razorpay's payment id, so a webhook, the
// checkout confirmation and the cron can all report the same payment.
//
//  - First payment: with no discount the subscription starts at once and the card is charged the plan price at authentication. With a coupon or an
//    upgrade credit the FIRST period is the discounted amount, charged at authentication as an add-on, and recurring starts one period later at
//    the full price: one checkout, one card entry (Razorpay: with a future start_at and an upfront add-on, only the add-on is charged at
//    authentication; see docs/razorpay-international.md).
//  - If Razorpay refuses recurring for the currency or card, billing falls back to LINKS mode (a payment link per period plus reminder emails),
//    loudly: logged, shown in Admin -> Billing and emailed to the team. Never silently.
//  - Failed renewals: Razorpay's own retries, then "halted" = past due with a 7-day grace and reminder emails on days 1, 3 and 6; after the grace
//    the business drops to the Free plan's features (data kept; plan enforcement is respected once it is on).
import type { Prisma, Subscription } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { formatCurrencyAmount } from "@/lib/currency";
import { isFeatureEnabled } from "@/lib/flags";
import { formatDateLabel } from "@/lib/time";
import { notify } from "@/lib/notifications/enqueue";
import { regionOf } from "@/lib/payments/region";
import { CouponUnavailableError, redeemForSubscription } from "@/lib/coupons/service";
import { addInterval, classifyChange, dunningDue, graceEnd, intlPlanAmountMinor, isPaidPlan, planName, RZP_DUNNING_DAYS, type Interval, type PaidPlanId } from "@/lib/subscriptions/rules";
import { TX, applySubscriptionState, currentSubscription, firstInvoiceDiscounts, issueInvoice, lock, quoteFor, sendNotice } from "@/lib/subscriptions/service";
import {
  RAZORPAY_BILLING_CURRENCY, isRecurringUnsupported, makeRazorpayClient, razorpayConfig, verifyCheckoutSignature,
  type RazorpayClient, type RzpEvent, type RzpPayment,
} from "@/lib/subscriptions/razorpay";

type Db = typeof prisma | Prisma.TransactionClient;

export const TEAM_EMAIL = () => (process.env.CALVY_TEAM_EMAIL ?? "team@calvy.io").trim();
const usd = (minor: number) => formatCurrencyAmount(minor / 100, RAZORPAY_BILLING_CURRENCY);
const dateLabel = (d: Date) => formatDateLabel(d, "UTC");
const unix = (d: Date) => Math.floor(d.getTime() / 1000);
const randomId = () => `rzp:${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;

// ── Region routing ──
export type BillingGateway = "CASHFREE" | "RAZORPAY";

/** Who bills Calvy plans for this business: India -> Cashfree, everywhere else -> Razorpay. The region comes from the same source the price list uses (lib/payments/region.ts). */
export const billingGateway = (b: { country?: string | null; currency?: string | null }): BillingGateway => (regionOf(b) === "IN" ? "CASHFREE" : "RAZORPAY");

/** The guard: Razorpay is never used for an Indian business, and never for rupees. */
export function razorpayAllowedFor(b: { country?: string | null; currency?: string | null }): { ok: true } | { ok: false; error: string } {
  if (regionOf(b) === "IN") return { ok: false, error: "Plan payments for businesses in India go through Cashfree." };
  if ((b.currency ?? "").trim().toUpperCase() === "INR") return { ok: false, error: "Razorpay billing is for dollar plans outside India." };
  return { ok: true };
}

/** International billing is on when the owner switched it on (flag CF_INTL_SUBSCRIPTIONS) and the Razorpay keys are usable here. */
export function intlBillingEnabled(): boolean {
  return isFeatureEnabled("intlSubscriptions") && razorpayConfig().ok;
}

function clientOrNull(): { client: RazorpayClient; keyId: string } | null {
  const c = razorpayConfig();
  return c.ok ? { client: makeRazorpayClient(c.config), keyId: c.config.keyId } : null;
}

// ── Razorpay plans (made once per price, then reused) ──
async function ensurePlan(db: Db, client: RazorpayClient, planId: PaidPlanId, interval: Interval): Promise<string> {
  const amount = intlPlanAmountMinor(planId, interval);
  const key = `rzp.plan.${planId}.${interval}.${amount}`;
  const row = await db.appSetting.findUnique({ where: { key } });
  if (row?.value) return row.value;
  const made = await client.createPlan({ period: interval === "YEARLY" ? "yearly" : "monthly", name: `Calvy ${planName(planId)} ${interval === "YEARLY" ? "yearly" : "monthly"}`, amountMinor: amount });
  await db.appSetting.upsert({ where: { key }, create: { key, value: made.id }, update: { value: made.id } });
  return made.id;
}

// ── Checkout ──
export type IntlCheckout =
  | { ok: true; mode: "RECURRING"; subscriptionId: string; razorpaySubscriptionId: string; keyId: string; quote: { grossMinor: number; creditMinor: number; couponMinor: number; dueMinor: number } }
  | { ok: true; mode: "LINKS"; subscriptionId: string; url: string; quote: { grossMinor: number; creditMinor: number; couponMinor: number; dueMinor: number } }
  | { ok: false; status: number; error: string };

const totalCount = (i: Interval) => (i === "YEARLY" ? 10 : 120);

/** Start a new plan or an upgrade for an international business. */
export async function startIntlCheckout(i: { businessId: string; planId: PaidPlanId; interval: Interval; couponCode?: string | null; now?: Date; deps?: { client: RazorpayClient; keyId: string } | null }): Promise<IntlCheckout> {
  const now = i.now ?? new Date();
  const deps = i.deps === undefined ? clientOrNull() : i.deps;
  if (!deps || !isFeatureEnabled("intlSubscriptions")) return { ok: false, status: 503, error: "Plan payments are not available right now. Please try again later." };
  const business = await prisma.business.findUnique({ where: { id: i.businessId }, select: { name: true, currency: true, email: true, owner: { select: { name: true, email: true } } } });
  if (!business) return { ok: false, status: 404, error: "Business not found." };
  const guard = razorpayAllowedFor(business);
  if (!guard.ok) return { ok: false, status: 403, error: guard.error };
  const email = business.email?.trim() || business.owner?.email;
  if (!email) return { ok: false, status: 400, error: "Add a contact email in Settings first." };

  const q = await quoteFor(i.businessId, i.planId, i.interval, now, i.couponCode, "RAZORPAY");
  if (i.couponCode?.trim() && !q.coupon) return { ok: false, status: 400, error: q.couponError ?? "This code is not valid." };
  if (q.kind === "same") return { ok: false, status: 409, error: "You are already on this plan." };
  if (q.kind === "downgrade" && q.active && q.newAmount <= q.active.amountMinor) return { ok: false, status: 409, error: "A downgrade starts at the end of your billing period. Use Change plan, not checkout." };

  const due = q.quote.dueMinor;
  const discounted = due < q.newAmount;
  const quote = { grossMinor: q.quote.grossMinor, creditMinor: q.quote.creditMinor, couponMinor: q.quote.couponMinor, dueMinor: due };
  const base = {
    businessId: i.businessId, planId: i.planId, interval: i.interval, state: "PENDING" as const, gateway: "RAZORPAY", currency: RAZORPAY_BILLING_CURRENCY, method: "card",
    amountMinor: q.newAmount, creditMinor: q.quote.creditMinor + q.quote.couponMinor, firstChargeMinor: due, upgradeOfId: q.active?.id ?? null,
    couponId: q.coupon?.couponId ?? null, couponMinor: q.quote.couponMinor,
  };
  const calvyId = randomId();

  // A coupon or credit: the first period is the discounted amount (charged at authentication as an add-on), recurring starts one period later at full price.
  let created;
  let planRzpId: string;
  try {
    planRzpId = await ensurePlan(prisma, deps.client, i.planId, i.interval);
    created = await deps.client.createSubscription({
      planId: planRzpId, totalCount: totalCount(i.interval), notes: { calvySubscription: calvyId, businessId: i.businessId },
      ...(discounted ? { startAt: unix(addInterval(now, i.interval)), addons: [{ item: { name: `Calvy ${planName(i.planId)}, first ${i.interval === "YEARLY" ? "year" : "month"}`, amount: due, currency: RAZORPAY_BILLING_CURRENCY } }] } : {}),
    });
  } catch (e) {
    if (isRecurringUnsupported(e)) return startLinksFallback(deps, { ...base, calvyId, quote, now, email, name: business.owner?.name ?? business.name, businessName: business.name, reason: e instanceof Error ? e.message.slice(0, 200) : "unsupported" });
    logger.error("[Razorpay] could not create the subscription", { err: e, businessId: i.businessId });
    return { ok: false, status: 502, error: "We could not start the payment. Please try again." };
  }

  try {
    const subId = await prisma.$transaction(async (tx) => {
      const sub = await tx.subscription.create({ data: { ...base, cashfreeSubscriptionId: calvyId, rzpSubscriptionId: created.id, rzpPlanId: planRzpId, billingMode: "RECURRING" } });
      if (q.coupon) {
        const used = await redeemForSubscription(tx, { couponId: q.coupon.couponId, subscriptionId: sub.id, businessId: i.businessId, planId: i.planId, amountMinor: due + q.quote.couponMinor });
        if (used < q.quote.couponMinor) throw new CouponUnavailableError();
      }
      return sub.id;
    });
    return { ok: true, mode: "RECURRING", subscriptionId: subId, razorpaySubscriptionId: created.id, keyId: deps.keyId, quote };
  } catch (e) {
    try { await deps.client.cancelSubscription(created.id, false); } catch { /* the pending Razorpay subscription is never authorised: harmless */ }
    if (e instanceof CouponUnavailableError) return { ok: false, status: 409, error: e.message };
    throw e;
  }
}

/** The fallback: Razorpay refused recurring. One payment link for the first period now, a link per period after that, with reminders. Always loud. */
async function startLinksFallback(deps: { client: RazorpayClient; keyId: string }, i: {
  businessId: string; planId: PaidPlanId; interval: Interval; amountMinor: number; creditMinor: number; firstChargeMinor: number; upgradeOfId: string | null; couponId: string | null; couponMinor: number;
  calvyId: string; quote: { grossMinor: number; creditMinor: number; couponMinor: number; dueMinor: number }; now: Date; email: string; name: string; businessName: string; reason: string;
  state: "PENDING"; gateway: string; currency: string; method: string;
}): Promise<IntlCheckout> {
  const { calvyId, quote, now, email, name, businessName, reason, ...data } = i;
  let link;
  try {
    link = await deps.client.createPaymentLink({
      amountMinor: i.firstChargeMinor, description: `Calvy ${planName(i.planId)} (${i.interval === "YEARLY" ? "yearly" : "monthly"}) for ${businessName}`, referenceId: calvyId.replace(/\W/g, "").slice(0, 40),
      customer: { name, email }, notes: { calvySubscription: calvyId, businessId: i.businessId }, expireBy: unix(new Date(now.getTime() + 7 * 86_400_000)),
    });
  } catch (e) {
    logger.error("[Razorpay] fallback payment link failed", { err: e, businessId: i.businessId });
    return { ok: false, status: 502, error: "We could not start the payment. Please try again." };
  }
  let subId: string;
  try {
    subId = await prisma.$transaction(async (tx) => {
      const sub = await tx.subscription.create({ data: { ...data, cashfreeSubscriptionId: calvyId, billingMode: "LINKS", linksReason: reason, renewalLinkId: link.id, renewalLinkUrl: link.shortUrl, renewalForPeriodStart: now } });
      if (i.couponId) {
        const used = await redeemForSubscription(tx, { couponId: i.couponId, subscriptionId: sub.id, businessId: i.businessId, planId: i.planId, amountMinor: i.firstChargeMinor + i.couponMinor });
        if (used < i.couponMinor) throw new CouponUnavailableError();
      }
      return sub.id;
    });
  } catch (e) {
    if (e instanceof CouponUnavailableError) return { ok: false, status: 409, error: e.message };
    throw e;
  }
  await announceLinksMode(subId, i.businessId, businessName, reason);
  return { ok: true, mode: "LINKS", subscriptionId: subId, url: link.shortUrl, quote };
}

/** A business fell back to links mode: log it, and email the team. Never silent. */
async function announceLinksMode(subscriptionId: string, businessId: string, businessName: string, reason: string) {
  logger.warn("[Billing] links mode: Razorpay refused recurring, falling back to payment links", { subscriptionId, businessId, reason });
  try {
    await notify({
      event: "billing.links_mode", audience: "PLATFORM", subjectId: subscriptionId, version: "links", recipient: TEAM_EMAIL(), template: "billing_links_mode",
      payload: { businessName, businessId, reason, adminUrl: `${(process.env.NEXT_PUBLIC_APP_URL ?? "https://calvy.io").replace(/\/+$/, "")}/admin/billing` },
    });
  } catch (e) {
    logger.error("[Billing] could not email the team about links mode", { err: e });
  }
}

// ── "Update card": a replacement subscription that takes over the paid period ──
export type CardUpdate = { ok: true; razorpaySubscriptionId: string; keyId: string } | { ok: false; status: number; error: string };

/**
 * Cancel-and-replace: a NEW subscription is created for the same plan, starting at the current period end (so the card is never charged twice
 * for one period). When it is authenticated the old one is cancelled and the new one inherits the paid period. If the period already ended
 * (a halted plan), the new one starts now and its first charge is the overdue renewal.
 */
export async function startCardUpdate(i: { businessId: string; now?: Date; deps?: { client: RazorpayClient; keyId: string } | null }): Promise<CardUpdate> {
  const now = i.now ?? new Date();
  const deps = i.deps === undefined ? clientOrNull() : i.deps;
  if (!deps || !isFeatureEnabled("intlSubscriptions")) return { ok: false, status: 503, error: "Plan payments are not available right now. Please try again later." };
  const business = await prisma.business.findUnique({ where: { id: i.businessId }, select: { currency: true } });
  const guard = business ? razorpayAllowedFor(business) : ({ ok: false, error: "Business not found." } as const);
  if (!guard.ok) return { ok: false, status: 403, error: guard.error };
  const old = await prisma.subscription.findFirst({ where: { businessId: i.businessId, gateway: "RAZORPAY", state: { in: ["ACTIVE", "PAST_DUE"] } }, orderBy: { createdAt: "desc" } });
  if (!old || !isPaidPlan(old.planId)) return { ok: false, status: 404, error: "You have no active subscription." };
  if (old.billingMode !== "RECURRING") return { ok: false, status: 409, error: "Your plan is paid by payment link, so there is no card to update." };
  const future = old.state === "ACTIVE" && old.currentPeriodEnd && old.currentPeriodEnd.getTime() > now.getTime() + 10 * 60_000;
  let created, planId: string;
  const calvyId = randomId();
  try {
    planId = await ensurePlan(prisma, deps.client, old.planId, old.interval as Interval);
    created = await deps.client.createSubscription({ planId, totalCount: totalCount(old.interval as Interval), notes: { calvySubscription: calvyId, businessId: i.businessId, cardUpdateOf: old.id }, ...(future ? { startAt: unix(old.currentPeriodEnd!) } : {}) });
  } catch (e) {
    logger.error("[Razorpay] card update failed", { err: e, businessId: i.businessId });
    return { ok: false, status: 502, error: "We could not start the card update. Please try again." };
  }
  await prisma.subscription.create({
    data: {
      businessId: i.businessId, planId: old.planId, interval: old.interval, state: "PENDING", gateway: "RAZORPAY", currency: RAZORPAY_BILLING_CURRENCY, method: "card", cashfreeSubscriptionId: calvyId,
      rzpSubscriptionId: created.id, rzpPlanId: planId, billingMode: "RECURRING", amountMinor: old.amountMinor, firstChargeMinor: old.amountMinor, creditMinor: 0, upgradeOfId: old.id, cardUpdate: true,
    },
  });
  return { ok: true, razorpaySubscriptionId: created.id, keyId: deps.keyId };
}

// ── Payments and state changes arriving (webhook, checkout confirmation, cron) ──
type Result = "activated" | "renewed" | "noop" | "amount_mismatch" | "currency_mismatch";

interface Notice { sub: Subscription; kind: "started" | "upgraded"; invoiceNumber: string; amountMinor: number; creditMinor: number; end: Date }

async function finish(notice: Notice | null, toCancel: string | null, deps: { client: RazorpayClient } | null) {
  if (toCancel && deps) { try { await deps.client.cancelSubscription(toCancel, false); } catch (e) { logger.error("[Razorpay] cancelling the replaced subscription failed", { err: e }); } }
  if (notice) {
    await sendNotice(notice.sub, notice.kind, {
      amountLabel: usd(notice.amountMinor), dateLabel: dateLabel(notice.end), invoiceNumber: notice.invoiceNumber, ...(notice.creditMinor > 0 ? { creditLabel: usd(notice.creditMinor) } : {}),
      version: `${notice.kind}:${notice.invoiceNumber}`,
    });
  }
}

/**
 * A captured payment on a Razorpay-billed subscription (the first one, or a renewal). Idempotent on the payment id. Refused unless it is
 * dollars, on a Razorpay subscription, for the amount Calvy expected.
 */
export async function applyIntlPayment(find: { rzpSubscriptionId?: string; calvyId?: string }, payment: RzpPayment, now = new Date(), deps: { client: RazorpayClient } | null = clientOrNull()): Promise<Result> {
  if (payment.status !== "captured") return "noop";
  let notice: Notice | null = null;
  let toCancel: string | null = null;
  const out = await prisma.$transaction(async (tx) => {
    const found = await tx.subscription.findFirst({ where: find.rzpSubscriptionId ? { rzpSubscriptionId: find.rzpSubscriptionId } : { cashfreeSubscriptionId: find.calvyId ?? "-" } });
    if (!found || found.gateway !== "RAZORPAY") return "noop" as const; // the region guard: only Razorpay-billed rows are ever touched here
    await lock(tx, found.id);
    const sub = await tx.subscription.findUniqueOrThrow({ where: { id: found.id } });
    if (payment.currency !== RAZORPAY_BILLING_CURRENCY || sub.currency !== RAZORPAY_BILLING_CURRENCY) return "currency_mismatch" as const;
    if (sub.state === "ENDED" || sub.state === "AUTHORISED") return "noop" as const;
    if (await tx.subscriptionInvoice.findUnique({ where: { paymentKey: payment.id } })) return "noop" as const;
    const method = payment.method ? payment.method.charAt(0).toUpperCase() + payment.method.slice(1) : sub.paymentMethodLabel;

    if (sub.state === "PENDING") {
      const expected = sub.cardUpdate ? sub.amountMinor : sub.firstChargeMinor;
      if (payment.amountMinor !== expected) { logger.warn("[Razorpay] first payment amount mismatch", { subscriptionId: sub.id, paid: payment.amountMinor, expected }); return "amount_mismatch" as const; }
      const end = addInterval(now, sub.interval as Interval);
      const disc = sub.cardUpdate ? { creditMinor: 0, couponMinor: 0, couponCode: null } : await firstInvoiceDiscounts(tx, sub);
      const { invoice } = await issueInvoice(tx, sub, { paymentKey: payment.id, grossMinor: sub.amountMinor, ...disc, periodStart: now, periodEnd: end, now, method });
      await tx.subscription.update({ where: { id: sub.id }, data: { state: "ACTIVE", currentPeriodStart: now, currentPeriodEnd: end, nextChargeAt: end, paymentMethodLabel: method, failedCount: 0, firstFailedAt: null, graceUntil: null, dunningSent: 0 } });
      if (sub.upgradeOfId) {
        const old = await tx.subscription.findUnique({ where: { id: sub.upgradeOfId } });
        if (old && old.state !== "ENDED") { await tx.subscription.update({ where: { id: old.id }, data: { state: "ENDED", endedReason: sub.cardUpdate ? "card_updated" : "upgraded", pendingPlanId: null, pendingInterval: null } }); toCancel = old.rzpSubscriptionId; }
      }
      await applySubscriptionState(tx, sub.businessId, now);
      if (!sub.cardUpdate) notice = { sub, kind: sub.upgradeOfId ? "upgraded" : "started", invoiceNumber: invoice.number, amountMinor: invoice.amountMinor, creditMinor: invoice.creditMinor, end };
      return "activated" as const;
    }

    // A renewal. A scheduled downgrade takes effect when the first payment at its price arrives.
    let planId = sub.planId, interval = sub.interval, amount = sub.amountMinor;
    let applyPending = false;
    if (sub.pendingPlanId && isPaidPlan(sub.pendingPlanId) && sub.pendingInterval) {
      const pendingAmount = intlPlanAmountMinor(sub.pendingPlanId, sub.pendingInterval as Interval);
      if (payment.amountMinor === pendingAmount && payment.amountMinor !== sub.amountMinor) { planId = sub.pendingPlanId; interval = sub.pendingInterval; amount = pendingAmount; applyPending = true; }
    }
    if (payment.amountMinor !== amount) { logger.warn("[Razorpay] renewal amount mismatch", { subscriptionId: sub.id, paid: payment.amountMinor, expected: amount }); return "amount_mismatch" as const; }
    const start = sub.currentPeriodEnd && sub.currentPeriodEnd.getTime() > now.getTime() - 3 * 86_400_000 ? sub.currentPeriodEnd : now;
    const end = addInterval(start, interval as Interval);
    await issueInvoice(tx, { ...sub, planId, interval, amountMinor: amount }, { paymentKey: payment.id, grossMinor: amount, creditMinor: 0, periodStart: start, periodEnd: end, now, method });
    await tx.subscription.update({
      where: { id: sub.id },
      data: { state: "ACTIVE", currentPeriodStart: start, currentPeriodEnd: end, nextChargeAt: end, failedCount: 0, firstFailedAt: null, graceUntil: null, dunningSent: 0, paymentMethodLabel: method, chargeRaisedAt: null,
        ...(applyPending ? { planId, interval, amountMinor: amount, pendingPlanId: null, pendingInterval: null } : {}) },
    });
    await applySubscriptionState(tx, sub.businessId, now);
    return "renewed" as const;
  }, TX);
  await finish(notice, toCancel, deps);
  return out;
}

/** A replacement card was authenticated with no payment yet (it starts at the period end): it inherits the paid period and the old subscription is cancelled. */
export async function onIntlAuthenticated(rzpSubscriptionId: string, now = new Date(), deps: { client: RazorpayClient } | null = clientOrNull()): Promise<"activated" | "noop"> {
  let toCancel: string | null = null;
  const out = await prisma.$transaction(async (tx) => {
    const found = await tx.subscription.findUnique({ where: { rzpSubscriptionId } });
    if (!found || found.gateway !== "RAZORPAY" || !found.cardUpdate || !found.upgradeOfId) return "noop" as const;
    await lock(tx, found.id);
    const sub = await tx.subscription.findUniqueOrThrow({ where: { id: found.id } });
    if (sub.state !== "PENDING") return "noop" as const;
    const old = await tx.subscription.findUnique({ where: { id: sub.upgradeOfId! } });
    if (!old || old.state !== "ACTIVE" || !old.currentPeriodEnd || old.currentPeriodEnd.getTime() <= now.getTime()) return "noop" as const; // the immediate-start path pays through applyIntlPayment
    await tx.subscription.update({ where: { id: sub.id }, data: { state: "ACTIVE", currentPeriodStart: old.currentPeriodStart, currentPeriodEnd: old.currentPeriodEnd, nextChargeAt: old.currentPeriodEnd, paymentMethodLabel: old.paymentMethodLabel, pendingPlanId: old.pendingPlanId, pendingInterval: old.pendingInterval } });
    await tx.subscription.update({ where: { id: old.id }, data: { state: "ENDED", endedReason: "card_updated", pendingPlanId: null, pendingInterval: null } });
    toCancel = old.rzpSubscriptionId;
    return "activated" as const;
  }, TX);
  await finish(null, toCancel, deps);
  return out;
}

/** Razorpay gave up retrying ("halted"): past due, 7 days of grace, reminder emails on days 1, 3 and 6. Idempotent. */
export async function onIntlHalted(rzpSubscriptionId: string, now = new Date()): Promise<"past_due" | "noop"> {
  const sub = await prisma.$transaction(async (tx) => {
    const found = await tx.subscription.findUnique({ where: { rzpSubscriptionId } });
    if (!found || found.gateway !== "RAZORPAY") return null;
    await lock(tx, found.id);
    const s = await tx.subscription.findUniqueOrThrow({ where: { id: found.id } });
    if (s.state !== "ACTIVE") return null;
    const firstFailedAt = now;
    const updated = await tx.subscription.update({ where: { id: s.id }, data: { state: "PAST_DUE", failedCount: { increment: 1 }, firstFailedAt, graceUntil: graceEnd(firstFailedAt), dunningSent: 0 } });
    await applySubscriptionState(tx, s.businessId, now);
    return updated;
  }, TX);
  if (!sub) return "noop";
  return "past_due";
}

/** Cancelled or completed at Razorpay. Paid access runs to the end of the period already paid for; nothing more is charged. */
export async function onIntlEnded(rzpSubscriptionId: string, now = new Date()): Promise<"ended" | "noop"> {
  const found = await prisma.subscription.findUnique({ where: { rzpSubscriptionId } });
  if (!found || found.gateway !== "RAZORPAY" || found.state === "ENDED") return "noop";
  if (found.state === "PENDING") { await prisma.subscription.updateMany({ where: { id: found.id, state: "PENDING" }, data: { state: "ENDED", endedReason: "cancelled_before_payment" } }); return "ended"; }
  await prisma.$transaction(async (tx) => {
    await lock(tx, found.id);
    await tx.subscription.update({ where: { id: found.id }, data: { state: "ENDED", endedReason: "cancelled", pendingPlanId: null, pendingInterval: null } });
    await applySubscriptionState(tx, found.businessId, now);
  }, TX);
  await sendNotice(found, "cancelled", { dateLabel: found.currentPeriodEnd ? dateLabel(found.currentPeriodEnd) : undefined });
  return "ended";
}

/** A fallback payment link was paid (the first period, or a renewal): the link's notes name the subscription, and the link must be the one on record. */
export async function onIntlLinkPaid(link: { id: string; notes: Record<string, string> }, payment: RzpPayment | null, now = new Date()): Promise<Result> {
  const calvyId = link.notes.calvySubscription;
  if (!calvyId || !payment) return "noop";
  const sub = await prisma.subscription.findFirst({ where: { cashfreeSubscriptionId: calvyId, gateway: "RAZORPAY", billingMode: "LINKS" } });
  if (!sub || sub.renewalLinkId !== link.id) return "noop";
  const r = await applyIntlPayment({ calvyId }, payment, now, null);
  if (r === "activated" || r === "renewed") await prisma.subscription.updateMany({ where: { id: sub.id }, data: { renewalLinkId: null, renewalLinkUrl: null, renewalForPeriodStart: null, linkRemindersSent: 0 } });
  return r;
}

/** The checkout page reported success: verify its signature, then ask Razorpay what the subscription is and apply it (so the plan is active before the webhook arrives). */
export async function confirmIntlCheckout(i: { paymentId: string; razorpaySubscriptionId: string; signature: string }, now = new Date()): Promise<"confirmed" | "invalid" | "pending"> {
  const c = razorpayConfig();
  if (!c.ok || !verifyCheckoutSignature(i.paymentId, i.razorpaySubscriptionId, i.signature, c.config.keySecret)) return "invalid";
  const sub = await prisma.subscription.findUnique({ where: { rzpSubscriptionId: i.razorpaySubscriptionId } });
  if (!sub || sub.gateway !== "RAZORPAY") return "invalid";
  // The payment's amount and status come from Razorpay, never from the browser.
  const client = makeRazorpayClient(c.config);
  const remote = await client.fetchSubscription(i.razorpaySubscriptionId).catch(() => null);
  if (!remote) return "pending";
  const paid = await fetchPayment(c.config.keyId, c.config.keySecret, i.paymentId);
  if (paid) { const r = await applyIntlPayment({ rzpSubscriptionId: i.razorpaySubscriptionId }, paid, now); if (r === "activated" || r === "renewed") return "confirmed"; }
  if (sub.cardUpdate) { const r = await onIntlAuthenticated(i.razorpaySubscriptionId, now); if (r === "activated") return "confirmed"; }
  return "pending";
}

async function fetchPayment(keyId: string, keySecret: string, paymentId: string): Promise<RzpPayment | null> {
  try {
    const res = await fetch(`https://api.razorpay.com/v1/payments/${encodeURIComponent(paymentId)}`, { headers: { Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}` } });
    if (!res.ok) return null;
    const p = await res.json();
    return typeof p.id === "string" && typeof p.amount === "number" ? { id: p.id, amountMinor: p.amount, currency: String(p.currency ?? "").toUpperCase(), status: String(p.status ?? ""), method: p.method ?? null } : null;
  } catch { return null; }
}

/** Dispatch one verified webhook event. Always safe to repeat. */
export async function handleRazorpayEvent(ev: RzpEvent, now = new Date()): Promise<string> {
  switch (ev.kind) {
    case "AUTHENTICATED": case "ACTIVATED": case "CHARGED": {
      if (!ev.subscriptionId) return "no_subscription";
      if (ev.payment) return applyIntlPayment({ rzpSubscriptionId: ev.subscriptionId }, ev.payment, now);
      return ev.kind === "AUTHENTICATED" || ev.kind === "ACTIVATED" ? onIntlAuthenticated(ev.subscriptionId, now) : "noop";
    }
    case "HALTED": return ev.subscriptionId ? onIntlHalted(ev.subscriptionId, now) : "no_subscription";
    case "CANCELLED": case "COMPLETED": return ev.subscriptionId ? onIntlEnded(ev.subscriptionId, now) : "no_subscription";
    case "LINK_PAID": return ev.link ? onIntlLinkPaid(ev.link, ev.payment, now) : "no_link";
    default: return "ignored";
  }
}

// ── The cron: dunning, the end of grace, links mode, scheduled cancels and downgrades ──
export interface RazorpayDueSummary { dunning: number; ended: number; links: number; reminders: number; cancelsSent: number }

async function sendDunning(sub: Subscription, now: Date): Promise<number> {
  if (sub.state !== "PAST_DUE" || !sub.firstFailedAt) return 0;
  const due = dunningDue({ firstFailedAt: sub.firstFailedAt, dunningSent: sub.dunningSent, lastChargeRetryAt: null, now }, RZP_DUNNING_DAYS);
  if (!due) return 0;
  const claimed = await prisma.subscription.updateMany({ where: { id: sub.id, dunningSent: sub.dunningSent }, data: { dunningSent: due } });
  if (claimed.count !== 1) return 0;
  await sendNotice(sub, `payment_failed_${due}` as "payment_failed_1", {
    amountLabel: usd(sub.amountMinor), dateLabel: sub.graceUntil ? dateLabel(sub.graceUntil) : undefined, version: `dunning:${due}:${sub.firstFailedAt.toISOString().slice(0, 10)}`,
    ...(sub.billingMode === "LINKS" && sub.renewalLinkUrl ? { linkUrl: sub.renewalLinkUrl } : {}),
  });
  return 1;
}

export async function processRazorpayDue(now = new Date(), deps: { client: RazorpayClient } | null = clientOrNull()): Promise<RazorpayDueSummary> {
  const s: RazorpayDueSummary = { dunning: 0, ended: 0, links: 0, reminders: 0, cancelsSent: 0 };
  const day = 86_400_000;

  // 1. Past due: reminder emails (days 1, 3, 6) and the end of the 7-day grace: the business drops to the Free plan's features (data kept).
  const pastDue = await prisma.subscription.findMany({ where: { gateway: "RAZORPAY", state: "PAST_DUE" }, take: 200 });
  for (const sub of pastDue) {
    if (sub.graceUntil && now >= sub.graceUntil) {
      await prisma.$transaction(async (tx) => { await lock(tx, sub.id); await tx.subscription.update({ where: { id: sub.id }, data: { state: "ENDED", endedReason: "payment_failed" } }); await applySubscriptionState(tx, sub.businessId, now); }, TX);
      if (sub.rzpSubscriptionId) { try { await deps?.client.cancelSubscription(sub.rzpSubscriptionId, false); } catch (e) { logger.error("[Razorpay] cancel after grace failed", { err: e }); } }
      await sendNotice(sub, "downgraded", { version: `downgraded:${sub.firstFailedAt?.toISOString().slice(0, 10) ?? ""}` });
      s.ended++;
      continue;
    }
    s.dunning += await sendDunning(sub, now);
  }

  const active = await prisma.subscription.findMany({ where: { gateway: "RAZORPAY", state: "ACTIVE", currentPeriodEnd: { not: null } }, take: 500 });
  for (const sub of active) {
    const end = sub.currentPeriodEnd!;
    const left = end.getTime() - now.getTime();

    // 2. LINKS mode: a payment link 7 days ahead, reminders at 3 and 1 day, past due when the period ends unpaid.
    if (sub.billingMode === "LINKS") {
      if (left <= 0) {
        await prisma.$transaction(async (tx) => {
          await lock(tx, sub.id);
          const cur = await tx.subscription.findUniqueOrThrow({ where: { id: sub.id } });
          if (cur.state !== "ACTIVE") return;
          await tx.subscription.update({ where: { id: sub.id }, data: { state: "PAST_DUE", firstFailedAt: now, graceUntil: graceEnd(now), dunningSent: 0, failedCount: { increment: 1 } } });
          await applySubscriptionState(tx, sub.businessId, now);
        }, TX);
        continue;
      }
      if (sub.pendingPlanId === "free") continue; // cancelled at period end: no more links
      if (left <= 7 * day && sub.renewalForPeriodStart?.getTime() !== end.getTime() && deps) {
        const next = sub.pendingPlanId && isPaidPlan(sub.pendingPlanId) && sub.pendingInterval ? { planId: sub.pendingPlanId, interval: sub.pendingInterval as Interval } : { planId: sub.planId as PaidPlanId, interval: sub.interval as Interval };
        const amount = intlPlanAmountMinor(next.planId, next.interval);
        const biz = await prisma.business.findUnique({ where: { id: sub.businessId }, select: { name: true, email: true, owner: { select: { name: true, email: true } } } });
        const email = biz?.email?.trim() || biz?.owner?.email;
        if (biz && email) {
          try {
            const link = await deps.client.createPaymentLink({ amountMinor: amount, description: `Calvy ${planName(next.planId)} renewal for ${biz.name}`, referenceId: `${sub.id}${end.getTime()}`.replace(/\W/g, "").slice(-40), customer: { name: biz.owner?.name ?? biz.name, email }, notes: { calvySubscription: sub.cashfreeSubscriptionId, businessId: sub.businessId }, expireBy: unix(new Date(end.getTime() + 8 * day)) });
            const planChange = next.planId !== sub.planId || next.interval !== sub.interval;
            await prisma.subscription.update({ where: { id: sub.id }, data: { renewalLinkId: link.id, renewalLinkUrl: link.shortUrl, renewalForPeriodStart: end, linkRemindersSent: 1, ...(planChange ? { planId: next.planId, interval: next.interval, amountMinor: amount, pendingPlanId: null, pendingInterval: null } : {}) } });
            await sendNotice(sub, "renewal_link", { amountLabel: usd(amount), dateLabel: dateLabel(end), linkUrl: link.shortUrl, version: `link:${end.toISOString().slice(0, 10)}:1` });
            s.links++;
          } catch (e) { logger.error("[Razorpay] renewal link failed", { err: e, subscriptionId: sub.id }); }
        }
      } else if (sub.renewalLinkUrl && sub.renewalForPeriodStart?.getTime() === end.getTime()) {
        const step = sub.linkRemindersSent === 1 && left <= 3 * day ? 2 : sub.linkRemindersSent === 2 && left <= day ? 3 : 0;
        if (step) {
          const claimed = await prisma.subscription.updateMany({ where: { id: sub.id, linkRemindersSent: sub.linkRemindersSent }, data: { linkRemindersSent: step } });
          if (claimed.count === 1) { await sendNotice(sub, "renewal_link", { amountLabel: usd(sub.amountMinor), dateLabel: dateLabel(end), linkUrl: sub.renewalLinkUrl, version: `link:${end.toISOString().slice(0, 10)}:${step}` }); s.reminders++; }
        }
      }
      continue;
    }

    // 3. RECURRING: a scheduled cancel or downgrade is sent to Razorpay in the last 2 days (until then "undo" is possible), at the cycle end.
    if (left <= 2 * day && !sub.chargeRaisedAt && sub.rzpSubscriptionId && deps) {
      try {
        if (sub.pendingPlanId === "free") {
          await deps.client.cancelSubscription(sub.rzpSubscriptionId, true);
          await prisma.subscription.update({ where: { id: sub.id }, data: { chargeRaisedAt: now } });
          s.cancelsSent++;
        } else if (sub.pendingPlanId && isPaidPlan(sub.pendingPlanId) && sub.pendingInterval) {
          await deps.client.updateSubscriptionPlan(sub.rzpSubscriptionId, await ensurePlan(prisma, deps.client, sub.pendingPlanId, sub.pendingInterval as Interval));
          await prisma.subscription.update({ where: { id: sub.id }, data: { chargeRaisedAt: now } });
        }
      } catch (e) { logger.error("[Razorpay] could not schedule the change", { err: e, subscriptionId: sub.id }); }
    }
    // A cancel that Razorpay's own event never confirmed is closed a day after the period ends.
    if (left < -day && sub.pendingPlanId === "free") {
      await prisma.$transaction(async (tx) => { await lock(tx, sub.id); await tx.subscription.update({ where: { id: sub.id }, data: { state: "ENDED", endedReason: "cancelled", pendingPlanId: null, pendingInterval: null } }); await applySubscriptionState(tx, sub.businessId, now); }, TX);
      s.ended++;
    }
  }

  // 4. A card update nobody finished within a day is abandoned (the old subscription never stopped).
  await prisma.subscription.updateMany({ where: { gateway: "RAZORPAY", state: "PENDING", createdAt: { lte: new Date(now.getTime() - day) } }, data: { state: "ENDED", endedReason: "abandoned" } });
  return s;
}

/** The next billing step for the Billing page. */
export async function intlStatus(db: Db, businessId: string) {
  const sub = await currentSubscription(db, businessId);
  return sub && sub.gateway === "RAZORPAY" ? { mode: sub.billingMode, linkUrl: sub.renewalLinkUrl, reason: sub.linksReason } : null;
}
