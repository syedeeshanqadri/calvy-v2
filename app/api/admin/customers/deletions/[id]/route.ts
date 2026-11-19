import { requireAdminApi, cleanReason } from "@/lib/admin/auth";
import { safeRoute } from "@/lib/api";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { parseBody } from "@/lib/validation/common";
import { adminAudit } from "@/lib/admin/audit";
import { anonymiseCustomer, cancelDeletion } from "@/lib/accountDeletion";

export const dynamic = "force-dynamic";

const body = z.object({ action: z.enum(["process", "cancel"]), reason: z.string().max(500) });

/**
 * Process a deletion request now (skipping the rest of the 30 days) or cancel it. Both are audited with the reason, in the same transaction.
 * The audit entry names the request and the customer's id, never their email or phone. Processing refuses while bookings are upcoming.
 */
async function POST_handler(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const gate = await requireAdminApi();
  if (!gate.ok) return gate.res;
  const parsed = await parseBody(req, body);
  if (!parsed.ok) return parsed.res;
  const reason = cleanReason(parsed.data.reason);
  if (!reason) return NextResponse.json({ error: "Give a reason of at least 8 characters." }, { status: 400 });

  const request = await prisma.customerDeletionRequest.findUnique({ where: { id }, select: { id: true, customerId: true, status: true } });
  if (!request || request.status !== "PENDING") return NextResponse.json({ error: "This request is not pending." }, { status: 404 });

  if (parsed.data.action === "cancel") {
    await prisma.$transaction(async (tx) => {
      await cancelDeletion(tx, { customerId: request.customerId }, `admin:${gate.ctx.user.id}`, reason);
      await adminAudit(tx, gate.ctx.user, { action: "customer.deletion_cancelled", reason, detail: { request: request.id, customer: request.customerId } });
    });
    return NextResponse.json({ ok: true });
  }

  const result = await prisma.$transaction(async (tx) => {
    const r = await anonymiseCustomer(tx, request.customerId, `admin:${gate.ctx.user.id}`);
    if (r === "done") await adminAudit(tx, gate.ctx.user, { action: "customer.deletion_processed", reason, detail: { request: request.id, customer: request.customerId } });
    return r;
  }, { timeout: 30_000 });
  if (result === "blocked") return NextResponse.json({ error: "This customer has upcoming bookings again, so they cannot be deleted yet.", code: "UPCOMING_BOOKINGS" }, { status: 409 });
  if (result !== "done") return NextResponse.json({ error: "Nothing to process." }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export const POST = safeRoute(POST_handler);
