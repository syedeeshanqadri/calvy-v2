import { NextResponse } from "next/server";
import { accessSession } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { QueueRequestError, type QueueBusiness } from "@/lib/queueDb";
import { safeTimeZone } from "@/lib/time";

type Ctx =
  | { ok: true; biz: QueueBusiness & { plan: string; planStatus: string; trialEndsAt: Date | null } }
  | { ok: false; res: NextResponse };

/** Signed-in business that runs on tokens, or the error response to return. */
export async function queueContext(): Promise<Ctx> {
  const session = await accessSession("queue.control");
  const businessId = session?.user?.businessId;
  if (!businessId) return { ok: false, res: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const b = await prisma.business.findUnique({
    where: { id: businessId },
    select: { id: true, name: true, timezone: true, packId: true, termsOverride: true, currency: true, bookingMode: true, plan: true, planStatus: true, trialEndsAt: true },
  });
  if (!b) return { ok: false, res: NextResponse.json({ error: "Business not found" }, { status: 404 }) };
  if (b.bookingMode !== "TOKEN") {
    return { ok: false, res: NextResponse.json({ error: "The queue is only available when booking mode is Tokens." }, { status: 409 }) };
  }
  return { ok: true, biz: { ...b, timezone: safeTimeZone(b.timezone) } };
}

/** Turn a QueueRequestError into its HTTP response; rethrow anything else. */
export function queueError(e: unknown): NextResponse {
  if (e instanceof QueueRequestError) return NextResponse.json({ error: e.message }, { status: e.status });
  throw e;
}
