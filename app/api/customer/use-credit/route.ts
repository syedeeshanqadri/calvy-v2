import { safeRoute } from "@/lib/api";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCustomer } from "@/lib/customerSession";
import { creditOfferFromQuery, signCreditTicket } from "@/lib/creditDb";
import { publicSiteUrl } from "@/lib/siteBase";

export const dynamic = "force-dynamic";

/**
 * "Use credit" from My wallet. The signed-in, verified customer gets a one-hour ticket for their wallet at one
 * business and is sent to that business's booking page. The ticket, not a typed email, is what lets credit be spent.
 */
async function GET_handler(req: NextRequest) {
  const me = await getCustomer();
  if (!me?.verified) return NextResponse.redirect(new URL("/my/login", req.url));

  const slug = (req.nextUrl.searchParams.get("business") ?? "").slice(0, 100);
  const business = await prisma.business.findUnique({ where: { slug }, select: { id: true, slug: true, currency: true } });
  if (!business) return NextResponse.redirect(new URL("/my/wallet", req.url));

  const ticket = signCreditTicket(me.id, business.id);
  // Only send them on if there really is credit to use.
  if (!(await creditOfferFromQuery(ticket, business))) return NextResponse.redirect(new URL("/my/wallet", req.url));

  const url = new URL(`${publicSiteUrl(business.slug, process.env.NEXT_PUBLIC_ROOT_DOMAIN || "calvy.io")}/book-now`);
  url.searchParams.set("credit", ticket);
  return NextResponse.redirect(url);
}

export const GET = safeRoute(GET_handler);
