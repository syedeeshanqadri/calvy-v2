import { safeRoute } from "@/lib/api";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rateLimit, clientIp } from "@/lib/ratelimit";
import { consumeMemberLink } from "@/lib/memberLink";
import { setDeviceCookie } from "@/lib/verifiedDevice";
import { signVerifiedTicket } from "@/lib/verifiedLimits";
import { publicSiteUrl } from "@/lib/siteBase";

export const dynamic = "force-dynamic";

/**
 * The emailed member link, opened. Redeems the single-use token, remembers this device for 90 days and sends the customer back to the
 * business's booking page with a signed ticket, so the member price is there. The destination is built from a business that exists,
 * never from the request, so this cannot be used as an open redirect.
 */
async function GET_handler(req: NextRequest) {
  const rl = await rateLimit(`member-link-open:${clientIp(req)}`, 20, 10 * 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Too many tries." }, { status: 429, headers: { "Retry-After": String(rl.retryAfter) } });
  const slug = (req.nextUrl.searchParams.get("business") ?? "").slice(0, 100);
  const token = (req.nextUrl.searchParams.get("token") ?? "").slice(0, 100);
  const service = (req.nextUrl.searchParams.get("service") ?? "").slice(0, 64);
  const business = await prisma.business.findUnique({ where: { slug }, select: { slug: true } });
  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || "calvy.io";
  if (!business) return NextResponse.redirect(new URL("/account/login", req.url));
  const back = new URL(`${publicSiteUrl(business.slug, rootDomain)}/book`);
  const r = await consumeMemberLink(prisma, token);
  if (!r) {
    // Expired or already used: back to the booking page as a guest, with a flag so it can say so.
    back.searchParams.set("link", "expired");
    return NextResponse.redirect(back);
  }
  await setDeviceCookie(r.customerId);
  if (service) back.searchParams.set("service", service);
  back.searchParams.set("vt", signVerifiedTicket(r.customerId));
  return NextResponse.redirect(back);
}

export const GET = safeRoute(GET_handler);
