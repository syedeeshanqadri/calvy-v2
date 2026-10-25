import { t, type TermsSource } from "@/lib/terms";
import * as React from "react";
import { Resend } from "resend";
import { render } from "@react-email/render";
import { formatCurrencyAmount, DEFAULT_CURRENCY } from "@/lib/currency";
import {
  BookingConfirmationEmail,
  BookingReminderEmail,
  BookingCancellationEmail,
  BookingRescheduleEmail,
  QueueMovedBackEmail,
  QueueNoShowEmail,
  QueueMovedNextDayEmail,
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
  ctx?: EmailContext;
}

const apptWord = (terms?: TermsSource) => t(terms ?? {}, "appointment");

function bookingProps(d: BookingDetails): BookingProps {
  return {
    clientName: d.clientName, businessName: d.businessName, serviceName: d.serviceName,
    staffName: d.staffName, date: d.date, time: d.time, duration: d.duration,
    price: d.price, currency: d.currency ?? DEFAULT_CURRENCY, terms: d.terms, token: d.token,
  };
}

/** Logo and theme colour of the business an email is sent for (null when unknown). */
async function tenantBrand(businessId: string | undefined, name: string): Promise<TenantBrand | undefined> {
  if (!businessId) return undefined;
  try {
    const { prisma } = await import("@/lib/prisma");
    const b = await prisma.business.findUnique({ where: { id: businessId }, select: { logoUrl: true, primaryColor: true } });
    if (!b) return undefined;
    const color = safeThemeColor(b.primaryColor);
    return { name, logoUrl: absoluteAssetUrl(b.logoUrl), color, fg: readableForeground(color) };
  } catch (e) {
    logger.error("[Email] tenant brand lookup failed:", { err: e });
    return undefined;
  }
}

export async function sendBookingConfirmation(d: BookingDetails) {
  const tenant = await tenantBrand(d.ctx?.businessId, d.businessName);
  return dispatch({
    to: d.to, type: "confirmation", ctx: d.ctx,
    subject: d.token ? `Token #${d.token.number} confirmed — ${d.businessName}` : `Booking confirmed — ${d.serviceName} at ${d.businessName}`,
    react: <BookingConfirmationEmail {...bookingProps(d)} tenant={tenant} />,
    attachments: d.appointmentDate
      ? [icsAttachment({ serviceName: d.serviceName, businessName: d.businessName, staffName: d.staffName, durationMinutes: d.duration, start: d.appointmentDate })]
      : undefined,
  });
}

export async function sendBookingReminder(d: {
  to: string; clientName: string; businessName: string; serviceName: string;
  date: string; time: string; staffName?: string; duration?: number; price?: number; currency?: string; terms?: TermsSource; ctx?: EmailContext;
}) {
  const tenant = await tenantBrand(d.ctx?.businessId, d.businessName);
  return dispatch({
    to: d.to, type: "reminder", ctx: d.ctx,
    subject: `Reminder: ${d.serviceName} tomorrow at ${d.time}`,
    react: <BookingReminderEmail clientName={d.clientName} businessName={d.businessName} serviceName={d.serviceName} date={d.date} time={d.time} staffName={d.staffName} duration={d.duration} price={d.price} currency={d.currency} terms={d.terms} tenant={tenant} />,
  });
}

export function sendBookingCancellation(d: BookingDetails & { rebookUrl?: string }) {
  return dispatch({
    to: d.to, type: "cancellation", ctx: d.ctx,
    subject: `Your ${apptWord(d.terms)} at ${d.businessName} was cancelled`,
    react: <BookingCancellationEmail {...bookingProps(d)} rebookUrl={d.rebookUrl} />,
  });
}

export function sendBookingReschedule(d: BookingDetails & { oldDate: string; oldTime: string }) {
  return dispatch({
    to: d.to, type: "reschedule", ctx: d.ctx,
    subject: `Your ${apptWord(d.terms)} was moved to ${d.date} at ${d.time}`,
    react: <BookingRescheduleEmail {...bookingProps(d)} oldDate={d.oldDate} oldTime={d.oldTime} />,
  });
}

