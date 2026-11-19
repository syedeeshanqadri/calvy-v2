// Calvy plan subscriptions: the pure rules (prices, proration, periods, invoice numbers, GST, mandate limits, failed-payment
// schedule, and which plan a subscription gives a business). No database, no network: every money and state decision is tested here.
import { REGION_PRICING } from "@/lib/pricing";
import { gstSplit } from "@/lib/receiptTax";

export type PaidPlanId = "professional" | "business";
export type Interval = "MONTHLY" | "YEARLY";
export const PAID_PLANS: readonly PaidPlanId[] = ["professional", "business"];
export const INTERVALS: readonly Interval[] = ["MONTHLY", "YEARLY"];
export const isPaidPlan = (v: unknown): v is PaidPlanId => typeof v === "string" && (PAID_PLANS as readonly string[]).includes(v);
export const isInterval = (v: unknown): v is Interval => v === "MONTHLY" || v === "YEARLY";

/** Rank for upgrade / downgrade decisions: free < professional < business, monthly < yearly only matters for equal plans. */
const PLAN_RANK: Record<string, number> = { free: 0, professional: 1, business: 2 };

/** Price of a paid plan per cycle in paise (GST inclusive), from the rupee price list (lib/pricing.ts), never hard-coded here. */
export function planAmountMinor(planId: PaidPlanId, interval: Interval): number {
  const p = REGION_PRICING.IN.plans.find((x) => x.id === planId);
  if (!p) throw new Error(`No price for plan ${planId}`);
  return Math.round((interval === "YEARLY" ? p.yearlyTotal : p.monthly) * 100);
}

/** International (USD) price of a paid plan per cycle in cents, from the dollar price list (lib/pricing.ts INTL). Yearly is the price billed once a year. */
export function intlPlanAmountMinor(planId: PaidPlanId, interval: Interval): number {
  const p = REGION_PRICING.INTL.plans.find((x) => x.id === planId);
  if (!p) throw new Error(`No price for plan ${planId}`);
  return Math.round((interval === "YEARLY" ? p.yearlyTotal : p.monthly) * 100);
}

/** The price list of the billing gateway's region: rupees via Cashfree, dollars via Razorpay. */
export const planPriceFor = (gateway: "CASHFREE" | "RAZORPAY", planId: PaidPlanId, interval: Interval): number =>
  gateway === "RAZORPAY" ? intlPlanAmountMinor(planId, interval) : planAmountMinor(planId, interval);

export function planName(planId: string): string {
  return REGION_PRICING.IN.plans.find((x) => x.id === planId)?.name ?? planId;
}

export type ChangeKind = "new" | "upgrade" | "downgrade" | "same" | "interval_change";

/** What picking `to` means for a business currently on `from` (free = none). Same plan, other interval: a monthly -> yearly switch is an upgrade (pays more up front). */
export function classifyChange(from: { planId: string; interval: Interval } | null, to: { planId: PaidPlanId; interval: Interval }): ChangeKind {
  if (!from || from.planId === "free") return "new";
  const a = PLAN_RANK[from.planId] ?? 0, b = PLAN_RANK[to.planId] ?? 0;
  if (b > a) return "upgrade";
  if (b < a) return "downgrade";
  if (from.interval === to.interval) return "same";
  return to.interval === "YEARLY" ? "upgrade" : "downgrade";
}

/** Add whole months / years in UTC, clamping the day (31 Jan + 1 month = 28/29 Feb), so a monthly cycle never drifts. */
export function addInterval(from: Date, interval: Interval, count = 1): Date {
  const months = (interval === "YEARLY" ? 12 : 1) * count;
  const y = from.getUTCFullYear(), m = from.getUTCMonth() + months, d = from.getUTCDate();
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m, Math.min(d, lastDay), from.getUTCHours(), from.getUTCMinutes(), from.getUTCSeconds(), from.getUTCMilliseconds()));
}

/**
 * Credit for the unused part of the current paid period when upgrading: price x remaining / total, in paise, ROUNDED UP so the customer
 * gets the benefit of the rounding (at most 1 paisa more than exact), never more than they paid and never negative.
 */
export function proratedCreditMinor(i: { paidMinor: number; periodStart: Date; periodEnd: Date; now: Date }): number {
  const total = i.periodEnd.getTime() - i.periodStart.getTime();
  const left = i.periodEnd.getTime() - i.now.getTime();
  if (total <= 0 || left <= 0 || i.paidMinor <= 0) return 0;
  const frac = Math.min(1, left / total);
  return Math.min(i.paidMinor, Math.max(0, Math.ceil(i.paidMinor * frac)));
}

