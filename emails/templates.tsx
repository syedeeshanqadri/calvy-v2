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
  /** Loyalty progress (confirmation only): every 8th attended visit has the Rs 10 confirmation free. */
  reward?: { done: number; of: number; available: number };
  /** Confirmation only: the customer's account link. `claimed` false = a one-time "claim your Calvy account" link; true = a plain link to their account. */
  claimUrl?: string;
  claimed?: boolean;
}

/** Loyalty progress line for the confirmation email and its text version. */
export function rewardLine(r: { done: number; of: number; available: number }): string {
  return r.available > 0 ? "A free booking is ready: your next Rs 10 confirmation is on us." : `Loyalty: ${r.done} of ${r.of} attended visits toward a free booking.`;
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
      {p.reward ? <P>{rewardLine(p.reward)}</P> : null}
      <P>We&apos;ve added this to your calendar (see the attachment). See you soon.</P>
      {p.claimUrl ? (
        <>
          <Hairline />
          <P>{p.claimed ? "See and change all your bookings in one place." : "We saved this booking to a Calvy account in your name, so you can see and change it any time. Claim it with one tap: no password needed."}</P>
          <CTA href={p.claimUrl} label={p.claimed ? "Manage your bookings" : "Manage your bookings — claim your Calvy account"} />
        </>
      ) : null}
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
      <P>You are now number {p.place} in line. You get four calls in all: if you are not present for the fourth, this {appt(p)} is closed. Your Rs 10 confirmation fee is kept, and you can rebook once without paying it again.</P>
      {p.trackUrl ? <CTA color={p.tenant?.color} fg={p.tenant?.fg} href={p.trackUrl} label="Track your place in line" /> : null}
    </EmailLayout>
  );
}

/** A token customer is a few places from the front: short, one line, the tracking link. */
export function QueueNextEmail(p: BookingProps & { ahead: number }) {
  return (
    <EmailLayout tenant={p.tenant} preview={`Your turn is coming up at ${p.businessName}`}>
      <Badge text="Almost your turn" color={brand.green} bg="#e7f7ec" />
      <H>Your turn is coming up</H>
      <P>Hi {p.clientName.split(" ")[0]}, {p.ahead} {p.ahead === 1 ? "person is" : "people are"} ahead of you at <strong style={{ color: brand.ink }}>{p.businessName}</strong>. Please be ready.</P>
      {p.trackUrl ? <CTA color={p.tenant?.color} fg={p.tenant?.fg} href={p.trackUrl} label="Track your place in line" /> : null}
    </EmailLayout>
  );
}

/** A token was closed at the clinic (missed four calls, or cancelled). The Rs 10 fee is kept for one rebooking. */
export function QueueClosedEmail(p: BookingProps & { reason: "missed" | "cancelled"; feeKept?: boolean; loginUrl?: string }) {
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
      {p.feeKept ? (
        <P>
          Your Rs 10 confirmation fee is kept, and you can rebook once at {p.businessName} without paying it again.
        </P>
      ) : (
        <P>You can book again on any date.</P>
      )}
      {p.loginUrl ? <CTA color={p.tenant?.color} fg={p.tenant?.fg} href={p.loginUrl} label={p.feeKept ? "Book another date" : "Book another date"} /> : null}
    </EmailLayout>
  );
}

export interface InvoiceProps extends BookingProps {
  invoiceNumber: string;
  clientEmail: string;
  paymentRef?: string;
  /** Calvy's booking fee on this receipt: company details, GST split and a note (see lib/receiptTax). */
  tax?: { issuer: { legalName: string; address: string; gstin: string | null } | null; split: { baseLabel: string; gstLabel: string; ratePercent: number } | null; note: string; feeLabel: string };
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
      {p.tax?.split ? <DetailRow label={`Booking fee before GST`} value={p.tax.split.baseLabel} /> : null}
      {p.tax?.split ? <DetailRow label={`GST (${p.tax.split.ratePercent}%)`} value={p.tax.split.gstLabel} /> : null}
      <DetailRow label="Total paid" value={total} strong />
      {p.paymentRef ? <P>Payment reference: {p.paymentRef}</P> : <Section style={{ height: "8px" }} />}
      {p.tax ? <Hairline /> : null}
      {p.tax?.issuer ? <Text style={{ fontSize: "12px", color: brand.muted, margin: 0 }}>Booking fee charged by {p.tax.issuer.legalName}, {p.tax.issuer.address}{p.tax.issuer.gstin ? `. GSTIN ${p.tax.issuer.gstin}` : ""}.</Text> : null}
      {p.tax ? <Text style={{ fontSize: "12px", color: brand.muted, margin: "4px 0 0" }}>{p.tax.note}</Text> : null}
    </EmailLayout>
  );
}

