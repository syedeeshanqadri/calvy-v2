import { safeRoute } from "@/lib/api";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCustomer } from "@/lib/customerSession";
import { signVerifiedTicket } from "@/lib/verifiedLimits";
import { publicSiteUrl } from "@/lib/siteBase";

export const dynamic = "force-dynamic";

/**
 * "Book again" from My bookings. A signed-in, verified customer is sent to the business's booking page with the service chosen
 * and a signed ticket that marks the booking as a verified customer's (so the verified limits, set in Admin, apply to it).
 */
async function GET_handler(req: NextRequest) {
  const me = await getCustomer();
  if (!me?.verified) return NextResponse.redirect(new URL("/my/login", req.url));
  const slug = (req.nextUrl.searchParams.get("business") ?? "").slice(0, 100);
  const business = await prisma.business.findUnique({ where: { slug }, select: { slug: true } });
  if (!business) return NextResponse.redirect(new URL("/my", req.url));
  const url = new URL(`${publicSiteUrl(business.slug, process.env.NEXT_PUBLIC_ROOT_DOMAIN || "calvy.io")}/book-now`);
  const service = (req.nextUrl.searchParams.get("service") ?? "").slice(0, 64);
  if (service) url.searchParams.set("service", service);
  url.searchParams.set("vt", signVerifiedTicket(me.id));
  return NextResponse.redirect(url);
}

export const GET = safeRoute(GET_handler);
