import { safeRoute } from "@/lib/api";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { parseBody, text, id, emailField } from "@/lib/validation/common";
import { rateLimit, clientIp } from "@/lib/ratelimit";
import { chargeFor, getPayConfig } from "@/lib/onlinePayment";
import { isFeatureEnabled } from "@/lib/flags";
import { isVerifiedBooker } from "@/lib/verifiedLimits";
import { resolveCalvyFee } from "@/lib/coupons/booking";

export const dynamic = "force-dynamic";

const schema = z.object({
  businessSlug: text(80).min(1),
  serviceIds: z.array(id).min(1).max(10),
  code: z.string().trim().min(1).max(40),
  email: emailField,
  phone: z.string().trim().max(30).optional(),
  verifiedTicket: z.string().max(800).optional(),
});

/**
 * What a typed code would do to this booking, without using it. The browser only shows the answer; the booking route decides again.
 * Rate limited per IP so codes cannot be guessed in bulk.
 */
async function POST_handler(req: NextRequest) {
  const rl = await rateLimit(`coupon-preview:${clientIp(req)}`, 20, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Too many tries. Please wait a moment." }, { status: 429, headers: { "Retry-After": String(rl.retryAfter) } });
  const parsed = await parseBody(req, schema);
  if (!parsed.ok) return parsed.res;
  const { businessSlug, serviceIds, code, email, phone, verifiedTicket } = parsed.data;

  const business = await prisma.business.findUnique({ where: { slug: businessSlug }, include: { services: { where: { isActive: true } } } });
  if (!business) return NextResponse.json({ error: "Business not found." }, { status: 404 });
  const chosen = serviceIds.map((sid) => business.services.find((s) => s.id === sid));
  if (chosen.some((s) => !s)) return NextResponse.json({ error: "Services not found." }, { status: 404 });

  const payConfig = isFeatureEnabled("onlinePayments") ? await getPayConfig(business) : null;
  const fullCharge = chargeFor(payConfig, chosen.map((s) => ({ serviceId: s!.id, price: s!.price })));
  const verifiedBooker = await isVerifiedBooker(prisma, [verifiedTicket], email);
  const existing = await prisma.client.findFirst({ where: { businessId: business.id, email: { equals: email.toLowerCase(), mode: "insensitive" } }, select: { id: true } });
  const r = await resolveCalvyFee(prisma, {
    businessId: business.id, clientId: existing?.id ?? null, fullCharge, verifiedBooker, customer: { email, phone, tz: business.timezone }, couponCode: code,
  });
  if (!r.ok) return NextResponse.json({ ok: false, error: r.error });
  const v = r.value;
  return NextResponse.json({
    ok: !!v.coupon,
    ...(v.coupon ? { code: v.coupon.code, discountMinor: v.coupon.discountMinor, payNowMinor: v.charge.chargeMinor } : { error: v.waived ? "You already have a free booking here, so no code is needed." : v.rewarded ? "Your loyalty reward covers the fee, so the code is kept for later." : "This code is not valid." }),
  });
}

export const POST = safeRoute(POST_handler);