export function sendQueueMovedBack(d: BookingDetails & { place: number }) {
  return dispatch({
    to: d.to, type: "queue_moved_back", ctx: d.ctx,
    subject: `You are now #${d.place} in line at ${d.businessName}`,
    react: <QueueMovedBackEmail {...bookingProps(d)} place={d.place} />,
  });
}

export function sendQueueNoShow(d: BookingDetails) {
  return dispatch({
    to: d.to, type: "queue_no_show", ctx: d.ctx,
    subject: `Your ${apptWord(d.terms)} at ${d.businessName} was closed`,
    react: <QueueNoShowEmail {...bookingProps(d)} />,
  });
}

export function sendQueueMovedNextDay(d: BookingDetails) {
  return dispatch({
    to: d.to, type: "queue_next_day", ctx: d.ctx,
    subject: `Your ${apptWord(d.terms)} at ${d.businessName} moved to ${d.date}`,
    react: <QueueMovedNextDayEmail {...bookingProps(d)} />,
  });
}

export function sendInvoice(d: BookingDetails & { invoiceNumber: string; clientEmail: string; paymentRef?: string }) {
  return dispatch({
    to: d.to, type: "invoice", ctx: d.ctx,
    subject: `Receipt from ${d.businessName} — ${formatCurrencyAmount(d.price, d.currency ?? DEFAULT_CURRENCY)}`,
    react: <InvoiceEmail {...bookingProps(d)} invoiceNumber={d.invoiceNumber} clientEmail={d.clientEmail} paymentRef={d.paymentRef} />,
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
    subject: demoRequested ? "Your Calvy demo — let's get it booked" : "Thanks for reaching out to Calvy",
    react: <LeadAcknowledgmentEmail name={name} demoRequested={demoRequested} />,
  });
}

// Imported here (not in the header list) to keep this change append-only.
import { PasswordResetEmail } from "@/emails/templates";
import { logger } from "@/lib/logger";
import { SUPPORT_EMAIL } from "@/lib/site";

export function sendPasswordResetEmail({ to, name, token, baseUrl }: { to: string; name: string; token: string; baseUrl?: string }) {
  const appUrl = baseUrl ?? process.env.NEXT_PUBLIC_APP_URL ?? "https://calvy.io";
  return dispatch({
    to, type: "password_reset",
    subject: "Reset your Calvy password",
    react: <PasswordResetEmail name={name} resetUrl={`${appUrl}/reset-password?token=${token}`} />,
  });
}

/* ── Owner notification for form submissions ───────────────────────── */

export interface FormNotification {
  title: string;
  /** Label -> value. Never put passwords or tokens in here. */
  fields: Record<string, string | number | boolean | null | undefined>;
}

function FormNotificationEmail({ title, fields, at }: FormNotification & { at: string }) {
  const rows = Object.entries(fields).filter(([, v]) => v !== undefined && v !== null && v !== "");
  return (
    <div style={{ fontFamily: "Arial, sans-serif", fontSize: 14, color: "#111" }}>
      <h2 style={{ margin: "0 0 12px" }}>{title}</h2>
      <table cellPadding={6} style={{ borderCollapse: "collapse", border: "1px solid #ddd" }}>
        <tbody>
          {rows.map(([k, v]) => (
            <tr key={k}>
              <td style={{ border: "1px solid #ddd", fontWeight: 600, background: "#f6f6f6" }}>{k}</td>
              <td style={{ border: "1px solid #ddd" }}>{typeof v === "boolean" ? (v ? "yes" : "no") : String(v)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p style={{ color: "#777", fontSize: 12 }}>Received {at}</p>
    </div>
  );
}

/**
 * Tell the site owner about a form submission (lead, signup, onboarding).
 * Goes to NOTIFY_EMAIL (default: the support address). Never throws: a failed
 * notification must not break the form. Logged in EmailLog like other emails.
 */
export async function sendFormNotification({ title, fields }: FormNotification): Promise<void> {
  try {
    const to = process.env.NOTIFY_EMAIL || SUPPORT_EMAIL;
    await dispatch({
      to,
      type: "form_notification",
      subject: title,
      react: <FormNotificationEmail title={title} fields={fields} at={new Date().toUTCString()} />,
    });
  } catch (err) {
    logger.error("[Email] form notification failed:", { err });
  }
}
