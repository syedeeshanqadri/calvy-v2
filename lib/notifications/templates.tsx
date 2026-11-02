import * as React from "react";
import { render } from "@react-email/render";
import {
  BookingCancellationEmail, BookingConfirmationEmail, BookingReminderEmail, BookingRescheduleEmail, BusinessAlertEmail, BusinessLiveEmail,
  CustomerResetEmail, CustomerVerifyEmail, DailySummaryEmail, EmailVerificationEmail, InvoiceEmail, LeadAcknowledgmentEmail, MeetingLinkEmail,
  PasswordResetEmail, QueueClosedEmail, QueueMovedBackEmail, ReviewRequestEmail, StatusChangeEmail, WelcomeEmail, businessAlertHeadline,
  type BookingProps, type BusinessAlertProps, type DailySummaryProps, type InvoiceProps,
} from "@/emails/templates";
import { UnsubscribeContext, type TenantBrand } from "@/emails/EmailLayout";
import { formatCurrencyAmount } from "@/lib/currency";
import { icsAttachment, type Attachment } from "@/lib/notifications/ics";
import { normalizeName } from "@/lib/patients";
import { t, type TermsSource } from "@/lib/terms";

export interface FormNotificationPayload {
  title: string;
  /** Label -> value. Never put passwords or tokens in here. */
  fields: Record<string, string | number | boolean | null | undefined>;
  /** Fixed at enqueue: a retry must render the same message, or Resend rejects the repeated idempotency key. */
  at: string;
}

export interface Rendered { subject: string; html: string; text: string; attachments?: Attachment[]; headers?: Record<string, string> }

/** Unsubscribe links for optional mail: `page` goes in the footer, `oneClick` in the List-Unsubscribe header. */
export interface UnsubscribeLinks { page: string; oneClick: string }

/** Read at render, not stored in the payload: the business's look and its pack wording. */
export interface RenderBrand { tenant?: TenantBrand; terms?: TermsSource }

export type BookingPayload = Omit<BookingProps, "terms" | "tenant">;
/** Attaches a calendar invite; the start is an ISO string because payloads are JSON. */
export type ConfirmationPayload = BookingPayload & { ics?: { appointmentId: string; start: string; durationMinutes: number } };
export type InvoicePayload = Omit<InvoiceProps, "terms" | "tenant">;
/** The link comes from the encrypted column, never from the stored payload. */
type AuthPayload = { name: string; secret: string };

const display = (v: string | number | boolean) => (typeof v === "boolean" ? (v ? "yes" : "no") : String(v));
const filled = (fields: FormNotificationPayload["fields"]) =>
  Object.entries(fields).filter((e): e is [string, string | number | boolean] => e[1] !== undefined && e[1] !== null && e[1] !== "");

