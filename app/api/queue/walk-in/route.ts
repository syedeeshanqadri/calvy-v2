import { safeRoute } from "@/lib/api";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { addWalkIn } from "@/lib/queueDb";
import { queueContext, queueError } from "@/lib/queueApi";
import { dateField, id, parseBody, phoneField, text } from "@/lib/validation/common";

export const dynamic = "force-dynamic";

const body = z.object({
  sessionId: id,
  date: dateField,
  name: text(120).min(1, "Enter the customer's name"),
  phone: phoneField,
  serviceId: id.optional(),
  /** "Send WhatsApp updates (customer agreed verbally)": recorded as DESK consent with this staff user and the time. */
  whatsappConsent: z.boolean().optional(),
});

// Walk-in token: name + phone, no email, no fee, last in the queue.
async function POST_handler(req: NextRequest) {
  const ctx = await queueContext();
  if (!ctx.ok) return ctx.res;
  const parsed = await parseBody(req, body);
  if (!parsed.ok) return parsed.res;
  try {
    return NextResponse.json(await addWalkIn(ctx.biz, { ...parsed.data, consentBy: ctx.userId }), { status: 201 });
  } catch (e) {
    return queueError(e);
  }
}

export const POST = safeRoute(POST_handler);
