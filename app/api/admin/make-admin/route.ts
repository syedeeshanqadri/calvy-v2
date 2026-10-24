import { safeRoute } from "@/lib/api";
import { NextRequest, NextResponse } from "next/server";
import { isAdminUser } from "@/lib/adminAuth";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createHash, timingSafeEqual } from "crypto";
import { rateLimit, clientIp } from "@/lib/ratelimit";
import { parseBody } from "@/lib/validation/common";
import { makeAdminSchema } from "@/lib/validation/admin";

export const dynamic = 'force-dynamic';

// Grant admin role. Two allowed callers:
//   1. An existing admin (session-based), or
//   2. Bootstrap: ADMIN_SETUP_SECRET, but ONLY while no admin exists yet.
// Once an admin exists, the secret path is closed so a leaked secret can't be
// used to escalate.
/** Constant-time string comparison (hash first so lengths always match). */
function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

async function POST_handler(req: NextRequest) {
  const rl = await rateLimit(`make-admin:${clientIp(req)}`, 5, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
    );
  }

  const parsed = await parseBody(req, makeAdminSchema);
  if (!parsed.ok) return parsed.res;
  const { email, secret } = parsed.data;

  const session = await getServerSession(authOptions);
  const callerIsAdmin = isAdminUser(session?.user);

  const adminCount = await prisma.user.count({ where: { role: "admin" } });
  const setupSecret = process.env.ADMIN_SETUP_SECRET;
  const secretValid = !!secret && !!setupSecret && safeEqual(secret, setupSecret);
  const bootstrapAllowed = adminCount === 0 && secretValid;

  if (!callerIsAdmin && !bootstrapAllowed) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const target = await prisma.user.findUnique({ where: { email } });
  if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const user = await prisma.user.update({
    where: { email },
    data: { role: "admin" },
  });

  return NextResponse.json({ id: user.id, email: user.email, role: user.role });
}

export const POST = safeRoute(POST_handler);