/** UPI and card authorisations need at least Rs 1 (Cashfree): the first charge of an upgrade never goes below it. */
export const MIN_AUTH_MINOR = 100;

export interface UpgradeQuote {
  grossMinor: number;
  creditMinor: number;
  /** What the customer pays now. */
  dueMinor: number;
}

export function quoteUpgrade(i: { newAmountMinor: number; credit: { paidMinor: number; periodStart: Date; periodEnd: Date } | null; now: Date }): UpgradeQuote {
  const credit = i.credit ? proratedCreditMinor({ ...i.credit, now: i.now }) : 0;
  // The credit can cover at most all but Rs 1 of the new price (the mandate authorisation needs a real payment).
  const creditMinor = Math.min(credit, Math.max(0, i.newAmountMinor - MIN_AUTH_MINOR));
  return { grossMinor: i.newAmountMinor, creditMinor, dueMinor: i.newAmountMinor - creditMinor };
}

/* ── Mandate limits (RBI: no extra authentication up to Rs 15,000 per debit for UPI Autopay and cards) ── */
export const NO_AFA_LIMIT_MINOR = 15_000 * 100;

export interface MandateCheck { amountMinor: number; needsExtraAuth: boolean; note: string | null }

/** The mandate maximum for a plan is exactly its price; above the no-extra-authentication limit the customer must authenticate each debit (or use a bank e-mandate). */
export function mandateCheck(amountMinor: number): MandateCheck {
  const needsExtraAuth = amountMinor > NO_AFA_LIMIT_MINOR;
  return {
    amountMinor, needsExtraAuth,
    note: needsExtraAuth ? "This amount is above Rs 15,000, so your bank asks for an extra authentication (UPI PIN or card OTP) on each debit. A bank e-mandate has no such limit." : null,
  };
}

/** Every paid plan and interval whose price exceeds the no-extra-authentication limit (reported to the owner, shown in the UI). */
export function plansAboveNoAfaLimit(): { planId: PaidPlanId; interval: Interval; amountMinor: number }[] {
  const out: { planId: PaidPlanId; interval: Interval; amountMinor: number }[] = [];
  for (const planId of PAID_PLANS) for (const interval of INTERVALS) {
    const amountMinor = planAmountMinor(planId, interval);
    if (amountMinor > NO_AFA_LIMIT_MINOR) out.push({ planId, interval, amountMinor });
  }
  return out;
}

/* ── Invoices ── */

/** Indian financial year (April to March) of a date in IST, as "2026-27". */
export function financialYear(at: Date): string {
  const ist = new Date(at.getTime() + 330 * 60_000);
  const y = ist.getUTCFullYear(), month = ist.getUTCMonth(); // 0 = Jan
  const start = month >= 3 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}

export const invoiceNumber = (fy: string, seq: number) => `CALVY/${fy}/${String(seq).padStart(4, "0")}`;

/** GST (India), IGST (export of services without an LUT), LUT (export under a Letter of Undertaking: no tax line). */
export type TaxKind = "GST" | "IGST" | "LUT";

export interface InvoiceLines {
  kind: "TAX_INVOICE" | "RECEIPT";
  taxKind: TaxKind;
  grossMinor: number;
  creditMinor: number;
  /** A plan coupon, shown as its own line. */
  couponMinor: number;
  amountMinor: number;
  taxableMinor: number;
  gstMinor: number;
  gstRate: number;
}

/**
 * With a GSTIN: a tax invoice, the amount paid split into taxable value and GST (prices are GST inclusive). Without one: a plain receipt,
 * no GST line (taxable = total, GST = 0), because Calvy may not be GST registered yet.
 */
export function invoiceLines(i: { grossMinor: number; creditMinor: number; couponMinor?: number; gstin: string | null; gstRatePercent: number; taxKind?: TaxKind }): InvoiceLines {
  const couponMinor = Math.max(0, i.couponMinor ?? 0);
  const taxKind = i.taxKind ?? "GST";
  const amountMinor = Math.max(0, i.grossMinor - i.creditMinor - couponMinor);
  if (!i.gstin) return { kind: "RECEIPT", taxKind, grossMinor: i.grossMinor, creditMinor: i.creditMinor, couponMinor, amountMinor, taxableMinor: amountMinor, gstMinor: 0, gstRate: 0 };
  // An export under an LUT carries no tax line at all; otherwise (GST or IGST) the price is tax inclusive and is split.
  if (taxKind === "LUT") return { kind: "TAX_INVOICE", taxKind, grossMinor: i.grossMinor, creditMinor: i.creditMinor, couponMinor, amountMinor, taxableMinor: amountMinor, gstMinor: 0, gstRate: 0 };
  const { baseMinor, gstMinor } = gstSplit(amountMinor, i.gstRatePercent);
  return { kind: "TAX_INVOICE", taxKind, grossMinor: i.grossMinor, creditMinor: i.creditMinor, couponMinor, amountMinor, taxableMinor: baseMinor, gstMinor, gstRate: i.gstRatePercent };
}