function FormNotificationEmail({ title, fields, at }: FormNotificationPayload) {
  return (
    <div style={{ fontFamily: "Arial, sans-serif", fontSize: 14, color: "#111" }}>
      <h2 style={{ margin: "0 0 12px" }}>{title}</h2>
      <table cellPadding={6} style={{ borderCollapse: "collapse", border: "1px solid #ddd" }}>
        <tbody>
          {filled(fields).map(([k, v]) => (
            <tr key={k}>
              <td style={{ border: "1px solid #ddd", fontWeight: 600, background: "#f6f6f6" }}>{k}</td>
              <td style={{ border: "1px solid #ddd" }}>{display(v)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p style={{ color: "#777", fontSize: 12 }}>Received {at}</p>
    </div>
  );
}

/* ── Text variants (also what WhatsApp will send) ─────────────────────────── */

const lines = (...parts: (string | null | undefined | false)[]) => parts.filter(Boolean).join("\n");
const first = (name: string) => name.split(" ")[0];
const appt = (p: { terms?: TermsSource }) => t(p.terms ?? {}, "appointment");

function detailsText(p: BookingProps): string {
  return lines(
    `${t(p.terms ?? {}, "service", { cap: true })}: ${p.serviceName}`,
    p.patientName && normalizeName(p.patientName) !== normalizeName(p.clientName) && `For: ${p.patientName} (booked by ${p.clientName})`,
    p.staffName && `With: ${p.staffName}`,
    p.online && "Format: Online consultation",
    `Date: ${p.date}`,
    p.token ? `Queue number: #${p.token.number}\nEstimated time: ${p.token.estimatedTime}\nSession: ${p.token.sessionName}` : `Time: ${p.time}`,
    !!p.duration && `Duration: ${p.duration} min`,
    typeof p.price === "number" && `Price: ${formatCurrencyAmount(p.price, p.currency ?? "INR")}`,
  );
}

function joinText(p: BookingProps): string | null {
  if (!p.online) return null;
  return p.online.meetingUrl ? `Join online: ${p.online.meetingUrl}` : `${p.businessName} will send you the joining link before your appointment.`;
}

/* ── The registry ─────────────────────────────────────────────────────────── */

interface Template<P> {
  subject(p: P): string;
  Email(p: P): React.ReactElement;
  text(p: P): string;
  attachments?(p: P): Attachment[] | undefined;
}
/** Props a template receives: its payload, plus the brand. */
type Branded<P> = P & RenderBrand;
const define = <P,>(template: Template<Branded<P>>) => template as unknown as Template<unknown>;

export const TEMPLATES = {
  confirmation: define<ConfirmationPayload>({
    subject: (p) => (p.token ? `Queue number #${p.token.number} confirmed: ${p.businessName}` : `Booking confirmed: ${p.serviceName} at ${p.businessName}`),
    Email: (p) => <BookingConfirmationEmail {...p} />,
    text: (p) => lines(`Hi ${first(p.clientName)}, your ${appt(p)} at ${p.businessName} is confirmed.`, detailsText(p), joinText(p), p.token && p.trackUrl && `Track your place in line: ${p.trackUrl}`),
    attachments: (p) => (p.ics ? [icsAttachment({ appointmentId: p.ics.appointmentId, serviceName: p.serviceName, businessName: p.businessName, staffName: p.staffName, durationMinutes: p.ics.durationMinutes, start: new Date(p.ics.start) })] : undefined),
  }),
  reminder: define<BookingPayload>({
    subject: (p) => `Reminder: ${p.serviceName} on ${p.date} at ${p.time}`,
    Email: (p) => <BookingReminderEmail {...p} />,
    text: (p) => lines(`Hi ${first(p.clientName)}, a reminder about your ${appt(p)} at ${p.businessName}.`, detailsText(p), joinText(p)),
  }),
  reschedule: define<BookingPayload & { oldDate: string; oldTime: string }>({
    subject: (p) => `Your ${appt(p)} was moved to ${p.date} at ${p.time}`,
    Email: (p) => <BookingRescheduleEmail {...p} />,
    text: (p) => lines(`Hi ${first(p.clientName)}, your ${appt(p)} at ${p.businessName} has been rescheduled.`, `Was: ${p.oldDate}, ${p.oldTime}`, `Now: ${p.date}, ${p.time}`, detailsText(p)),
  }),
  cancellation: define<BookingPayload & { rebookUrl?: string }>({
    subject: (p) => `Your ${appt(p)} at ${p.businessName} was cancelled`,
    Email: (p) => <BookingCancellationEmail {...p} />,
    text: (p) => lines(`Hi ${first(p.clientName)}, this ${appt(p)} at ${p.businessName} has been cancelled.`, detailsText(p), p.rebookUrl && `Book again: ${p.rebookUrl}`),
  }),
  meeting_link: define<BookingPayload & { meetingUrl: string; updated: boolean }>({
    subject: (p) => (p.updated ? `Your joining link has changed: ${p.businessName}` : `Your joining link for ${p.date} at ${p.time}: ${p.businessName}`),
    Email: (p) => <MeetingLinkEmail {...p} />,
    text: (p) => lines(`Hi ${first(p.clientName)}, ${p.updated ? "the link for your online " + appt(p) + " has changed." : "here is the link for your online " + appt(p) + "."}`, `Join online: ${p.meetingUrl}`, detailsText({ ...p, online: { meetingUrl: p.meetingUrl } })),
  }),
  queue_moved_back: define<BookingPayload & { place: number }>({
    subject: (p) => `You are now #${p.place} in line at ${p.businessName}`,
    Email: (p) => <QueueMovedBackEmail {...p} />,
    text: (p) => lines(`Hi ${first(p.clientName)}, you were not present when called at ${p.businessName}, so you were moved back. You are now number ${p.place} in line.`, `You get four calls in all: if you are not present for the fourth, this ${appt(p)} is closed and what you paid is saved in your wallet.`, p.trackUrl && `Track your place in line: ${p.trackUrl}`),
  }),
  queue_closed: define<BookingPayload & { reason: "missed" | "cancelled"; creditLabel?: string; loginUrl?: string }>({
    subject: (p) => (p.reason === "missed" ? `You missed your ${appt(p)} at ${p.businessName}` : `Your ${appt(p)} at ${p.businessName} was cancelled`),
    Email: (p) => <QueueClosedEmail {...p} />,
    text: (p) => lines(p.reason === "missed" ? `Hi ${first(p.clientName)}, your number was called four times at ${p.businessName} and you were not present, so the ${appt(p)} was closed.` : `Hi ${first(p.clientName)}, your ${appt(p)} at ${p.businessName} was cancelled.`, p.creditLabel ? `${p.creditLabel} you paid is saved in your wallet at ${p.businessName}. It does not expire, and you can use it for a new booking on any date.` : "You can book again on any date.", p.loginUrl && `Book another date: ${p.loginUrl}`),
  }),
  invoice: define<InvoicePayload>({
    subject: (p) => `Receipt from ${p.businessName}: ${formatCurrencyAmount(p.price ?? 0, p.currency ?? "INR")}`,
    Email: (p) => <InvoiceEmail {...p} />,
    text: (p) => lines(`Receipt #${p.invoiceNumber} from ${p.businessName}`, `Billed to: ${p.clientName}`, `${p.serviceName}, ${p.date}, ${p.time}`, `Total paid: ${formatCurrencyAmount(p.price ?? 0, p.currency ?? "INR")}`, p.paymentRef && `Payment reference: ${p.paymentRef}`),
  }),
  status_change: define<BookingPayload & { status: "completed" | "no_show"; rebookUrl?: string }>({
    subject: (p) => (p.status === "completed" ? `Thanks for visiting ${p.businessName}` : `Your ${appt(p)} at ${p.businessName} was marked as missed`),
    Email: (p) => <StatusChangeEmail {...p} />,
    text: (p) => lines(`Hi ${first(p.clientName)}, your ${appt(p)} at ${p.businessName} is marked as ${p.status === "completed" ? "completed" : "missed"}.`, detailsText(p), p.rebookUrl && `Book again: ${p.rebookUrl}`),
  }),
  review_request: define<{ clientName: string; businessName: string; reviewUrl: string }>({
    subject: (p) => `How was your visit to ${p.businessName}?`,
    Email: (p) => <ReviewRequestEmail {...p} />,
    text: (p) => lines(`Hi ${first(p.clientName)}, thanks for choosing ${p.businessName}. If you have a minute, a Google review helps others find us.`, `Review us on Google: ${p.reviewUrl}`),
  }),
  welcome: define<{ name: string; dashboardUrl: string }>({
    subject: () => "Welcome to Calvy",
    Email: (p) => <WelcomeEmail {...p} />,
    text: (p) => lines(`Hi ${first(p.name)}, your Calvy account is ready. Add your services and working hours, then share your booking page.`, `Open your dashboard: ${p.dashboardUrl}`),
  }),
  business_live: define<{ name: string; businessName: string; websiteUrl: string }>({
    subject: (p) => `${p.businessName} is live`,
    Email: (p) => <BusinessLiveEmail {...p} />,
    text: (p) => lines(`Hi ${first(p.name)}, ${p.businessName} is online and ready to take bookings.`, `Share this link with your customers: ${p.websiteUrl}`),
  }),
  business_alert: define<Omit<BusinessAlertProps, "terms" | "tenant">>({
    subject: (p) => businessAlertHeadline(p),
    Email: (p) => <BusinessAlertEmail {...p} />,
    text: (p) => lines(
      businessAlertHeadline(p),
      p.patientName && normalizeName(p.patientName) !== normalizeName(p.clientName) && `For: ${p.patientName}`,
      `${t(p.terms ?? {}, "service", { cap: true })}: ${p.serviceName}`,
      p.staffName && `With: ${p.staffName}`,
      p.oldDate && p.oldTime && `Was: ${p.oldDate}, ${p.oldTime}`,
      `${p.oldDate ? "Now" : "Date"}: ${p.date}, ${p.time}`,
      p.token && `Queue number: #${p.token.number} (${p.token.sessionName})`,
      typeof p.price === "number" && `${p.kind === "paid" ? "Paid" : "Price"}: ${formatCurrencyAmount(p.price, p.currency ?? "INR")}`,
      `Open your dashboard: ${p.dashboardUrl}`,
    ),
  }),
  daily_summary: define<Omit<DailySummaryProps, "terms" | "tenant">>({
    subject: (p) => `${p.businessName}: your day, ${p.dateLabel}`,
    Email: (p) => <DailySummaryEmail {...p} />,
    text: (p) => lines(
      `Your day: ${p.dateLabel}`,
      `New ${t(p.terms ?? {}, "appointment", { plural: true })}: ${p.counts.bookings}`,
      `Completed: ${p.counts.completed}`, `Cancelled: ${p.counts.cancelled}`, `Missed: ${p.counts.noShows}`,
      typeof p.paidTotal === "number" && `Paid: ${formatCurrencyAmount(p.paidTotal, p.currency ?? "INR")}`,
      ...p.upcoming.map((u) => `${u.time}: ${u.clientName}, ${u.serviceName}`),
      `Open your dashboard: ${p.dashboardUrl}`,
    ),
  }),
  verification: define<AuthPayload>({
    subject: () => "Verify your Calvy account",
    Email: (p) => <EmailVerificationEmail name={p.name} verifyUrl={p.secret} />,
    text: (p) => lines(`Hi ${first(p.name)}, confirm your email address to activate your Calvy account.`, p.secret, "This link expires in 24 hours."),
  }),
  password_reset: define<AuthPayload>({
    subject: () => "Reset your Calvy password",
    Email: (p) => <PasswordResetEmail name={p.name} resetUrl={p.secret} />,
    text: (p) => lines(`Hi ${first(p.name)}, use this link to reset your Calvy password.`, p.secret, "This link expires in 1 hour. If you did not ask for this, ignore this message."),
  }),
  customer_verification: define<AuthPayload>({
    subject: () => "Verify your email",
    Email: (p) => <CustomerVerifyEmail name={p.name} verifyUrl={p.secret} />,
    text: (p) => lines(`Hi ${first(p.name)}, confirm your email address to see your bookings and wallet in one place.`, p.secret, "This link expires in 24 hours."),
  }),
  customer_password_reset: define<AuthPayload>({
    subject: () => "Reset your password",
    Email: (p) => <CustomerResetEmail name={p.name} resetUrl={p.secret} />,
    text: (p) => lines(`Hi ${first(p.name)}, use this link to reset your password.`, p.secret, "This link expires in 1 hour. If you did not ask for this, ignore this message."),
  }),
  lead: define<{ name: string; demoRequested: boolean }>({
    subject: (p) => (p.demoRequested ? "Your Calvy demo is booked" : "Thanks for reaching out to Calvy"),
    Email: (p) => <LeadAcknowledgmentEmail {...p} />,
    text: (p) => (p.demoRequested ? `Thanks ${first(p.name)}. A member of our team will reach out by phone or email to agree a time for your demo.` : `Thanks ${first(p.name)}. A member of the Calvy team will be in touch very shortly.`),
  }),
  form_notification: define<FormNotificationPayload>({
    subject: (p) => p.title,
    Email: (p) => <FormNotificationEmail title={p.title} fields={p.fields} at={p.at} />,
    text: (p) => lines(p.title, ...filled(p.fields).map(([k, v]) => `${k}: ${display(v)}`), `Received ${p.at}`),
  }),
};

export type TemplateId = keyof typeof TEMPLATES;

/** Pure: everything comes in as arguments, so a retry renders the same message unless the brand changed. */
export async function renderTemplate(template: string, payload: unknown, brand?: RenderBrand, unsubscribe?: UnsubscribeLinks): Promise<Rendered> {
  const entry = Object.hasOwn(TEMPLATES, template) ? TEMPLATES[template as TemplateId] : undefined;
  if (!entry) throw new Error(`Unknown notification template: ${template}`);
  const p = { ...(payload as object), ...brand };
  const email = entry.Email(p);
  return {
    subject: entry.subject(p),
    html: await render(unsubscribe ? <UnsubscribeContext.Provider value={unsubscribe.page}>{email}</UnsubscribeContext.Provider> : email),
    text: unsubscribe ? `${entry.text(p)}\n\nStop these emails: ${unsubscribe.page}` : entry.text(p),
    attachments: entry.attachments?.(p),
    ...(unsubscribe ? { headers: { "List-Unsubscribe": `<${unsubscribe.oneClick}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } } : {}),
  };
}
