import * as React from "react";
import { Section, Text } from "@react-email/components";
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
  /** Token bookings show the number and an estimated time instead of a fixed time. */
  token?: { number: number; estimatedTime: string; sessionName: string };
  /** Signed public link to the live queue page (token bookings). */
  trackUrl?: string;
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

export function BookingConfirmationEmail(p: BookingProps) {
  return (
    <EmailLayout tenant={p.tenant} preview={`You're booked with ${p.businessName} on ${p.date}`}>
      <Badge text="Confirmed" color={brand.green} bg="#e7f7ec" />
      <H>You&apos;re booked</H>
      <P>Hi {p.clientName.split(" ")[0]}, your {appt(p)} at <strong style={{ color: brand.ink }}>{p.businessName}</strong> is confirmed. Here are the details:</P>
      <BookingDetails p={p} />
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
    <EmailLayout tenant={p.tenant} preview={`Reminder: ${p.serviceName} tomorrow at ${p.time}`}>
      <Badge text="Reminder" color={brand.accent} bg="#e6f2fb" />
      <H>Your {appt(p)} is tomorrow</H>
      <P>Hi {p.clientName.split(" ")[0]}, a friendly reminder about your upcoming {appt(p)} at <strong style={{ color: brand.ink }}>{p.businessName}</strong>.</P>
      <BookingDetails p={p} />
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
      <H>Thanks, {name.split(" ")[0]}! 👋</H>
      <P>We got your details{demoRequested ? " and your demo request" : ""}. A member of the Calvy team will be in touch very shortly{demoRequested ? " to schedule your demo" : ""}.</P>
      <P>In the meantime, you can start free in under a minute — no card required.</P>
      <CTA href="https://calvy.io/signup" label="Get your booking page free" />
    </EmailLayout>
  );
}
