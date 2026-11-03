import * as React from "react";
import { Section, Text } from "react-email";
import { EmailLayout, H, P, Card, DetailRow, CTA, Hairline, brand, type TenantBrand } from "./EmailLayout";
import { formatCurrencyAmount } from "@/lib/currency";
import { t, type TermsSource } from "@/lib/terms";
import { normalizeName } from "@/lib/patients";

export interface BookingProps {
  clientName: string;
  /** Set when the appointment is for someone other than the person receiving the email. */
  patientName?: string;
  businessName: string;
  serviceName: string;
  staffName?: string;
  date: string;
  time: string;
  duration?: number;
  price?: number;
  currency?: string;
  /** Business pack + termsOverride: the wording (appointment, service) follows the business type. */
  terms?: TermsSource;
  tenant?: TenantBrand;
  /** Optional mail only (reminder, thank-you): a signed link that stops these emails. Never set on transactional mail. */
  unsubscribeUrl?: string;
  /** Token bookings show the number and an estimated time instead of a fixed time. */
  token?: { number: number; estimatedTime: string; sessionName: string; sessionStart?: string };
  /** Signed public link to the live queue page (token bookings). */
  trackUrl?: string;
  /** Online consultation. meetingUrl is null when the business has not set a link yet. Only confirmation and reminder pass it. */
  online?: { meetingUrl: string | null };
}

const appt = (p: BookingProps) => t(p.terms ?? {}, "appointment");

function Badge({ text, color, bg }: { text: string; color: string; bg: string }) {
  return (
    <span style={{ display: "inline-block", backgroundColor: bg, color, fontSize: "12px", fontWeight: 700, padding: "4px 12px", borderRadius: "999px" }}>{text}</span>
  );
}

function BookingDetails({ p }: { p: BookingProps }) {
  return (
    <Card>
      <DetailRow label={t(p.terms ?? {}, "service", { cap: true })} value={p.serviceName} strong />
      {p.patientName && normalizeName(p.patientName) !== normalizeName(p.clientName) ? <DetailRow label="For" value={`${p.patientName} (booked by ${p.clientName})`} strong /> : null}
      {p.staffName ? <DetailRow label="With" value={p.staffName} /> : null}
      {p.online ? <DetailRow label="Format" value="Online consultation" strong /> : null}
      <DetailRow label="Date" value={p.date} />
      {p.token ? (
        <>
          <DetailRow label="Queue number" value={`#${p.token.number}`} strong />
          <DetailRow label="Estimated time" value={p.token.estimatedTime} />
          <DetailRow label="Session" value={p.token.sessionName} />
        </>
      ) : (
        <DetailRow label="Time" value={p.time} />
      )}
      {p.duration ? <DetailRow label="Duration" value={`${p.duration} min`} /> : null}
      {typeof p.price === "number" ? <DetailRow label="Price" value={formatCurrencyAmount(p.price, p.currency ?? "INR")} strong /> : null}
    </Card>
  );
}

/** Join button for an online consultation (booker-only emails). */
function OnlineJoin({ p }: { p: BookingProps }) {
  if (!p.online) return null;
  return p.online.meetingUrl ? (
    <>
      <P>This is an online consultation. Join from the link below at your appointment time; it works on your phone or computer.</P>
      <CTA color={p.tenant?.color} fg={p.tenant?.fg} href={p.online.meetingUrl} label="Join the consultation" />
    </>
  ) : (
    <P>This is an online consultation. {p.businessName} will send you the joining link before your appointment.</P>
  );
}

