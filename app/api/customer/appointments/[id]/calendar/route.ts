import { safeRoute } from "@/lib/api";
import { NextRequest, NextResponse } from "next/server";
import { getCustomer } from "@/lib/customerSession";
import { rateLimit } from "@/lib/ratelimit";
import { findOwned } from "@/lib/customerAppointments";
import { icsAttachment } from "@/lib/notifications/ics";

export const dynamic = "force-dynamic";

// "Add to calendar" on the customer's own upcoming booking: the same .ics invite the confirmation email carries. Only for the signed-in, verified customer who owns it.
async function GET_handler(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const me = await getCustomer();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!me.verified) return NextResponse.json({ error: "Please verify your email first." }, { status: 403 });
  const rl = await rateLimit(`customer-ics:${me.id}`, 30, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Too many requests." }, { status: 429, headers: { "Retry-After": String(rl.retryAfter) } });
  const { id } = await props.params;
  const a = await findOwned(me.email, id);
  if (!a || !["confirmed", "pending"].includes(a.status)) return NextResponse.json({ error: "Booking not found." }, { status: 404 });
  const ics = icsAttachment({ appointmentId: a.id, serviceName: a.service.name, businessName: a.business.name, staffName: a.staff?.name, durationMinutes: a.duration, start: a.date });
  return new NextResponse(Buffer.from(ics.content, "base64").toString("utf-8"), {
    headers: { "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": 'attachment; filename="appointment.ics"', "Cache-Control": "private, no-store" },
  });
}

export const GET = safeRoute(GET_handler);