/** A booking was marked completed or missed at the business. */
export function StatusChangeEmail(p: BookingProps & { status: "completed" | "no_show"; rebookUrl?: string; followUpUntil?: string }) {
  const done = p.status === "completed";
  return (
    <EmailLayout tenant={p.tenant} unsubscribeUrl={p.unsubscribeUrl} preview={done ? `Thanks for visiting ${p.businessName}` : `Your ${appt(p)} at ${p.businessName} was marked as missed`}>
      <Badge text={done ? "Completed" : "Missed"} color={done ? brand.green : "#b91c1c"} bg={done ? "#e7f7ec" : "#fdeaea"} />
      <H>{done ? `Thanks for visiting ${p.businessName}` : `We missed you at ${p.businessName}`}</H>
      <P>Hi {p.clientName.split(" ")[0]}, {done ? `your ${appt(p)} is marked as completed.` : `your ${appt(p)} was marked as missed.`}</P>
      {done && p.followUpUntil ? <P>You can book <strong style={{ color: brand.ink }}>one free follow-up until {p.followUpUntil}</strong>. Sign in to My bookings to use it.</P> : null}
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
      <P>Yesterday:</P>
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
      <P>Hi {name.split(" ")[0]}, confirm your email address to see your bookings in one place.</P>
      <CTA href={verifyUrl} label="Verify my email" />
      <P>This link expires in 24 hours. If you did not create an account, you can ignore this email.</P>
    </EmailLayout>
  );
}

export function CustomerAccountSetupEmail({ name, setupUrl }: { name: string; setupUrl: string }) {
  return (
    <EmailLayout preview="Verify your account to keep track of all your appointments">
      <H>Verify your account</H>
      <P>Hi {name.split(" ")[0]}, thanks for your booking. We made an account for you with this email so you can keep track of all your appointments, move or cancel them, and see them in one place.</P>
      <CTA href={setupUrl} label="Verify and set my password" />
      <P>Your booking is confirmed either way; this step is optional. The link expires in 24 hours (you can get a new one with Forgot password). If you did not book anything, you can ignore this email.</P>
    </EmailLayout>
  );
}

/** The member sign-in link from checkout: one tap, no password. Names nothing but the action. */
export function MemberLinkEmail({ name, linkUrl }: { name: string; linkUrl: string }) {
  return (
    <EmailLayout preview="Your member price is one tap away">
      <H>Pay your member price</H>
      <P>Hi {name.split(" ")[0]}, tap the button to sign in and go back to your booking with your member price. No password needed.</P>
      <CTA href={linkUrl} label="Sign in and continue" />
      <P>This link works once and expires in 15 minutes. If you did not ask for it, ignore this email: nothing happens unless someone opens it.</P>
    </EmailLayout>
  );
}

/** The account-deletion request was received: what happens, when, and the link to cancel. */
export function DeletionRequestedEmail({ name, executeAfterLabel, cancelUrl }: { name: string; executeAfterLabel: string; cancelUrl: string }) {
  return (
    <EmailLayout preview="Your account deletion request">
      <H>We received your deletion request</H>
      <P>Hi {name.split(" ")[0]}, you asked us to delete your Calvy account. We will do it on {executeAfterLabel}, 30 days from now. Until then nothing changes and you can still sign in.</P>
      <P>If you did not ask for this, or you changed your mind, cancel it here.</P>
      <CTA href={cancelUrl} label="Keep my account" />
      <P>After that date your name, email, phone number and login are removed. Businesses keep their own booking records without your details.</P>
    </EmailLayout>
  );
}

/** To the Calvy team: a business could not use recurring card billing and was put on payment links. */
export function BillingLinksModeEmail({ businessName, businessId, reason, adminUrl }: { businessName: string; businessId: string; reason: string; adminUrl: string }) {
  return (
    <EmailLayout preview="A business fell back to links mode">
      <H>Links mode: {businessName}</H>
      <P>Razorpay refused recurring card billing for this business, so it was put on renewal payment links with email reminders instead. This is not silent: it also shows in Admin, Billing.</P>
      <P>Business: {businessName} ({businessId}). Reason from Razorpay: {reason}</P>
      <CTA href={adminUrl} label="Open Admin, Billing" />
    </EmailLayout>
  );
}

export interface LevelUpProps { levelLabel: string; feeLabel: string; perk: string | null; accountUrl: string }

