import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendBookingReminder } from "@/lib/email";
import { sendReminderWhatsApp } from "@/lib/whatsapp";
import { sendPushToBusiness } from "@/lib/push";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Runs once daily (see vercel.json — Hobby plans only allow daily crons).
// Reminds every appointment scheduled for the *next calendar day*: email +
// WhatsApp to the client, and a push to the business owner. reminderSent
// guarantees each appointment is reminded at most once.
/**
 * Fails closed: in production a missing CRON_SECRET rejects every call.
 * In non-production an unset secret is allowed so local/dev runs can hit the route.
 * When set, `Authorization: Bearer <secret>` is compared in constant time.
 */
function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  const auth = req.headers.get("authorization") ?? "";
  const expected = Buffer.from(`Bearer ${secret}`);
  const given = Buffer.from(auth);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
      // sendBookingReminder resolves { ok } (ok=false when skipped/failed).
      // sendReminderWhatsApp resolves void and swallows its own errors, so a
      // WhatsApp send can only be counted as "attempted" (it did not throw).
      // Rule: reminderSent = true only if the email was delivered, or (no email
      // on file) the WhatsApp attempt did not throw, or the client has neither
      // channel (nothing to send; avoids retry loops).
      const hasEmail = !!appt.client.email;
      const hasPhone = !!appt.client.phone;
      let delivered = !hasEmail && !hasPhone;
      if (hasEmail) {
        const res = await sendBookingReminder({
          to: appt.client.email,
          clientName: appt.client.name,
          businessName: appt.business.name,
          serviceName: appt.service.name,
          date: dateLabel,
          time: timeLabel,
          ctx: { appointmentId: appt.id, businessId: appt.businessId },
        }).catch((e) => {
          logger.error("[Cron] reminder email failed:", { err: e });
          return { ok: false };
        });
        if (res.ok) delivered = true;
      }
      if (hasPhone) {
        let attempted = true;
        await sendReminderWhatsApp({
          to: appt.client.phone!,
          clientName: appt.client.name,
          serviceName: appt.service.name,
          time: timeLabel,
        }).catch((e) => {
          attempted = false;
          logger.error("[Cron] reminder WhatsApp failed:", { err: e });
        });
        if (attempted && !hasEmail) delivered = true;
      }

      // Push to the business owner's dashboard/PWA.
      await sendPushToBusiness(appt.businessId, {
        title: "Appointment reminder",
        body: `${appt.client.name} — ${appt.service.name} tomorrow at ${timeLabel}`,
        url: "/dashboard/appointments",
        tag: `reminder-${appt.id}`,
      }).catch((e) => logger.error("[Cron] reminder push failed:", { err: e }));

      if (delivered) {
        await prisma.appointment.update({
          where: { id: appt.id },
          data: { reminderSent: true },
        });
        sent++;
      } else {
        logger.warn("cron: reminder not delivered; will stay unsent", { appointmentId: appt.id });
      }
    })
  );

  const failed = results.filter((r) => r.status === "rejected").length;
  return NextResponse.json({ ok: true, found: appointments.length, sent, failed });
}
