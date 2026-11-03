import { safeRoute } from "@/lib/api";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCustomer } from "@/lib/customerSession";
import { followUpFromQuery, signFollowUpTicket } from "@/lib/followUpDb";
import { publicSiteUrl } from "@/lib/siteBase";
import { tryNormalizeEmail } from "@/lib/email-normalize";

export const dynamic = "force-dynamic";

/**
 * "Book free follow-up" from My bookings. The signed-in, verified customer gets a one-hour ticket for one of their
 * own completed appointments and is sent to that business's booking page with the doctor and service chosen.
 * The booking page may live on another host (a business subdomain), so the ticket, not the session, carries the proof.
 */
async function GET_handler(req: NextRequest) {
  const me = await getCustomer();
  if (!me?.verified) return NextResponse.redirect(new URL("/my/login", req.url));

  const id = (req.nextUrl.searchParams.get("appointment") ?? "").slice(0, 64);
  const a = await prisma.appointment.findFirst({
    where: { id, client: { email: { equals: me.email, mode: "insensitive" } } },
    select: { id: true, serviceId: true, business: { select: { id: true, slug: true, timezone: true, followUpDays: true } }, client: { select: { email: true } } },
  });
  if (!a || tryNormalizeEmail(a.client.email) !== tryNormalizeEmail(me.email)) return NextResponse.redirect(new URL("/my", req.url));

  const ticket = signFollowUpTicket(me.id, a.id);
  // Only send them on if there really is a follow-up on offer.
  const offer = await followUpFromQuery(ticket, a.business);
  if (!offer) return NextResponse.redirect(new URL("/my", req.url));

  const base = publicSiteUrl(a.business.slug, process.env.NEXT_PUBLIC_ROOT_DOMAIN || "calvy.io");
  const url = new URL(`${base}/book-now`);
  url.searchParams.set("service", offer.serviceId);
  url.searchParams.set("followUp", ticket);
  return NextResponse.redirect(url);
}

export const GET = safeRoute(GET_handler);
