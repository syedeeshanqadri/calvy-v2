import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
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

  await prisma.user.update({
    where: { email: vt.email },
    data: { emailVerified: new Date() },
  });

  await prisma.verificationToken.delete({ where: { token } });

  return NextResponse.redirect(`${base}/login?verified=1`);
}
