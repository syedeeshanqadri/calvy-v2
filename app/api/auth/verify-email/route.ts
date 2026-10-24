import { safeRoute } from "@/lib/api";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

async function GET_handler(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  const base = req.nextUrl.origin;

  if (!token) {
    return NextResponse.redirect(`${base}/login?error=invalid-token`);
  }

  const vt = await prisma.verificationToken.findUnique({ where: { token } }).catch(() => null);

  if (!vt) {
    return NextResponse.redirect(`${base}/login?error=invalid-token`);
  }

  if (vt.expiresAt < new Date()) {
    await prisma.verificationToken.delete({ where: { token } }).catch(() => null);
    return NextResponse.redirect(`${base}/login?error=expired-token`);
  }

  // Tokens store the email exactly as saved on the user; fall back to a
  // case-insensitive match for tokens issued before emails were lowercased.
  const verifyUser =
    (await prisma.user.findUnique({ where: { email: vt.email } })) ??
    (await prisma.user.findFirst({ where: { email: { equals: vt.email, mode: "insensitive" } }, orderBy: { createdAt: "asc" } }));
  if (!verifyUser) {
    await prisma.verificationToken.delete({ where: { token } }).catch(() => null);
    return NextResponse.redirect(`${base}/login?error=invalid-token`);
  }
  await prisma.user.update({
    where: { id: verifyUser.id },
    data: { emailVerified: new Date() },
  });

  await prisma.verificationToken.delete({ where: { token } });

  return NextResponse.redirect(`${base}/login?verified=1`);
}

export const GET = safeRoute(GET_handler);