/** Staff added or changed the joining link of an online appointment. */
export function MeetingLinkEmail(p: BookingProps & { meetingUrl: string; updated: boolean }) {
  return (
    <EmailLayout tenant={p.tenant} preview={`Your joining link for ${p.date} at ${p.time}`}>
      <Badge text={p.updated ? "Link updated" : "Link added"} color={brand.accent} bg="#e6f2fb" />
      <H>{p.updated ? "Your joining link has changed" : "Your joining link is ready"}</H>
      <P>Hi {p.clientName.split(" ")[0]}, {p.updated ? "the link for" : "here is the link to join"} your online {appt(p)} at <strong style={{ color: brand.ink }}>{p.businessName}</strong>{p.updated ? " has changed. Please use this one." : "."}</P>
      <BookingDetails p={{ ...p, online: { meetingUrl: p.meetingUrl } }} />
      <CTA color={p.tenant?.color} fg={p.tenant?.fg} href={p.meetingUrl} label="Join the consultation" />
      <P>It works on your phone or computer. Join at your appointment time.</P>
    </EmailLayout>
  );
}

export function BookingConfirmationEmail(p: BookingProps) {
  return (
    <EmailLayout tenant={p.tenant} preview={`You're booked with ${p.businessName} on ${p.date}`}>
      <Badge text="Confirmed" color={brand.green} bg="#e7f7ec" />
      <H>You&apos;re booked</H>
      <P>Hi {p.clientName.split(" ")[0]}, your {appt(p)} at <strong style={{ color: brand.ink }}>{p.businessName}</strong> is confirmed. Here are the details:</P>
      <BookingDetails p={p} />
      <OnlineJoin p={p} />
      {p.token && p.trackUrl ? (
        <>
          <P>Follow the queue live and see how long is left, so you only need to arrive close to your turn.</P>
          <CTA color={p.tenant?.color} fg={p.tenant?.fg} href={p.trackUrl} label="Track your place in line" />
        </>
      ) : null}
      <P>We&apos;ve added this to your calendar (see the attachment). See you soon.</P>
    </EmailLayout>
  );
}

export function BookingReminderEmail(p: BookingProps) {
  return (
    <EmailLayout tenant={p.tenant} unsubscribeUrl={p.unsubscribeUrl} preview={`Reminder: ${p.serviceName} on ${p.date} at ${p.time}`}>
      <Badge text="Reminder" color={brand.accent} bg="#e6f2fb" />
      <H>Your {appt(p)} is coming up</H>
      <P>Hi {p.clientName.split(" ")[0]}, a friendly reminder about your upcoming {appt(p)} at <strong style={{ color: brand.ink }}>{p.businessName}</strong>.</P>
      {p.token ? (
        <P>
          Your session starts at <strong style={{ color: brand.ink }}>{p.token.sessionStart ?? p.token.estimatedTime}</strong> on {p.date}. Your number is{" "}
          <strong style={{ color: brand.ink }}>#{p.token.number}</strong>.
        </P>
      ) : null}
      <BookingDetails p={p} />
      <OnlineJoin p={p} />
      {p.token && p.trackUrl ? <CTA color={p.tenant?.color} fg={p.tenant?.fg} href={p.trackUrl} label="Track your place in line" /> : null}
      <P>See you there! If you need to make a change, just reply to this email.</P>
    </EmailLayout>
  );
}

export function BookingCancellationEmail(p: BookingProps & { rebookUrl?: string }) {
  return (
    <EmailLayout tenant={p.tenant} preview={`Your ${appt(p)} at ${p.businessName} was cancelled`}>
      <Badge text="Cancelled" color="#b91c1c" bg="#fdeaea" />
      <H>Your {appt(p)} was cancelled</H>
      <P>Hi {p.clientName.split(" ")[0]}, the following {appt(p)} at <strong style={{ color: brand.ink }}>{p.businessName}</strong> has been cancelled:</P>
      <BookingDetails p={p} />
      <P>If this wasn&apos;t expected, or you&apos;d like to rebook, you can do so any time.</P>
      {p.rebookUrl ? <CTA color={p.tenant?.color} fg={p.tenant?.fg} href={p.rebookUrl} label="Book again" /> : null}
    </EmailLayout>
  );
}

