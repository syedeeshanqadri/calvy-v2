import { safeRoute } from "@/lib/api";
import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/ratelimit";
import { customerProfileSchema } from "@/lib/validation/customer";
import { readJsonBody, parseWith, tooManyRequests } from "@/lib/auth-http";
import { getCustomer } from "@/lib/customerSession";

export const dynamic = "force-dynamic";

// Customers only: an owner or guest session has no customer id and gets 401.
async function PATCH_handler(req: NextRequest) {
  const me = await getCustomer();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = await rateLimit(`customer-profile:${me.id}`, 10, 15 * 60_000);
  if (!rl.ok) return tooManyRequests(rl.retryAfter);

  const body = await readJsonBody(req);
  if (!body.ok) return body.res;
  const parsed = parseWith(customerProfileSchema, body.data);
  if (!parsed.ok) return parsed.res;
  const { name, currentPassword, newPassword } = parsed.data;

  const data: { name?: string; password?: string; passwordChangedAt?: Date } = {};
  if (name) data.name = name;
  if (newPassword) {
    const row = await prisma.customer.findUnique({ where: { id: me.id }, select: { password: true } });
    if (!row || !(await bcrypt.compare(currentPassword!, row.password))) {
      return NextResponse.json({ error: "Your current password is not correct." }, { status: 400 });
    }
    data.password = await bcrypt.hash(newPassword, 12);
    data.passwordChangedAt = new Date();
  }
  if (Object.keys(data).length > 0) await prisma.customer.update({ where: { id: me.id }, data });
  return NextResponse.json({ ok: true });
}

export const PATCH = safeRoute(PATCH_handler);
