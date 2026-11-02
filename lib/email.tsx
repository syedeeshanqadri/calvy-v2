import { t, type TermsSource } from "@/lib/terms";
import * as React from "react";
import { Resend } from "resend";
import { render } from "@react-email/render";
import { formatCurrencyAmount, DEFAULT_CURRENCY } from "@/lib/currency";
import {
  BookingConfirmationEmail,
  MeetingLinkEmail,
  BookingReminderEmail,
  BookingCancellationEmail,
  BookingRescheduleEmail,
  QueueMovedBackEmail,
  QueueClosedEmail,
  InvoiceEmail,
  EmailVerificationEmail,
  LeadAcknowledgmentEmail,
  type BookingProps,
} from "@/emails/templates";
import type { TenantBrand } from "@/emails/EmailLayout";
import { absoluteAssetUrl } from "@/lib/storage";
import { safeThemeColor, readableForeground } from "@/lib/theme";

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

interface Attachment { filename: string; content: Buffer; contentType: string }

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

/* ── ICS calendar invite ──────────────────────────────────────────── */
function formatICSDate(d: Date): string {
  return d.toISOString().replace(/[-:.]/g, "").slice(0, 15) + "Z";
}
function icsAttachment(d: { serviceName: string; businessName: string; staffName?: string; durationMinutes: number; start: Date }): Attachment {
  const end = new Date(d.start.getTime() + d.durationMinutes * 60_000);
  const uid = `${d.start.getTime()}-${Math.random().toString(36).slice(2)}@calvy.io`;
  const fromEmail = FROM.match(/<(.+)>/)?.[1] ?? "noreply@calvy.io";
  const ics = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Calvy//Booking//EN", "CALSCALE:GREGORIAN", "METHOD:REQUEST",
    "BEGIN:VEVENT", `UID:${uid}`, `DTSTART:${formatICSDate(d.start)}`, `DTEND:${formatICSDate(end)}`,
    `SUMMARY:${d.serviceName} at ${d.businessName}`,
    `DESCRIPTION:Your appointment for ${d.serviceName}${d.staffName ? ` with ${d.staffName}` : ""} at ${d.businessName}.`,
    `ORGANIZER;CN=${d.businessName}:mailto:${fromEmail}`,
    "STATUS:CONFIRMED", "SEQUENCE:0",
    "BEGIN:VALARM", "TRIGGER:-PT60M", "ACTION:DISPLAY", "DESCRIPTION:Reminder: Your appointment is in 1 hour", "END:VALARM",
    "END:VEVENT", "END:VCALENDAR",
  ].join("\r\n");
  return { filename: "appointment.ics", content: Buffer.from(ics, "utf-8"), contentType: "text/calendar; charset=utf-8; method=REQUEST" };
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

const apptWord = (terms?: TermsSource) => t(terms ?? {}, "appointment");

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
      ? [icsAttachment({ serviceName: d.serviceName, businessName: d.businessName, staffName: d.staffName, durationMinutes: d.duration, start: d.appointmentDate })]
      : undefined,
  });
}

export async function sendBookingReminder(d: {
  to: string; clientName: string; patientName?: string; businessName: string; serviceName: string;
  date: string; time: string; staffName?: string; duration?: number; price?: number; currency?: string; terms?: TermsSource; online?: { meetingUrl: string | null }; ctx?: EmailContext;
}) {
  const tenant = await tenantBrand(d.ctx?.businessId, d.businessName);
  return dispatch({
    to: d.to, type: "reminder", ctx: d.ctx,
    subject: `Reminder: ${d.serviceName} tomorrow at ${d.time}`,
    react: <BookingReminderEmail clientName={d.clientName} patientName={d.patientName} businessName={d.businessName} serviceName={d.serviceName} date={d.date} time={d.time} staffName={d.staffName} duration={d.duration} price={d.price} currency={d.currency} terms={d.terms} online={d.online} tenant={tenant} />,
  });
}

export async function sendMeetingLinkAdded(d: BookingDetails & { meetingUrl: string; updated: boolean }) {
  const tenant = await tenantBrand(d.ctx?.businessId, d.businessName);
  return dispatch({
    to: d.to, type: "meeting_link", ctx: d.ctx,
    subject: d.updated ? `Your joining link has changed — ${d.businessName}` : `Your joining link for ${d.date} at ${d.time} — ${d.businessName}`,
    react: <MeetingLinkEmail {...bookingProps(d)} tenant={tenant} meetingUrl={d.meetingUrl} updated={d.updated} />,
  });
}

