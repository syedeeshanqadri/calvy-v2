import { safeRoute } from "@/lib/api";
import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getEffectiveLimits } from "@/lib/getFeatures";
import { sendBookingReminder } from "@/lib/email";
import { sendReminderWhatsApp } from "@/lib/whatsapp";
import { sendPushToBusiness } from "@/lib/push";
import { logger } from "@/lib/logger";
import { meetingUrlFor } from "@/lib/online";
import { bookingForLabel } from "@/lib/patients";
import { releaseExpiredHolds } from "@/lib/onlinePayment";
import { safeTimeZone, utcToZoned, addDays, formatDateLabel, formatTimeLabel } from "@/lib/time";

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

async function GET_handler(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // "Tomorrow" is each business's own calendar day, so fetch a wide UTC window
  // (now → +49h covers tomorrow in every zone) and keep the rows whose local
  // date is exactly one day after the business's local today.
  const now = new Date();
  const candidates = await prisma.appointment.findMany({
    where: {
      date: { gte: now, lt: new Date(now.getTime() + 49 * 3_600_000) },
      reminderSent: false,
      // Unpaid holds never get reminders; they are confirmed (or expire) first.
      status: { notIn: ["cancelled", "no-show", "pending_payment", "expired"] },
    },
    include: { client: true, service: true, business: true, staff: { select: { meetingUrl: true } } },
  });
  const appointments = candidates.filter((a) => {
    const tz = safeTimeZone(a.business.timezone);
    return utcToZoned(a.date, tz).date === addDays(utcToZoned(now, tz).date, 1);
  });

  let sent = 0;
  const results = await Promise.allSettled(
    appointments.map(async (appt) => {
      const tz = safeTimeZone(appt.business.timezone);
      const dateLabel = formatDateLabel(appt.date, tz);
      const timeLabel = formatTimeLabel(appt.date, tz);

      // Client reminders (email + WhatsApp) — best effort, never block the others.
      // sendBookingReminder resolves { ok } (ok=false when skipped/failed).
      // sendReminderWhatsApp resolves void and swallows its own errors, so a
      // WhatsApp send can only be counted as "attempted" (it did not throw).
      // Rule: reminderSent = true only if the email was delivered, or (no email
      // on file) the WhatsApp attempt did not throw, or the client has neither
      // channel (nothing to send; avoids retry loops).
      // The plan decides which reminder channels exist (a lapsed plan counts as Free). A channel the plan
      // does not include is skipped, and with no channel left there is nothing to send or retry.
      const limits = await getEffectiveLimits(appt.business);
      const hasEmail = !!appt.client.email && limits.emailReminders;
      const hasPhone = !!appt.client.phone && limits.whatsappReminders;
      let delivered = !hasEmail && !hasPhone;
      if (hasEmail) {
        const res = await sendBookingReminder({
          to: appt.client.email!,
          clientName: appt.client.name,
          patientName: appt.patientName ?? undefined,
          businessName: appt.business.name,
          serviceName: appt.service.name,
          terms: appt.business,
          online: appt.isOnline ? { meetingUrl: meetingUrlFor(appt) } : undefined,
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
          patientName: appt.patientName ?? undefined,
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
        body: `${bookingForLabel(appt)} — ${appt.service.name} tomorrow at ${timeLabel}`,
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
  // Unpaid online-payment holds past their expiry: mark them expired (reads already ignore them).
  const expiredHolds = await releaseExpiredHolds().catch((e) => {
    logger.error("[Cron] hold sweep failed:", { err: e });
    return -1;
  });
  return NextResponse.json({ ok: true, found: appointments.length, sent, failed, expiredHolds });
}

export const GET = safeRoute(GET_handler);