export function BookingRescheduleEmail(p: BookingProps & { oldDate: string; oldTime: string }) {
  return (
    <EmailLayout tenant={p.tenant} preview={`Your ${appt(p)} was moved to ${p.date} at ${p.time}`}>
      <Badge text="Rescheduled" color="#b45309" bg="#fdf2e3" />
      <H>Your {appt(p)} has moved</H>
      <P>Hi {p.clientName.split(" ")[0]}, your {appt(p)} at <strong style={{ color: brand.ink }}>{p.businessName}</strong> has been rescheduled.</P>
      <Card>
        <DetailRow label="Was" value={`${p.oldDate}, ${p.oldTime}`} />
        <DetailRow label="Now" value={`${p.date}, ${p.time}`} strong />
      </Card>
      <BookingDetails p={p} />
      <P>See you at the new time.</P>
    </EmailLayout>
  );
}

/** Queue emails: a customer's place changed while they wait. */
export function QueueMovedBackEmail(p: BookingProps & { place: number }) {
  return (
    <EmailLayout tenant={p.tenant} preview={`You are now #${p.place} in line at ${p.businessName}`}>
      <Badge text="Moved back" color="#b45309" bg="#fdf2e3" />
      <H>You were not here when we called you</H>
      <P>Hi {p.clientName.split(" ")[0]}, your place in the queue at <strong style={{ color: brand.ink }}>{p.businessName}</strong> came up but you were not present, so we moved you back in the queue. Please stay close.</P>
      <BookingDetails p={p} />
      <P>You are now number {p.place} in line. You get four calls in all: if you are not present for the fourth, this {appt(p)} is closed and what you paid is saved in your wallet.</P>
      {p.trackUrl ? <CTA color={p.tenant?.color} fg={p.tenant?.fg} href={p.trackUrl} label="Track your place in line" /> : null}
    </EmailLayout>
  );
}

/** A token was closed at the clinic (missed four calls, or cancelled). What was paid is in their wallet. */
export function QueueClosedEmail(p: BookingProps & { reason: "missed" | "cancelled"; creditLabel?: string; loginUrl?: string }) {
  const missed = p.reason === "missed";
  return (
    <EmailLayout tenant={p.tenant} preview={`Your ${appt(p)} at ${p.businessName} was ${missed ? "missed" : "cancelled"}`}>
      <Badge text={missed ? "Missed" : "Cancelled"} color="#b91c1c" bg="#fdeaea" />
      <H>{missed ? `You missed your ${appt(p)}` : `Your ${appt(p)} was cancelled`}</H>
      <P>
        Hi {p.clientName.split(" ")[0]},{" "}
        {missed
          ? <>your number was called four times at <strong style={{ color: brand.ink }}>{p.businessName}</strong> and you were not present, so the {appt(p)} was closed.</>
          : <>your {appt(p)} at <strong style={{ color: brand.ink }}>{p.businessName}</strong> was cancelled.</>}
      </P>
      <BookingDetails p={p} />
      {p.creditLabel ? (
        <P>
          <strong style={{ color: brand.ink }}>{p.creditLabel}</strong> you paid is saved in your wallet at {p.businessName}. It does not expire, and you can use it for a new booking on any date.
        </P>
      ) : (
        <P>You can book again on any date.</P>
      )}
      {p.loginUrl ? <CTA color={p.tenant?.color} fg={p.tenant?.fg} href={p.loginUrl} label={p.creditLabel ? "Sign in and book another date" : "Book another date"} /> : null}
    </EmailLayout>
  );
}

export interface InvoiceProps extends BookingProps {
  invoiceNumber: string;
  clientEmail: string;
  paymentRef?: string;
}

