import { t, type TermsSource } from "@/lib/terms";
import * as React from "react";
import { Resend } from "resend";
import { render } from "@react-email/render";
import { formatCurrencyAmount, DEFAULT_CURRENCY } from "@/lib/currency";
import {
  BookingConfirmationEmail,
  InvoiceEmail,
  type BookingProps,
} from "@/emails/templates";
import type { TenantBrand } from "@/emails/EmailLayout";
import { absoluteAssetUrl } from "@/lib/storage";
import { safeThemeColor, readableForeground } from "@/lib/theme";
import { icsAttachment, type Attachment } from "@/lib/notifications/ics";
import { notify } from "@/lib/notifications/enqueue";
import type { FormNotificationPayload } from "@/lib/notifications/templates";
import { logger } from "@/lib/logger";
import { SUPPORT_EMAIL } from "@/lib/site";
import { randomUUID } from "crypto";

let resendClient: Resend | null = null;
function getResend() {
  if (!resendClient) resendClient = new Resend(process.env.RESEND_API_KEY);
  return resendClient;
}
const FROM = process.env.EMAIL_FROM ?? "Calvy <onboarding@resend.dev>";

function isConfigured() {
  if (!process.env.RESEND_API_KEY || process.env.RESEND_API_KEY === "re_REPLACE_ME") {
    logger.warn("email disabled: RESEND_API_KEY not set");
    return false;
  }
  return true;
}

export interface EmailContext { appointmentId?: string; businessId?: string }

/** Write a delivery-status record for every send (logged against the transaction). */
async function logEmail(d: {
  type: string; to: string; subject: string; status: "sent" | "failed" | "skipped";
  providerId?: string | null; error?: string | null; ctx?: EmailContext;
}) {
  try {
    const { prisma } = await import("@/lib/prisma");
    await prisma.emailLog.create({
      data: {
        type: d.type, to: d.to, subject: d.subject, status: d.status,
        providerId: d.providerId ?? null, error: d.error ? d.error.slice(0, 500) : null,
        appointmentId: d.ctx?.appointmentId ?? null, businessId: d.ctx?.businessId ?? null,
      },
    });
  } catch (e) {
    logger.error("[Email] log write failed:", { err: e });
  }
}

/** Render → send → log. The single path every email goes through. */
async function dispatch(opts: {
  to: string; subject: string; react: React.ReactElement; type: string;
  ctx?: EmailContext; attachments?: Attachment[];
}): Promise<{ ok: boolean; id?: string }> {
  const meta = { type: opts.type, to: opts.to, subject: opts.subject, ctx: opts.ctx };

  if (!isConfigured()) {
    await logEmail({ ...meta, status: "skipped", error: "email not configured" });
    return { ok: false };
  }

  try {
    const html = await render(opts.react);
    const result = await getResend().emails.send({
      from: FROM, to: opts.to, subject: opts.subject, html,
      attachments: opts.attachments,
    });
    if (result.error) {
      await logEmail({ ...meta, status: "failed", error: result.error.message ?? String(result.error) });
      logger.error("email rejected by provider", { type: opts.type, err: new Error(String(result.error.message ?? "unknown")) });
      return { ok: false };
    }
    await logEmail({ ...meta, status: "sent", providerId: result.data?.id });
    return { ok: true, id: result.data?.id };
  } catch (err) {
    await logEmail({ ...meta, status: "failed", error: err instanceof Error ? err.message : "send error" });
    logger.error(`[Email] ${opts.type} failed:`, { err });
    return { ok: false };
  }
}

/* ── Public senders ───────────────────────────────────────────────── */

export interface BookingDetails {
  to: string;
  clientName: string;
  businessName: string;
  serviceName: string;
  staffName: string;
  date: string;
  time: string;
  duration: number;
  price: number;
  currency?: string;
  appointmentDate?: Date; // attaches an .ics when provided
  terms?: TermsSource; // business pack wording
  token?: { number: number; estimatedTime: string; sessionName: string }; // token booking
  trackUrl?: string; // live queue page
  patientName?: string; // who the appointment is for, when not the recipient
  online?: { meetingUrl: string | null }; // online consultation; the link goes only to the booker
  ctx?: EmailContext;
}

function bookingProps(d: BookingDetails): BookingProps {
  return {
    clientName: d.clientName, businessName: d.businessName, serviceName: d.serviceName,
    staffName: d.staffName, date: d.date, time: d.time, duration: d.duration,
    price: d.price, currency: d.currency ?? DEFAULT_CURRENCY, terms: d.terms, token: d.token, trackUrl: d.trackUrl, patientName: d.patientName, online: d.online,
  };
}

/** Logo and theme colour of the business an email is sent for (null when unknown). */
async function tenantBrand(businessId: string | undefined, name: string): Promise<TenantBrand | undefined> {
  if (!businessId) return undefined;
  try {
    const { prisma } = await import("@/lib/prisma");
    const b = await prisma.business.findUnique({ where: { id: businessId }, select: { logoUrl: true, primaryColor: true, address: true, phone: true } });
    if (!b) return undefined;
    const color = safeThemeColor(b.primaryColor);
    return { name, logoUrl: absoluteAssetUrl(b.logoUrl), color, fg: readableForeground(color), address: b.address, phone: b.phone };
  } catch (e) {
    logger.error("[Email] tenant brand lookup failed:", { err: e });
    return undefined;
  }
}

export async function sendBookingConfirmation(d: BookingDetails) {
  const tenant = await tenantBrand(d.ctx?.businessId, d.businessName);
  return dispatch({
    to: d.to, type: "confirmation", ctx: d.ctx,
    subject: d.token ? `Queue number #${d.token.number} confirmed — ${d.businessName}` : `Booking confirmed — ${d.serviceName} at ${d.businessName}`,
    react: <BookingConfirmationEmail {...bookingProps(d)} tenant={tenant} />,
    attachments: d.appointmentDate
      ? [icsAttachment({ appointmentId: d.ctx?.appointmentId, serviceName: d.serviceName, businessName: d.businessName, staffName: d.staffName, durationMinutes: d.duration, start: d.appointmentDate })]
      : undefined,
  });
}

export async function sendInvoice(d: BookingDetails & { invoiceNumber: string; clientEmail: string; paymentRef?: string }) {
  const tenant = await tenantBrand(d.ctx?.businessId, d.businessName);
  return dispatch({
    to: d.to, type: "invoice", ctx: d.ctx,
    subject: `Receipt from ${d.businessName} — ${formatCurrencyAmount(d.price, d.currency ?? DEFAULT_CURRENCY)}`,
    react: <InvoiceEmail {...bookingProps(d)} tenant={tenant} invoiceNumber={d.invoiceNumber} clientEmail={d.clientEmail} paymentRef={d.paymentRef} />,
  });
}

/* ── Owner notification for form submissions ───────────────────────── */

/**
 * Tell the site owner about a form submission (lead, signup, onboarding).
 * Goes to NOTIFY_EMAIL (default: the support address) through the outbox, so it
 * is retried and logged there. Never throws: a failed notification must not break the form.
 */
export async function sendFormNotification({ title, fields }: Pick<FormNotificationPayload, "title" | "fields">): Promise<void> {
  try {
    await notify({
      event: "platform.form", audience: "PLATFORM", subjectId: randomUUID(),
      recipient: process.env.NOTIFY_EMAIL || SUPPORT_EMAIL, template: "form_notification",
      payload: { title, fields, at: new Date().toUTCString() },
    });
  } catch (err) {
    logger.error("[Email] form notification failed:", { err });
  }
}