export async function sendBookingCancellation(d: BookingDetails & { rebookUrl?: string }) {
  const tenant = await tenantBrand(d.ctx?.businessId, d.businessName);
  return dispatch({
    to: d.to, type: "cancellation", ctx: d.ctx,
    subject: `Your ${apptWord(d.terms)} at ${d.businessName} was cancelled`,
    react: <BookingCancellationEmail {...bookingProps(d)} tenant={tenant} rebookUrl={d.rebookUrl} />,
  });
}

export async function sendBookingReschedule(d: BookingDetails & { oldDate: string; oldTime: string }) {
  const tenant = await tenantBrand(d.ctx?.businessId, d.businessName);
  return dispatch({
    to: d.to, type: "reschedule", ctx: d.ctx,
    subject: `Your ${apptWord(d.terms)} was moved to ${d.date} at ${d.time}`,
    react: <BookingRescheduleEmail {...bookingProps(d)} tenant={tenant} oldDate={d.oldDate} oldTime={d.oldTime} />,
  });
}

export async function sendQueueMovedBack(d: BookingDetails & { place: number }) {
  const tenant = await tenantBrand(d.ctx?.businessId, d.businessName);
  return dispatch({
    to: d.to, type: "queue_moved_back", ctx: d.ctx,
    subject: `You are now #${d.place} in line at ${d.businessName}`,
    react: <QueueMovedBackEmail {...bookingProps(d)} tenant={tenant} place={d.place} />,
  });
}

export async function sendQueueClosed(d: BookingDetails & { reason: "missed" | "cancelled"; creditLabel?: string; loginUrl?: string }) {
  const tenant = await tenantBrand(d.ctx?.businessId, d.businessName);
  return dispatch({
    to: d.to, type: d.reason === "missed" ? "queue_missed" : "queue_cancelled", ctx: d.ctx,
    subject: d.reason === "missed" ? `You missed your ${apptWord(d.terms)} at ${d.businessName}` : `Your ${apptWord(d.terms)} at ${d.businessName} was cancelled`,
    react: <QueueClosedEmail {...bookingProps(d)} tenant={tenant} reason={d.reason} creditLabel={d.creditLabel} loginUrl={d.loginUrl} />,
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

export function sendVerificationEmail({ to, name, token }: { to: string; name: string; token: string }) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://calvy.io";
  return dispatch({
    to, type: "verification",
    subject: "Verify your Calvy account",
    react: <EmailVerificationEmail name={name} verifyUrl={`${appUrl}/verify-email?token=${token}`} />,
  });
}

export function sendLeadAcknowledgment({ to, name, demoRequested }: { to: string; name: string; demoRequested: boolean }) {
  return dispatch({
    to, type: "lead",
    subject: demoRequested ? "Your Calvy demo is booked" : "Thanks for reaching out to Calvy",
    react: <LeadAcknowledgmentEmail name={name} demoRequested={demoRequested} />,
  });
}

// Imported here (not in the header list) to keep this change append-only.
import { PasswordResetEmail, CustomerVerifyEmail, CustomerResetEmail } from "@/emails/templates";
import { logger } from "@/lib/logger";
import { SUPPORT_EMAIL } from "@/lib/site";
import { randomUUID } from "crypto";
import { notify } from "@/lib/notifications/enqueue";
import type { FormNotificationPayload } from "@/lib/notifications/templates";

export function sendPasswordResetEmail({ to, name, token, baseUrl }: { to: string; name: string; token: string; baseUrl?: string }) {
  const appUrl = baseUrl ?? process.env.NEXT_PUBLIC_APP_URL ?? "https://calvy.io";
  return dispatch({
    to, type: "password_reset",
    subject: "Reset your Calvy password",
    react: <PasswordResetEmail name={name} resetUrl={`${appUrl}/reset-password?token=${token}`} />,
  });
}

/** Customer accounts: links go to /my, never to the owner screens. */
export function sendCustomerVerificationEmail({ to, name, token, baseUrl }: { to: string; name: string; token: string; baseUrl?: string }) {
  const appUrl = baseUrl ?? process.env.NEXT_PUBLIC_APP_URL ?? "https://calvy.io";
  return dispatch({
    to, type: "customer_verification",
    subject: "Verify your email",
    react: <CustomerVerifyEmail name={name} verifyUrl={`${appUrl}/my/verify-email?token=${token}`} />,
  });
}

export function sendCustomerPasswordResetEmail({ to, name, token, baseUrl }: { to: string; name: string; token: string; baseUrl?: string }) {
  const appUrl = baseUrl ?? process.env.NEXT_PUBLIC_APP_URL ?? "https://calvy.io";
  return dispatch({
    to, type: "customer_password_reset",
    subject: "Reset your password",
    react: <CustomerResetEmail name={name} resetUrl={`${appUrl}/my/reset-password?token=${token}`} />,
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
