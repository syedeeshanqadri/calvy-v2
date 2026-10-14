import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendBookingReminder } from "@/lib/email";
import { sendReminderWhatsApp } from "@/lib/whatsapp";
import { sendPushToBusiness } from "@/lib/push";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Runs once daily (see vercel.json — Hobby plans only allow daily crons).
// Reminds every appointment scheduled for the *next calendar day*: email +
// WhatsApp to the client, and a push to the business owner. reminderSent
// guarantees each appointment is reminded at most once.
export async function GET(req: NextRequest) {
  // Vercel Cron sends `Authorization: Bearer ${CRON_SECRET}` when CRON_SECRET is set.
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  // Tomorrow, 00:00 → day-after 00:00 (UTC).
  const windowStart = new Date();
  windowStart.setUTCHours(0, 0, 0, 0);
  windowStart.setUTCDate(windowStart.getUTCDate() + 1);
  const windowEnd = new Date(windowStart);
  windowEnd.setUTCDate(windowEnd.getUTCDate() + 1);

  const appointments = await prisma.appointment.findMany({
    where: {
      date: { gte: windowStart, lt: windowEnd },
      reminderSent: false,
      status: { notIn: ["cancelled", "no-show"] },
    },
    include: { client: true, service: true, business: true },
  });

  let sent = 0;
  const results = await Promise.allSettled(
    appointments.map(async (appt) => {
      const dateLabel = appt.date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
      const timeLabel = appt.date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

      // Client reminders (email + WhatsApp) — best effort, never block the others.
      if (appt.client.email) {
        await sendBookingReminder({
          to: appt.client.email,
          clientName: appt.client.name,
          businessName: appt.business.name,
          serviceName: appt.service.name,
          date: dateLabel,
          time: timeLabel,
          ctx: { appointmentId: appt.id, businessId: appt.businessId },
        }).catch((e) => console.error("[Cron] reminder email failed:", e));
      }
      if (appt.client.phone) {
        await sendReminderWhatsApp({
          to: appt.client.phone,
          clientName: appt.client.name,
          serviceName: appt.service.name,
          time: timeLabel,
        }).catch((e) => console.error("[Cron] reminder WhatsApp failed:", e));
      }

      // Push to the business owner's dashboard/PWA.
      await sendPushToBusiness(appt.businessId, {
        title: "Appointment reminder",
        body: `${appt.client.name} — ${appt.service.name} tomorrow at ${timeLabel}`,
        url: "/dashboard/appointments",
        tag: `reminder-${appt.id}`,
      }).catch((e) => console.error("[Cron] reminder push failed:", e));

      await prisma.appointment.update({
        where: { id: appt.id },
        data: { reminderSent: true },
      });
      sent++;
    })
  );

  const failed = results.filter((r) => r.status === "rejected").length;
  return NextResponse.json({ ok: true, found: appointments.length, sent, failed });
}
