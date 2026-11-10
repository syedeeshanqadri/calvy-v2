import { safeRoute } from "@/lib/api";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { twoFaUser } from "@/lib/admin/auth";
import { generateTotpSecret, otpauthUri } from "@/lib/admin/totp";
import { decryptSecret, encryptSecret } from "@/lib/notifications/secret";

export const dynamic = "force-dynamic";

/** First-time setup: make (or show again) the pending authenticator secret. Refused once 2FA is enabled. */
async function POST_handler() {
  const u = await twoFaUser();
  if (!u) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (u.adminTotpEnabledAt) return NextResponse.json({ error: "Two-factor sign-in is already set up." }, { status: 400 });
  let secret = u.adminTotpSecret ? decryptSecret(u.adminTotpSecret) : "";
  if (!secret) {
    secret = generateTotpSecret();
    await prisma.user.update({ where: { id: u.id }, data: { adminTotpSecret: encryptSecret(secret) } });
  }
  return NextResponse.json({ secret: secret.match(/.{1,4}/g)?.join(" "), otpauth: otpauthUri(secret, u.email) });
}

export const POST = safeRoute(POST_handler);
