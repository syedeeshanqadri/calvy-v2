// Business discounts (database side): the better of ONE business coupon and the best offer, for a booking at a paid-plan business.
// Rules live in ./rules.ts and ../coupons/rules.ts. Nothing here spends anything: the booking route takes the coupon use inside its transaction.
import type { Prisma } from "@prisma/client";
import type { prisma } from "@/lib/prisma";
import { tryNormalizeEmail } from "@/lib/email-normalize";
import { normalizePhone } from "@/lib/phone";
import { safeTimeZone, utcToZoned } from "@/lib/time";
import { allocateDiscount } from "@/lib/coupons/rules";
import { findCoupon, previewCoupon } from "@/lib/coupons/service";
import { toMinorUnits, fromMinorUnits } from "@/lib/currency";
import { bestBusinessDiscount, bestOffer, offerSummary, type OfferDef } from "./rules";

type Db = Prisma.TransactionClient | typeof prisma;

/** Visits this person has ATTENDED (marked completed) at this business, matched by email or phone. */
export async function attendedVisits(db: Db, p: { businessId: string; email?: string | null; phone?: string | null; tz?: string | null }): Promise<number> {
  const email = tryNormalizeEmail(p.email) || null;
  const phone = normalizePhone(p.phone, p.tz);
  const who = [...(email ? [{ email: { equals: email, mode: "insensitive" as const } }] : []), ...(phone ? [{ phone }] : [])];
  if (who.length === 0) return 0;
  return db.appointment.count({ where: { businessId: p.businessId, status: "completed", client: { OR: who } } });
}

export async function activeOffers(db: Db, businessId: string): Promise<OfferDef[]> {
  return (await db.businessOffer.findMany({ where: { businessId, active: true }, orderBy: { createdAt: "asc" } })) as OfferDef[];
}

export interface ServiceLine { id: string; price: number }
export type Resolved =
  | {
      ok: true;
      discountMinor: number;
      source: "COUPON" | "OFFER" | null;
      /** The typed code was a business coupon (so Calvy's fee side must not look at it). */
      codeConsumed: boolean;
      /** The code was valid but a better offer was applied, so it is kept for later. */
      codeKept: boolean;
      coupon: { couponId: string; code: string } | null;
      offer: { id: string; name: string } | null;
    }
  | { ok: false; error: string };

export async function resolveBusinessDiscount(db: Db, i: {
  business: { id: string; timezone: string | null; currency: string | null };
  offersEnabled: boolean;
  services: ServiceLine[];
  /** The appointment start; null for a token booking (no clock time, so happy hours cannot apply). */
  start: Date | null;
  customer: { email?: string | null; phone?: string | null };
  couponCode?: string | null;
  now?: Date;
}): Promise<Resolved> {
  const now = i.now ?? new Date();
  const none = { ok: true as const, discountMinor: 0, source: null, codeConsumed: false, codeKept: false, coupon: null, offer: null };
  if (!i.offersEnabled) return none;
  const tz = safeTimeZone(i.business.timezone);
  const lines = i.services.map((s) => ({ id: s.id, priceMinor: toMinorUnits(s.price, i.business.currency) }));
  const code = i.couponCode?.trim() || null;

  // A typed code that is one of THIS business's coupons is judged here; any other code is left for Calvy's fee side.
  let coupon: { couponId: string; code: string; discountMinor: number } | null = null;
  let codeConsumed = false;
  if (code && (await findCoupon(db, i.business.id, code))) {
    codeConsumed = true;
    const { coupon: def, verdict } = await previewCoupon(db, { ownerKey: i.business.id, code, ctx: { target: "SERVICE", businessId: i.business.id, services: lines }, customer: { ...i.customer, tz }, now });
    if (!def || !verdict.ok) return { ok: false, error: verdict.ok ? "This code is not valid." : verdict.message };
    coupon = { couponId: def.id, code: def.code, discountMinor: verdict.discountMinor };
  }

  const offers = await activeOffers(db, i.business.id);
  const completedVisits = offers.some((o) => o.kind === "NTH_VISIT") && (i.customer.email || i.customer.phone) ? await attendedVisits(db, { businessId: i.business.id, ...i.customer, tz }) : null;
  const z = i.start ? utcToZoned(i.start, tz) : null;
  const offer = bestOffer(offers, { services: lines, local: z ? { dow: z.weekday, minutes: z.minutes } : null, completedVisits, now });

  const best = bestBusinessDiscount(coupon, offer);
  return {
    ok: true,
    discountMinor: best.discountMinor,
    source: best.source,
    codeConsumed,
    codeKept: !!coupon && best.source === "OFFER",
    coupon: best.source === "COUPON" && coupon ? { couponId: coupon.couponId, code: coupon.code } : null,
    offer: best.source === "OFFER" ? { id: best.offerId, name: best.offerName } : null,
  };
}

/** Spread a discount over the services in proportion to price; prices stay in the business currency (whole units, to its decimals). */
export function priceAfterDiscount(services: ServiceLine[], discountMinor: number, currency: string | null | undefined): number[] {
  const minor = services.map((s) => toMinorUnits(s.price, currency));
  const parts = allocateDiscount(minor, discountMinor);
  return minor.map((m, idx) => fromMinorUnits(m - parts[idx], currency));
}

export interface PublicOffer { id: string; name: string; summary: string }

/** Offers this business wants shown on its website and booking page: paid plans only, switched on, inside their dates. */
export async function publicOffers(db: Db, businessId: string, offersEnabled: boolean, now = new Date()): Promise<PublicOffer[]> {
  if (!offersEnabled) return [];
  const rows = (await db.businessOffer.findMany({ where: { businessId, active: true, showOnSite: true }, orderBy: { createdAt: "asc" }, take: 6 })) as OfferDef[];
  return rows.filter((o) => (!o.startsAt || now >= o.startsAt) && (!o.endsAt || now < o.endsAt)).map((o) => ({ id: o.id, name: o.name, summary: offerSummary(o) }));
}