export function InvoiceEmail(p: InvoiceProps) {
  const total = typeof p.price === "number" ? formatCurrencyAmount(p.price, p.currency ?? "INR") : "—";
  return (
    <EmailLayout tenant={p.tenant} preview={`Receipt from ${p.businessName} — ${total}`}>
      <table width="100%"><tbody><tr>
        <td><Text style={{ fontSize: "22px", fontWeight: 700, color: brand.ink, margin: 0 }}>Receipt</Text>
          <Text style={{ fontSize: "13px", color: brand.muted, margin: "2px 0 0" }}>#{p.invoiceNumber}</Text></td>
        <td style={{ textAlign: "right" }}><Badge text="Paid" color={brand.green} bg="#e7f7ec" /></td>
      </tr></tbody></table>
      <Hairline />
      <table width="100%"><tbody><tr>
        <td style={{ verticalAlign: "top" }}>
          <Text style={{ fontSize: "13px", fontWeight: 600, color: brand.ink, margin: 0 }}>{p.businessName}</Text>
        </td>
        <td style={{ textAlign: "right", verticalAlign: "top" }}>
          <Text style={{ fontSize: "12px", color: brand.muted, margin: 0 }}>Billed to</Text>
          <Text style={{ fontSize: "13px", color: brand.ink, margin: "2px 0 0" }}>{p.clientName}</Text>
        </td>
      </tr></tbody></table>
      <Hairline />
      <DetailRow label={p.serviceName} value={total} />
      {p.staffName ? <DetailRow label="With" value={p.staffName} /> : null}
      <DetailRow label="Date" value={`${p.date}, ${p.time}`} />
      <Hairline />
      <DetailRow label="Total paid" value={total} strong />
      {p.paymentRef ? <P>Payment reference: {p.paymentRef}</P> : <Section style={{ height: "8px" }} />}
    </EmailLayout>
  );
}

/** A booking was marked completed or missed at the business. */
export function StatusChangeEmail(p: BookingProps & { status: "completed" | "no_show"; rebookUrl?: string }) {
  const done = p.status === "completed";
  return (
    <EmailLayout tenant={p.tenant} unsubscribeUrl={p.unsubscribeUrl} preview={done ? `Thanks for visiting ${p.businessName}` : `Your ${appt(p)} at ${p.businessName} was marked as missed`}>
      <Badge text={done ? "Completed" : "Missed"} color={done ? brand.green : "#b91c1c"} bg={done ? "#e7f7ec" : "#fdeaea"} />
      <H>{done ? `Thanks for visiting ${p.businessName}` : `We missed you at ${p.businessName}`}</H>
      <P>Hi {p.clientName.split(" ")[0]}, {done ? `your ${appt(p)} is marked as completed.` : `your ${appt(p)} was marked as missed.`}</P>
      <BookingDetails p={p} />
      {p.rebookUrl ? <CTA color={p.tenant?.color} fg={p.tenant?.fg} href={p.rebookUrl} label="Book again" /> : null}
    </EmailLayout>
  );
}

/** Post-visit link to the business's own Google review page. Calvy never posts a review. */
export function ReviewRequestEmail(p: { clientName: string; businessName: string; reviewUrl: string; tenant?: TenantBrand; unsubscribeUrl?: string }) {
  return (
    <EmailLayout tenant={p.tenant} unsubscribeUrl={p.unsubscribeUrl} preview={`How was your visit to ${p.businessName}?`}>
      <H>How was your visit?</H>
      <P>Hi {p.clientName.split(" ")[0]}, thanks for choosing <strong style={{ color: brand.ink }}>{p.businessName}</strong>. If you have a minute, a Google review helps others find us.</P>
      <CTA color={p.tenant?.color} fg={p.tenant?.fg} href={p.reviewUrl} label="Review us on Google" />
    </EmailLayout>
  );
}

/* ── Emails to the business owner: the business's look, Calvy's footer ─────────── */

export function WelcomeEmail({ name, dashboardUrl, tenant }: { name: string; dashboardUrl: string; tenant?: TenantBrand }) {
  return (
    <EmailLayout tenant={tenant} calvyFooter preview="Your Calvy account is ready">
      <H>Welcome to Calvy</H>
      <P>Hi {name.split(" ")[0]}, your account is ready. Add your services and working hours, then share your booking page.</P>
      <CTA color={tenant?.color} fg={tenant?.fg} href={dashboardUrl} label="Open your dashboard" />
    </EmailLayout>
  );
}