/** The tax treatment of an invoice: India is GST; international is zero-rated under an LUT when one is set, otherwise IGST (never decided by currency). */
export const taxKindFor = (gateway: string, lutNumber: string | null): TaxKind => (gateway === "RAZORPAY" ? (lutNumber ? "LUT" : "IGST") : "GST");

/* ── Failed payments ── */
export const GRACE_DAYS = 7;
/** Dunning emails go out on days 0, 3 and 6 after the first failure; the charge is retried on days 2 and 5. */
export const DUNNING_DAYS = [0, 3, 6] as const;
export const RETRY_DAYS = [2, 5] as const;
/** Razorpay (international): the plan is "halted" after its own retries, then 7 days of grace with reminder emails on days 1, 3 and 6. */
export const RZP_DUNNING_DAYS = [1, 3, 6] as const;
const DAY = 86_400_000;

export function graceEnd(firstFailedAt: Date): Date {
  return new Date(firstFailedAt.getTime() + GRACE_DAYS * DAY);
}

export interface DunningState { firstFailedAt: Date; dunningSent: number; lastChargeRetryAt: Date | null; now: Date }

/** Which dunning email (1-3) is due now, or null. Sent in order, never twice. */
export function dunningDue(s: DunningState, days: readonly number[] = DUNNING_DAYS): 1 | 2 | 3 | null {
  const next = s.dunningSent;
  if (next >= days.length) return null;
  const due = s.firstFailedAt.getTime() + days[next] * DAY;
  return s.now.getTime() >= due ? ((next + 1) as 1 | 2 | 3) : null;
}

/** Whether to raise the charge again now: on the retry days, once each. */
export function retryDue(s: DunningState): boolean {
  const since = s.now.getTime() - s.firstFailedAt.getTime();
  const slots = RETRY_DAYS.filter((d) => since >= d * DAY);
  if (!slots.length) return false;
  const latest = s.firstFailedAt.getTime() + Math.max(...slots) * DAY;
  return !s.lastChargeRetryAt || s.lastChargeRetryAt.getTime() < latest;
}

/* ── Which plan the subscription gives the business ── */
export interface SubscriptionView {
  state: "PENDING" | "AUTHORISED" | "ACTIVE" | "PAST_DUE" | "ENDED";
  planId: string;
  currentPeriodEnd: Date | null;
  graceUntil: Date | null;
}

export type DesiredPlan = { plan: string; planStatus: string } | { plan: "free"; planStatus: "free" } | null;

/**
 * The plan a business should be on because of its subscription. null = leave the business alone (pending or never paid).
 * ACTIVE: its plan. PAST_DUE: still its plan during the 7-day grace, then Basic (data kept, paid features off).
 * ENDED: Basic once the paid period is over; an ended-by-upgrade subscription never reaches this (the new one decides).
 */
export function desiredPlan(s: SubscriptionView, now: Date): DesiredPlan {
  if (s.state === "PENDING" || s.state === "AUTHORISED") return null;
  if (s.state === "ACTIVE") return { plan: s.planId, planStatus: "active" };
  if (s.state === "PAST_DUE") {
    return s.graceUntil && now.getTime() < s.graceUntil.getTime() ? { plan: s.planId, planStatus: "active" } : { plan: "free", planStatus: "free" };
  }
  // ENDED
  if (s.currentPeriodEnd && now.getTime() < s.currentPeriodEnd.getTime()) return { plan: s.planId, planStatus: "active" };
  return { plan: "free", planStatus: "free" };
}

/** An admin plan override is in force: it wins and the subscription never changes the business's plan meanwhile. */
export function overrideActive(b: { planOverridePlan?: string | null; planOverrideUntil?: Date | null }, now: Date): boolean {
  if (!b.planOverridePlan) return false;
  return !b.planOverrideUntil || b.planOverrideUntil.getTime() > now.getTime();
}
