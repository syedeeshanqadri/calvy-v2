import { safeRoute } from "@/lib/api";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { parseBody, text, id, emailField, dateField, timeField } from "@/lib/validation/common";
import { rateLimit, clientIp } from "@/lib/ratelimit";
import { chargeFor, getPayConfig } from "@/lib/onlinePayment";
import { isFeatureEnabled } from "@/lib/flags";
import { isVerifiedBooker } from "@/lib/verifiedLimits";
import { getEffectiveLimits } from "@/lib/getFeatures";
import { LEVEL_LABEL } from "@/lib/rewards/levels";
import { resolveCalvyFee } from "@/lib/coupons/booking";
import { priceAfterDiscount, resolveBusinessDiscount } from "@/lib/offers/service";
import { safeTimeZone, zonedTimeToUtc } from "@/lib/time";
import { toMinorUnits } from "@/lib/currency";

export const dynamic = "force-dynamic";

const schema = z.object({
  businessSlug: text(80).min(1),
  serviceIds: z.array(id).min(1).max(10),
  /** Optional: without a code this only reports the automatic offer (if any). */
  code: z.string().trim().max(40).optional(),
  email: emailField,
  phone: z.string().trim().max(30).optional(),
  date: dateField.optional(),
  time: timeField.optional(),
  verifiedTicket: z.string().max(800).optional(),
});

/**
 * What the automatic offer and a typed code would do to this booking, without using anything. The browser only shows the answer;
 * the booking route decides again. Rate limited per IP so codes cannot be guessed in bulk.
 */
async function POST_handler(req: NextRequest) {
  const rl = await rateLimit(`coupon-preview:${clientIp(req)}`, 40, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Too many tries. Please wait a moment." }, { status: 429, headers: { "Retry-After": String(rl.retryAfter) } });
  const parsed = await parseBody(req, schema);
  if (!parsed.ok) return parsed.res;
  const { businessSlug, serviceIds, email, phone, date, time, verifiedTicket } = parsed.data;
  const code = parsed.data.code?.trim() || null;

  const business = await prisma.business.findUnique({ where: { slug: businessSlug }, include: { services: { where: { isActive: true } } } });
  if (!business) return NextResponse.json({ error: "Business not found." }, { status: 404 });
  const chosen = serviceIds.map((sid) => business.services.find((s) => s.id === sid));
  if (chosen.some((s) => !s)) return NextResponse.json({ error: "Services not found." }, { status: 404 });
  const services = chosen as NonNullable<(typeof chosen)[number]>[];
  const tz = safeTimeZone(business.timezone);
  const start = date && time ? zonedTimeToUtc(date, time, tz) : null;

  const limits = await getEffectiveLimits(business);
  const biz = await resolveBusinessDiscount(prisma, {
    business, offersEnabled: !!limits.offers, services: services.map((s) => ({ id: s.id, price: s.price })), start: start && !Number.isNaN(start.getTime()) ? start : null,
    customer: { email, phone }, couponCode: code,
  });
  if (!biz.ok) return NextResponse.json({ ok: false, error: biz.error });

  const prices = biz.discountMinor > 0 ? priceAfterDiscount(services.map((s) => ({ id: s.id, price: s.price })), biz.discountMinor, business.currency) : services.map((s) => s.price);
  const totalMinor = prices.reduce((sum, p) => sum + toMinorUnits(p, business.currency), 0);
  const payConfig = isFeatureEnabled("onlinePayments") ? await getPayConfig(business) : null;
  const fullCharge = chargeFor(payConfig, services.map((s, i) => ({ serviceId: s.id, price: prices[i] })));

  // The typed code goes to Calvy's Rs 10 side only when it was not one of this business's own coupons.
  let fee: { code: string; discountMinor: number; payNowMinor: number } | null = null;
  let feeError: string | null = null;
  let payNowMinor = fullCharge.chargeMinor;
  let level: { id: string; label: string; feeMinor: number } | null = null;
  const feeCode = code && !biz.codeConsumed ? code : null;
  if (feeCode || (!code && fullCharge.route === "CALVY")) {
    const verifiedBooker = await isVerifiedBooker(prisma, [verifiedTicket], email);
    const existing = await prisma.client.findFirst({ where: { businessId: business.id, email: { equals: email.toLowerCase(), mode: "insensitive" } }, select: { id: true } });
    const r = await resolveCalvyFee(prisma, { businessId: business.id, clientId: existing?.id ?? null, fullCharge, verifiedBooker, customer: { email, phone, tz }, couponCode: feeCode });
    if (!r.ok) feeError = r.error;
    else {
      payNowMinor = r.value.charge.chargeMinor;
      // The level badge and fee are only for a customer who proved their email; anyone else sees the plain fee.
      if (verifiedBooker && r.value.level && r.value.level.id !== "STARTER") level = { id: r.value.level.id, label: LEVEL_LABEL[r.value.level.id], feeMinor: r.value.level.feeMinor };
      if (r.value.coupon) fee = { code: r.value.coupon.code, discountMinor: r.value.coupon.discountMinor, payNowMinor: r.value.charge.chargeMinor };
      else if (feeCode) feeError = r.value.waived ? "You already have a free booking here, so no code is needed." : r.value.rewarded ? "Your loyalty reward covers the fee, so the code is kept for later." : "This code is not valid.";
    }
  }
  if (feeCode && !fee) return NextResponse.json({ ok: false, error: feeError ?? "This code is not valid." });

  const codeApplied = biz.coupon?.code ?? fee?.code ?? null;
  return NextResponse.json({
    ok: true,
    code: codeApplied ?? undefined,
    codeKept: biz.codeKept || undefined,
    offer: biz.offer ? { name: biz.offer.name } : undefined,
    discountMinor: biz.discountMinor,
    totalMinor,
    feeDiscountMinor: fee?.discountMinor ?? 0,
    payNowMinor,
    ...(level ? { level } : {}),
  });
}

export const POST = safeRoute(POST_handler);