export function BusinessLiveEmail({ name, businessName, websiteUrl, tenant }: { name: string; businessName: string; websiteUrl: string; tenant?: TenantBrand }) {
  return (
    <EmailLayout tenant={tenant} calvyFooter preview={`${businessName} is live`}>
      <H>{businessName} is live</H>
      <P>Hi {name.split(" ")[0]}, your website is online and ready to take bookings. Share this link with your customers:</P>
      <P><strong style={{ color: brand.ink }}>{websiteUrl}</strong></P>
      <CTA color={tenant?.color} fg={tenant?.fg} href={websiteUrl} label="View your website" />
    </EmailLayout>
  );
}

export interface BusinessAlertProps {
  kind: "created" | "rescheduled" | "cancelled" | "paid" | "status";
  /** Who did it, when the customer did. */
  byCustomer?: boolean;
  /** Set for kind "status": the new status in words. */
  statusLabel?: string;
  clientName: string;
  patientName?: string;
  serviceName: string;
  staffName?: string;
  date: string;
  time: string;
  token?: { number: number; sessionName: string };
  oldDate?: string;
  oldTime?: string;
  price?: number;
  currency?: string;
  dashboardUrl: string;
  terms?: TermsSource;
  tenant?: TenantBrand;
}

/** One sentence per alert kind. Shared with the subject and the text variant so they cannot disagree. */
export function businessAlertHeadline(p: BusinessAlertProps): string {
  const word = t(p.terms ?? {}, "appointment");
  const Word = t(p.terms ?? {}, "appointment", { cap: true });
  const by = p.byCustomer ? " by the customer" : "";
  switch (p.kind) {
    case "created": return `New ${word}: ${p.clientName}`;
    case "rescheduled": return `${Word} rescheduled${by}: ${p.clientName}`;
    case "cancelled": return `${Word} cancelled${by}: ${p.clientName}`;
    case "paid": return `Payment received: ${p.clientName}`;
    case "status": return `${Word} ${p.statusLabel ?? "updated"}: ${p.clientName}`;
  }
}

export function BusinessAlertEmail(p: BusinessAlertProps) {
  const headline = businessAlertHeadline(p);
  return (
    <EmailLayout tenant={p.tenant} calvyFooter preview={headline}>
      <H>{headline}</H>
      <Card>
        {p.patientName && normalizeName(p.patientName) !== normalizeName(p.clientName) ? <DetailRow label="For" value={p.patientName} strong /> : null}
        <DetailRow label={t(p.terms ?? {}, "service", { cap: true })} value={p.serviceName} strong />
        {p.staffName ? <DetailRow label="With" value={p.staffName} /> : null}
        {p.oldDate && p.oldTime ? <DetailRow label="Was" value={`${p.oldDate}, ${p.oldTime}`} /> : null}
        <DetailRow label={p.oldDate ? "Now" : "Date"} value={`${p.date}, ${p.time}`} />
        {p.token ? <DetailRow label="Queue number" value={`#${p.token.number} (${p.token.sessionName})`} /> : null}
        {typeof p.price === "number" ? <DetailRow label={p.kind === "paid" ? "Paid" : "Price"} value={formatCurrencyAmount(p.price, p.currency ?? "INR")} strong /> : null}
      </Card>
      <CTA color={p.tenant?.color} fg={p.tenant?.fg} href={p.dashboardUrl} label="Open your dashboard" />
    </EmailLayout>
  );
}

export interface DailySummaryProps {
  businessName: string;
  dateLabel: string;
  counts: { bookings: number; cancelled: number; noShows: number; completed: number };
  /** Paid appointments only. */
  paidTotal?: number;
  currency?: string;
  upcoming: { time: string; clientName: string; serviceName: string }[];
  dashboardUrl: string;
  terms?: TermsSource;
  tenant?: TenantBrand;
}

