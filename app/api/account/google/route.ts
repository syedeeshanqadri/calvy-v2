import { safeRoute } from "@/lib/api";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getServerSession } from "next-auth";
import { authOptions, oauthEnabled } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { LINK_COOKIE, LINK_TTL_MS, signLinkIntent } from "@/lib/googleLink";

export const dynamic = "force-dynamic";

async function currentUser() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || session.user.kind === "customer") return null;
  return prisma.user.findUnique({ where: { id: session.user.id }, select: { id: true, googleId: true, password: true } });
}

/** Is Google available, and already linked, for the logged-in user? */
async function GET_handler() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ enabled: oauthEnabled.google, linked: !!user.googleId });
}

/** Start "Link Google": a signed, 10-minute cookie ties the next Google sign-in to this logged-in user. */
async function POST_handler() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!oauthEnabled.google) return NextResponse.json({ error: "Google sign-in is not configured." }, { status: 400 });
  if (user.googleId) return NextResponse.json({ error: "Google is already linked." }, { status: 400 });
  (await cookies()).set(LINK_COOKIE, signLinkIntent(user.id, process.env.NEXTAUTH_SECRET ?? ""), {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: LINK_TTL_MS / 1000,
  });
  return NextResponse.json({ ok: true });
}

export const GET = safeRoute(GET_handler);
export const POST = safeRoute(POST_handler);
