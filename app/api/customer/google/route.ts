import { safeRoute } from "@/lib/api";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { oauthEnabled } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getCustomer } from "@/lib/customerSession";
import { CUSTOMER_LINK_COOKIE, LINK_TTL_MS, signCustomerLinkIntent } from "@/lib/googleLink";

export const dynamic = "force-dynamic";

/** Is Google available, and already linked, for the signed-in customer? */
async function GET_handler() {
  const me = await getCustomer();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const row = await prisma.customer.findUnique({ where: { id: me.id }, select: { googleId: true } });
  return NextResponse.json({ enabled: oauthEnabled.google, linked: !!row?.googleId });
}

/** Start "Link Google": a signed, 10-minute cookie ties the next customer Google sign-in to this signed-in customer. */
async function POST_handler() {
  const me = await getCustomer();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!oauthEnabled.google) return NextResponse.json({ error: "Google sign-in is not configured." }, { status: 400 });
  const row = await prisma.customer.findUnique({ where: { id: me.id }, select: { googleId: true } });
  if (row?.googleId) return NextResponse.json({ error: "Google is already linked." }, { status: 400 });
  (await cookies()).set(CUSTOMER_LINK_COOKIE, signCustomerLinkIntent(me.id, process.env.NEXTAUTH_SECRET ?? ""), {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: LINK_TTL_MS / 1000,
  });
  return NextResponse.json({ ok: true });
}

export const GET = safeRoute(GET_handler);
export const POST = safeRoute(POST_handler);
