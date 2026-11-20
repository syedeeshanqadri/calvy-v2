import { safeRoute } from "@/lib/api";
import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/ratelimit";
import { getCustomer } from "@/lib/customerSession";
import { parseBody } from "@/lib/validation/common";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ password: z.string().min(8, "Please choose a password of at least 8 characters.").max(128) });

/**
 * Right after claiming, the customer may set a password (optional: the link alone always gets them back in). Only for a signed-in customer who has
 * none yet; changing an existing password stays on the profile page, which asks for the current one. The password-changed time is left alone on
 * purpose: it ends sessions, and this is the first password, not a change.
 */
async function POST_handler(req: NextRequest) {
  const me = await getCustomer();
  if (!me || !me.verified) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rl = await rateLimit(`claim-password:${me.id}`, 5, 15 * 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Too many attempts. Please wait a few minutes." }, { status: 429, headers: { "Retry-After": String(rl.retryAfter) } });
  const parsed = await parseBody(req, bodySchema);
  if (!parsed.ok) return parsed.res;
  const hashed = await bcrypt.hash(parsed.data.password, 12);
  const set = await prisma.customer.updateMany({ where: { id: me.id, password: null }, data: { password: hashed } });
  if (set.count !== 1) return NextResponse.json({ error: "This account already has a password. Change it from your profile." }, { status: 409 });
  return NextResponse.json({ ok: true });
}

export const POST = safeRoute(POST_handler);
