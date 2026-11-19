// Business-funded offers (pure, no database). They apply automatically at booking, on paid plans, and are paid for by the business.
// One business discount per booking: the better of ONE business coupon and ONE offer, never stacked (see bestBusinessDiscount).
import { discountFor } from "@/lib/coupons/rules";

export type OfferKind = "NTH_VISIT" | "HAPPY_HOUR" | "BUNDLE";
export const OFFER_KINDS: readonly OfferKind[] = ["NTH_VISIT", "HAPPY_HOUR", "BUNDLE"];

export interface OfferDef {
  id: string;
  kind: string;
  name: string;
  percent: number;
  nth: number | null;
  days: number[];
  startMinute: number | null;
  endMinute: number | null;
  serviceIds: string[];
  startsAt: Date | null;
  endsAt: Date | null;
  active: boolean;
  showOnSite: boolean;
}

export interface OfferContext {
  services: { id: string; priceMinor: number }[];
  /** Business-local day of week (0 = Sunday) and minutes from midnight of the start time; null for a token booking (no clock time). */
  local: { dow: number; minutes: number } | null;
  /** Visits this person has already ATTENDED at this business; null when unknown (no email yet). */
  completedVisits: number | null;
  now: Date;
}

const sum = (xs: { priceMinor: number }[]) => xs.reduce((a, s) => a + Math.max(0, s.priceMinor), 0);
const covered = (o: OfferDef, services: OfferContext["services"]) => services.filter((s) => o.serviceIds.length === 0 || o.serviceIds.includes(s.id));

/** How much this offer takes off, in minor units; 0 when it does not apply. */
export function offerDiscount(o: OfferDef, ctx: OfferContext): number {
  if (!o.active) return 0;
  if (o.startsAt && ctx.now < o.startsAt) return 0;
  if (o.endsAt && ctx.now >= o.endsAt) return 0;
  if (o.percent < 1 || o.percent > 100) return 0;
  if (o.kind === "NTH_VISIT") {
    // Attended visits only: the Nth visit is the one after N-1 attended ones.
    if (!o.nth || o.nth < 2 || ctx.completedVisits === null) return 0;
    if ((ctx.completedVisits + 1) % o.nth !== 0) return 0;
    return discountFor("PERCENT", o.percent, sum(covered(o, ctx.services)));
  }
  if (o.kind === "HAPPY_HOUR") {
    if (!ctx.local || o.startMinute === null || o.endMinute === null) return 0;
    if (o.days.length > 0 && !o.days.includes(ctx.local.dow)) return 0;
    if (ctx.local.minutes < o.startMinute || ctx.local.minutes >= o.endMinute) return 0;
    return discountFor("PERCENT", o.percent, sum(covered(o, ctx.services)));
  }
  if (o.kind === "BUNDLE") {
    if (o.serviceIds.length < 2) return 0;
    const booked = new Set(ctx.services.map((s) => s.id));
    if (!o.serviceIds.every((id) => booked.has(id))) return 0;
    return discountFor("PERCENT", o.percent, sum(ctx.services.filter((s) => o.serviceIds.includes(s.id))));
  }
  return 0;
}

/** The single best offer for this booking (the largest discount; ties go to the earlier-listed offer). */
export function bestOffer(offers: OfferDef[], ctx: OfferContext): { offer: OfferDef; discountMinor: number } | null {
  let best: { offer: OfferDef; discountMinor: number } | null = null;
  for (const o of offers) {
    const d = offerDiscount(o, ctx);
    if (d > 0 && (!best || d > best.discountMinor)) best = { offer: o, discountMinor: d };
  }
  return best;
}

export type BusinessDiscount =
  | { source: "COUPON"; discountMinor: number; couponId: string }
  | { source: "OFFER"; discountMinor: number; offerId: string; offerName: string }
  | { source: null; discountMinor: 0 };

/** One business discount per booking: the better of a valid business coupon and the best offer. Never both; on a tie the automatic offer wins and the code is kept. */
export function bestBusinessDiscount(coupon: { couponId: string; discountMinor: number } | null, offer: { offer: OfferDef; discountMinor: number } | null): BusinessDiscount {
  if (offer && (!coupon || offer.discountMinor >= coupon.discountMinor)) return { source: "OFFER", discountMinor: offer.discountMinor, offerId: offer.offer.id, offerName: offer.offer.name };
  if (coupon && coupon.discountMinor > 0) return { source: "COUPON", discountMinor: coupon.discountMinor, couponId: coupon.couponId };
  return { source: null, discountMinor: 0 };
}

/** A short plain description for the website and booking page. */
export function offerSummary(o: Pick<OfferDef, "kind" | "percent" | "nth" | "days" | "startMinute" | "endMinute">): string {
  const DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const hhmm = (m: number | null) => (m === null ? "" : `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`);
  if (o.kind === "NTH_VISIT") return `${o.percent}% off every ${ordinal(o.nth ?? 0)} visit`;
  if (o.kind === "HAPPY_HOUR") return `${o.percent}% off, ${o.days.length ? o.days.map((d) => DAY[d]).join(", ") : "every day"} ${hhmm(o.startMinute)} to ${hhmm(o.endMinute)}`;
  return `${o.percent}% off when you book these together`;
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"], v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}