export function DailySummaryEmail(p: DailySummaryProps) {
  const word = t(p.terms ?? {}, "appointment", { plural: true });
  return (
    <EmailLayout tenant={p.tenant} calvyFooter preview={`${p.businessName}: ${p.dateLabel}`}>
      <H>Your day: {p.dateLabel}</H>
      <Card>
        <DetailRow label={`New ${word}`} value={String(p.counts.bookings)} strong />
        <DetailRow label="Completed" value={String(p.counts.completed)} />
        <DetailRow label="Cancelled" value={String(p.counts.cancelled)} />
        <DetailRow label="Missed" value={String(p.counts.noShows)} />
        {typeof p.paidTotal === "number" ? <DetailRow label="Paid" value={formatCurrencyAmount(p.paidTotal, p.currency ?? "INR")} strong /> : null}
      </Card>
      {p.upcoming.length ? (
        <>
          <P>Coming up today:</P>
          <Card>{p.upcoming.map((u, i) => <DetailRow key={i} label={u.time} value={`${u.clientName}, ${u.serviceName}`} />)}</Card>
        </>
      ) : <P>No more {word} today.</P>}
      <CTA color={p.tenant?.color} fg={p.tenant?.fg} href={p.dashboardUrl} label="Open your dashboard" />
    </EmailLayout>
  );
}

export function CustomerVerifyEmail({ name, verifyUrl }: { name: string; verifyUrl: string }) {
  return (
    <EmailLayout preview="Verify your email to see your bookings">
      <H>Verify your email</H>
      <P>Hi {name.split(" ")[0]}, confirm your email address to see your bookings and wallet in one place.</P>
      <CTA href={verifyUrl} label="Verify my email" />
      <P>This link expires in 24 hours. If you did not create an account, you can ignore this email.</P>
    </EmailLayout>
  );
}

export function CustomerResetEmail({ name, resetUrl }: { name: string; resetUrl: string }) {
  return (
    <EmailLayout preview="Reset your password">
      <H>Reset your password</H>
      <P>Hi {name.split(" ")[0]}, we received a request to reset the password for your bookings account.</P>
      <CTA href={resetUrl} label="Choose a new password" />
      <P>This link expires in 1 hour. If you did not ask for this, ignore this email.</P>
    </EmailLayout>
  );
}

export function EmailVerificationEmail({ name, verifyUrl }: { name: string; verifyUrl: string }) {
  return (
    <EmailLayout preview="Verify your email to start using Calvy">
      <H>Verify your email</H>
      <P>Hi {name.split(" ")[0]}, welcome to Calvy! Confirm your email address to activate your account and start taking bookings.</P>
      <CTA href={verifyUrl} label="Verify my email" />
      <P>This link expires in 24 hours. If you didn&apos;t create a Calvy account, you can ignore this email.</P>
    </EmailLayout>
  );
}

export function PasswordResetEmail({ name, resetUrl }: { name: string; resetUrl: string }) {
  return (
    <EmailLayout preview="Reset your Calvy password">
      <H>Reset your password</H>
      <P>Hi {name.split(" ")[0]}, we received a request to reset the password for your Calvy account.</P>
      <CTA href={resetUrl} label="Choose a new password" />
      <P>This link expires in 1 hour. If you did not ask for this, ignore this email.</P>
    </EmailLayout>
  );
}

export function LeadAcknowledgmentEmail({ name, demoRequested }: { name: string; demoRequested: boolean }) {
  return (
    <EmailLayout preview="Thanks for reaching out to Calvy">
      <H>{demoRequested ? `Your demo is booked, ${name.split(" ")[0]}` : `Thanks, ${name.split(" ")[0]}! 👋`}</H>
      <P>{demoRequested ? "Thanks for booking a personal demo of Calvy. You will be contacted soon with your demo: a member of our team will reach out by phone or email to agree a time that suits you." : "We got your details. A member of the Calvy team will be in touch very shortly."}</P>
      <P>In the meantime, you can start free in under a minute — no card required.</P>
      <CTA href="https://calvy.io/signup" label="Get your booking page free" />
    </EmailLayout>
  );
}
