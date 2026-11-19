import { safeRoute } from "@/lib/api";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/ratelimit";
import { readJsonBody, parseWith, tooManyRequests } from "@/lib/auth-http";
import { getCustomer } from "@/lib/customerSession";
import { notify } from "@/lib/notifications/enqueue";
import { cancelDeletion, requestDeletion } from "@/lib/accountDeletion";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const requestSchema = z.object({ confirmEmail: z.string().max(254), password: z.string().max(200).optional() });
const appUrl = () => (process.env.NEXT_PUBLIC_APP_URL ?? "https://calvy.io").replace(/\/+$/, "");
const dateLabel = (d: Date) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" }).format(d);

/**
 * Request account deletion (replaces the old instant delete). The customer types their email and, if the account has a password, enters it.
 * Blocked while they have upcoming bookings. Otherwise a 30-day grace period starts and an email with a cancel link is sent.
 */
async function POST_handler(req: NextRequest) {
  const me = await getCustomer();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rl = await rateLimit(`customer-delete:${me.id}`, 5, 15 * 60_000);
  if (!rl.ok) return tooManyRequests(rl.retryAfter);
  const body = await readJsonBody(req);
  if (!body.ok) return body.res;
  const parsed = parseWith(requestSchema, body.data);
  if (!parsed.ok) return parsed.res;
  if (parsed.data.confirmEmail.trim().toLowerCase() !== me.email.toLowerCase()) {
    return NextResponse.json({ error: "Type your email address exactly to confirm." }, { status: 400 });
  }
  const row = await prisma.customer.findUnique({ where: { id: me.id }, select: { password: true } });
  if (row?.password && !(await bcrypt.compare(parsed.data.password ?? "", row.password))) {
    return NextResponse.json({ error: "Your password is not correct." }, { status: 400 });
  }

  const r = await requestDeletion(prisma, me.id);
  if (!r.ok) {
    if (r.reason === "UPCOMING") {
      return NextResponse.json({
        error: "You have upcoming bookings. Cancel them, or wait until they are done, and then request deletion.", code: "UPCOMING_BOOKINGS",
        bookings: r.bookings.map((b) => ({ businessName: b.businessName, date: b.date.toISOString() })),
      }, { status: 409 });
    }
    if (r.reason === "PENDING") return NextResponse.json({ ok: true, pending: true, executeAfter: r.executeAfter.toISOString() });
    return NextResponse.json({ error: "This account no longer exists." }, { status: 404 });
  }
  try {
    await notify({
      event: "account.deletion_requested", audience: "CUSTOMER", subjectId: me.id, version: r.executeAfter.toISOString(), recipient: me.email, template: "deletion_requested",
      payload: { name: me.name, executeAfterLabel: dateLabel(r.executeAfter) }, secret: `${appUrl()}/account/deletion/cancel?token=${r.token}`,
    });
  } catch (err) {
    logger.error("[Deletion] confirmation email failed", { err });
  }
  return NextResponse.json({ ok: true, pending: true, executeAfter: r.executeAfter.toISOString() });
}

/** Cancel a pending request from the signed-in account. */
async function DELETE_handler() {
  const me = await getCustomer();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const ok = await cancelDeletion(prisma, { customerId: me.id }, `customer:${me.id}`);
  return NextResponse.json({ ok });
}

export const POST = safeRoute(POST_handler);
export const DELETE = safeRoute(DELETE_handler);