/** A customer reached a new Calvy level. Names only the level, the new fee and the perk; the requirements are never listed. */
export function LevelUpEmail({ levelLabel, feeLabel, perk, accountUrl }: LevelUpProps) {
  return (
    <EmailLayout preview={`You reached ${levelLabel}`}>
      <H>You reached {levelLabel}</H>
      <P>Thank you for showing up. Your Calvy confirmation fee is now {feeLabel} at businesses where it applies.</P>
      {perk && <P>{perk}</P>}
      <CTA href={accountUrl} label="See my level" />
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

export function OwnerAccountSetupEmail({ name, setupUrl }: { name: string; setupUrl: string }) {
  return (
    <EmailLayout preview="Verify your email and set your Calvy password">
      <H>Verify your email and set your password</H>
      <P>Hi {name.split(" ")[0]}, welcome to Calvy. One last step: confirm this is your email address and choose a password, so you can sign in any time.</P>
      <CTA href={setupUrl} label="Verify and set my password" />
      <P>You can keep setting up your business in the meantime. This link expires in 7 days (you can get a new one with Forgot password). If you did not sign up, ignore this email.</P>
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

export function TeamInviteEmail({ name, businessName, roleName, acceptUrl }: { name: string; businessName: string; roleName: string; acceptUrl: string }) {
  return (
    <EmailLayout preview={`You have been invited to ${businessName} on Calvy`}>
      <H>Join {businessName} on Calvy</H>
      <P>Hi {name.split(" ")[0]}, you have been invited to join the {businessName} team as {roleName}. Set a password to get started.</P>
      <CTA href={acceptUrl} label="Accept invitation" />
      <P>This link expires in 48 hours and works once. If you were not expecting it, ignore this email.</P>
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

export type SubscriptionNoticeKind = "started" | "upgraded" | "downgrade_scheduled" | "cancelled" | "payment_failed_1" | "payment_failed_2" | "payment_failed_3" | "downgraded" | "renewal_link";

export interface SubscriptionNoticeProps {
  kind: SubscriptionNoticeKind;
  name: string;
  businessName: string;
  planName: string;
  /** "monthly" | "yearly" */
  intervalLabel: string;
  amountLabel?: string;
  /** Next bill date, end of access, or grace end, as the kind needs. */
  dateLabel?: string;
  creditLabel?: string;
  invoiceNumber?: string;
  /** Payment-link billing (international fallback): where to pay. */
  linkUrl?: string;
  billingUrl: string;
}

const NOTICE_TITLE: Record<SubscriptionNoticeKind, string> = {
  started: "Your Calvy plan is active",
  upgraded: "Your plan was upgraded",
  downgrade_scheduled: "Your plan change is scheduled",
  cancelled: "Your subscription is cancelled",
  payment_failed_1: "We could not take your Calvy payment",
  payment_failed_2: "Your Calvy payment is still unpaid",
  payment_failed_3: "Last reminder: your Calvy payment is unpaid",
  downgraded: "Your account is now on the Free plan",
  renewal_link: "Your Calvy renewal is ready to pay",
};

export const subscriptionNoticeSubject = (p: SubscriptionNoticeProps) => NOTICE_TITLE[p.kind];

/** The sentences of a subscription email, shared by the HTML and the plain-text version. */
export function subscriptionNoticeLines(p: SubscriptionNoticeProps): string[] {
  const plan = `${p.planName} (${p.intervalLabel})`;
  const hi = `Hi ${p.name.split(" ")[0]},`;
  switch (p.kind) {
    case "started": return [`${hi} your ${plan} plan for ${p.businessName} is active.${p.amountLabel ? ` You paid ${p.amountLabel}.` : ""}`, p.dateLabel ? `Your next payment is on ${p.dateLabel}.` : "", p.invoiceNumber ? `Invoice ${p.invoiceNumber} is in your Billing page.` : ""].filter(Boolean);
    case "upgraded": return [`${hi} ${p.businessName} is now on ${plan}.${p.amountLabel ? ` You paid ${p.amountLabel}${p.creditLabel ? `, after a credit of ${p.creditLabel} for the unused part of your old plan` : ""}.` : ""}`, p.dateLabel ? `Your next payment is on ${p.dateLabel}.` : "", p.invoiceNumber ? `Invoice ${p.invoiceNumber} is in your Billing page.` : ""].filter(Boolean);
    case "downgrade_scheduled": return [`${hi} ${p.businessName} will move to ${plan} on ${p.dateLabel ?? "the end of your billing period"}.`, "Until then you keep everything in your current plan. You can undo this any time before that date from your Billing page."];
    case "cancelled": return [`${hi} your subscription for ${p.businessName} is cancelled and you will not be charged again.`, `You keep your paid features until ${p.dateLabel ?? "the end of your billing period"}, then your account moves to the Free plan. Nothing is deleted.`];
    case "payment_failed_1": return [`${hi} we tried to charge ${p.amountLabel ?? "your plan"} for ${p.businessName} (${plan}) and it did not go through.`, `We will try again. Your paid features stay on until ${p.dateLabel ?? "7 days from now"}. Please check your payment method.`];
    case "payment_failed_2": return [`${hi} the payment for ${p.businessName} (${plan}) is still unpaid.`, `Your paid features stay on until ${p.dateLabel ?? "the end of the grace period"}. After that your account moves to the Free plan. Your data is kept.`];
    case "payment_failed_3": return [`${hi} this is the last reminder: the payment for ${p.businessName} (${plan}) is still unpaid.`, `If we cannot take it by ${p.dateLabel ?? "the end of the grace period"}, your account moves to the Free plan and paid features turn off. Your data is kept.`];
    case "renewal_link": return [`${hi} your ${plan} plan for ${p.businessName} renews on ${p.dateLabel ?? "the end of this period"} for ${p.amountLabel ?? "the plan price"}.`, "Your card is not charged automatically on your account, so please pay with the secure link below to keep your plan going without a break."];
    case "downgraded": return [`${hi} we could not collect your payment, so ${p.businessName} is now on the Free plan.`, "Your bookings, customers and settings are all still there; only the paid features are off. You can subscribe again from your Billing page at any time."];
  }
}

export function SubscriptionNoticeEmail(p: SubscriptionNoticeProps) {
  const [first, ...rest] = subscriptionNoticeLines(p);
  return (
    <EmailLayout calvyFooter preview={NOTICE_TITLE[p.kind]}>
      <H>{NOTICE_TITLE[p.kind]}</H>
      <P>{first}</P>
      {rest.map((l) => <P key={l}>{l}</P>)}
      <CTA href={p.linkUrl ?? p.billingUrl} label={p.linkUrl ? "Pay now" : p.kind === "downgraded" || p.kind.startsWith("payment_failed") ? "Fix payment" : "Open Billing"} />
    </EmailLayout>
  );
}

/** "Email me a sign-in link": one tap signs the owner in. */
export function OwnerMagicLinkEmail({ name, linkUrl }: { name: string; linkUrl: string }) {
  return (
    <EmailLayout preview="Your Calvy sign-in link">
      <H>Sign in to Calvy</H>
      <P>Hi {name.split(" ")[0]}, tap the button to sign in. No password needed.</P>
      <CTA href={linkUrl} label="Sign in to Calvy" />
      <P>This link works once and expires in 15 minutes. If you did not ask for it, ignore this email: nothing happens unless someone opens it.</P>
    </EmailLayout>
  );
}

/** A verified sign-in took over an account that someone had created on this address without verifying it. */
export function OwnershipTransferredEmail({ name, via }: { name: string; via: "google" | "magic-link" }) {
  return (
    <EmailLayout preview="Your email address was verified on Calvy">
      <H>Your email address is now verified on Calvy</H>
      <P>Hi {name.split(" ")[0]}, someone signed in to Calvy with this email address using {via === "google" ? "Google" : "a sign-in link sent to it"}, so it is now confirmed as yours. Any earlier sign-up with this address that had not been verified has been closed off.</P>
      <P>If this was you, there is nothing to do. If it was not, reply to this email and our team will look into it.</P>
    </EmailLayout>
  );
}

const REMINDER_COPY = [
  { subject: "Finish setting up your Calvy booking page", lead: "You started setting up your booking page on Calvy and stopped part-way. Your answers are saved, so you can pick up where you left off." },
  { subject: "Your Calvy booking page is waiting", lead: "A quick reminder that your Calvy setup is saved and ready. It takes a few minutes to finish, and then customers can book you online." },
  { subject: "Need a hand with your Calvy setup?", lead: "We noticed your Calvy setup is not finished. If something was unclear, just reply to this email and we will help. Otherwise you can continue from where you stopped." },
  { subject: "A last note about your Calvy setup", lead: "This is our last reminder. Your setup stays saved, and you can finish it any time with the button below. We will not email you about it again." },
] as const;
export const onboardingReminderSubject = (n: number) => (REMINDER_COPY[Math.min(Math.max(n, 1), 4) - 1]).subject;
export const onboardingReminderLead = (n: number) => (REMINDER_COPY[Math.min(Math.max(n, 1), 4) - 1]).lead;

/** Plain, non-promotional reminder with a one-click resume link. The footer carries the stop link. */
export function OnboardingReminderEmail({ name, n, resumeUrl, unsubscribeUrl }: { name: string; n: number; resumeUrl: string; unsubscribeUrl?: string }) {
  return (
    <EmailLayout preview={onboardingReminderSubject(n)} unsubscribeUrl={unsubscribeUrl}>
      <H>{onboardingReminderSubject(n)}</H>
      <P>Hi {name.split(" ")[0]}, {onboardingReminderLead(n)}</P>
      <CTA href={resumeUrl} label="Continue setup" />
      <P>The button signs you in and takes you straight to your next step. It works once and is valid for 7 days.</P>
    </EmailLayout>
  );
}
