// Online booking payments (Cashfree) on top of lib/fees, lib/holds and lib/payments.
// Flow: booking -> pending_payment hold + Payment(CREATED) + gateway order -> checkout ->
// webhook or return-page reconcile -> settlePaidPayment (confirm, or refund a lapsed hold).
import { prisma } from "@/lib/prisma";
import { isFeatureEnabled } from "@/lib/flags";
import { getEffectiveLimits } from "@/lib/getFeatures";
import { computeCharge, countryFromCurrency, effectivePayMode, toMinor, type Charge, type FeePayer, type OnlinePayMode } from "@/lib/fees";
import { EXPIRED, PENDING_PAYMENT, onPaid } from "@/lib/holds";
import { paymentLockKey, refundBlockedByCredit } from "@/lib/credit";
import { BOOKING_TX_OPTIONS } from "@/lib/booking";
import { getPaymentProvider, type PaymentProvider } from "@/lib/payments";
import { applyPaymentEvent } from "@/lib/payments/events";
import { prismaPaymentEventStore } from "@/lib/payments/db";
import { sendBookingConfirmation } from "@/lib/email";
import { sendBookingConfirmationWhatsApp } from "@/lib/whatsapp";
import { sendPushToBusiness } from "@/lib/push";
import { DEFAULT_CURRENCY } from "@/lib/currency";
import { logger } from "@/lib/logger";
import { t } from "@/lib/terms";
import { formatDateLabel, formatTimeLabel, safeTimeZone } from "@/lib/time";
import { trackingUrl } from "@/lib/tracking";
import { bookingForLabel } from "@/lib/patients";
import { meetingUrlFor } from "@/lib/online";

const APP_URL = () => process.env.NEXT_PUBLIC_APP_URL ?? `http://localhost:${process.env.PORT ?? 3000}`;

/** What the booking page needs to show and compute the online charge (safe to send to the browser). */
export interface PayConfig {
  country: string;
  platformFeeMinorIN: number;
  mode: OnlinePayMode;
  payer: FeePayer;
}

/**
 * Online payment settings for a public booking, or null when bookings confirm without paying
 * (flag off, or no gateway available in this environment).
 */
export async function getPayConfig(business: {
  plan: string; planStatus: string; trialEndsAt?: Date | null; currency: string | null;
  onlinePayMode: OnlinePayMode; feePayer: FeePayer;
}): Promise<PayConfig | null> {
  if (!isFeatureEnabled("onlinePayments") || !getPaymentProvider()) return null;
  const limits = await getEffectiveLimits(business);
  return {
    country: countryFromCurrency(business.currency),
    platformFeeMinorIN: limits.platformFeeMinorIN,
    mode: effectivePayMode(business.onlinePayMode),
    payer: business.feePayer,
  };
}

/** The online charge for a booking of `priceTotal` (business currency, whole units). */
export function chargeFor(cfg: PayConfig | null, priceTotal: number): Charge {
  if (!cfg) return { chargeMinor: 0, platformFeeMinor: 0, businessShareMinor: 0 };
  return computeCharge({ ...cfg, priceMinor: toMinor(priceTotal) });
}

export interface CheckoutInfo {
  provider: "CASHFREE" | "MOCK";
  orderId: string;
  sessionId: string;
  /** Cashfree JS SDK mode. */
  env: "sandbox" | "production";
}

/**
 * Create the Payment row and the gateway order for a pending appointment. On a gateway error the
 * hold is released at once (appointment expired, payment FAILED) so the slot frees up.
 */
export async function startCheckout(p: {
  appointmentId: string;
  businessId: string;
  businessName: string;
  currency: string;
  charge: Charge;
  holdExpiresAt: Date;
  client: { id: string; name: string; email: string; phone: string };
  note: string;
}): Promise<{ ok: true; checkout: CheckoutInfo } | { ok: false; error: string }> {
  const provider = getPaymentProvider();
  if (!provider) return { ok: false, error: "Online payments are temporarily unavailable. Please try again later." };
  const orderId = `calvy_${p.appointmentId}`;
  const payment = await prisma.payment.create({
    data: {
      businessId: p.businessId, appointmentId: p.appointmentId, provider: provider.name, providerOrderId: orderId,
      amountMinor: p.charge.chargeMinor, platformFeeMinor: p.charge.platformFeeMinor,
      businessShareMinor: p.charge.businessShareMinor, currency: p.currency.toUpperCase(),
    },
  });
  try {
    const appUrl = APP_URL();
    const order = await provider.createOrder({
      orderId, amountMinor: p.charge.chargeMinor, currency: p.currency, customer: p.client,
      returnUrl: `${appUrl}/booking/return?order_id={order_id}`,
      // Cashfree only calls public https URLs; locally the return page reconciles instead.
      ...(appUrl.startsWith("https://") ? { notifyUrl: `${appUrl}/api/payments/cashfree/webhook` } : {}),
      expiresAt: p.holdExpiresAt, note: `${p.note} · ${p.businessName}`,
      tags: { appointmentId: p.appointmentId, businessId: p.businessId },
    });
    const env = process.env.CASHFREE_ENV === "production" ? "production" : "sandbox";
    return { ok: true, checkout: { provider: provider.name, orderId: order.providerOrderId, sessionId: order.sessionId, env } };
  } catch (e) {
    logger.error("[Payments] createOrder failed", { err: e, orderId });
    await prisma.$transaction([
      prisma.payment.update({ where: { id: payment.id }, data: { status: "FAILED" } }),
      prisma.appointment.updateMany({ where: { id: p.appointmentId, status: PENDING_PAYMENT }, data: { status: EXPIRED } }),
    ]);
    return { ok: false, error: "We couldn't start the online payment. Please try again." };
  }
}

/** Service names of an appointment (multi-service bookings keep extras in notes). */
function serviceLabel(first: string, notes: string | null): string {
  if (!notes?.startsWith("__services__:")) return first;
  const extra = notes.split("\n")[0].replace("__services__:", "").split("|").filter(Boolean);
  return [first, ...extra].join(" & ");
}

/** Customer confirmation (email + WhatsApp) and owner push for a confirmed appointment. */
export async function sendConfirmationFor(appointmentId: string, opts: { paid?: boolean; contactMessages?: boolean } = {}): Promise<void> {
  const a = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: { client: true, service: true, staff: true, business: true, tokenSession: true },
  });
  if (!a) return;
  const tz = safeTimeZone(a.business.timezone);
  const serviceName = serviceLabel(a.service.name, a.notes);
  const dateLabel = formatDateLabel(a.date, tz);
  const time = a.tokenNumber ? (a.estimatedAt ? formatTimeLabel(a.estimatedAt, tz) : formatTimeLabel(a.date, tz)) : formatTimeLabel(a.date, tz);
  const token = a.tokenNumber && a.tokenSession
    ? { number: a.tokenNumber, estimatedTime: time, sessionName: a.tokenSession.name }
    : undefined;

  sendPushToBusiness(a.businessId, {
    title: opts.paid ? "New paid booking" : "New booking received",
    body: `${bookingForLabel(a)} — ${token ? `Token #${token.number} (${token.sessionName}) ` : ""}${serviceName} on ${dateLabel}${token ? "" : ` at ${time}`}`,
    url: "/dashboard/appointments",
    tag: "new-booking",
  }).catch(() => {});

  if (opts.contactMessages === false) return; // flood protection: the business was told, the contact is not messaged

  if (a.client.email) {
    try {
      await sendBookingConfirmation({
        to: a.client.email, clientName: a.client.name, patientName: a.patientName ?? undefined, businessName: a.business.name, serviceName,
        staffName: a.staff?.name ?? `Your ${t(a.business, "staff")}`, terms: a.business,
        date: dateLabel, time, duration: a.duration, price: a.price,
        currency: a.business.currency ?? DEFAULT_CURRENCY, appointmentDate: a.date, token,
        online: a.isOnline ? { meetingUrl: meetingUrlFor(a) } : undefined,
        trackUrl: token ? trackingUrl(a.business.slug, a.id) ?? undefined : undefined,
        ctx: { appointmentId: a.id, businessId: a.businessId },
      });
    } catch (e) {
      logger.error("[Email] Failed:", { err: e });
    }
  }
  if (a.client.phone) {
    try {
      await sendBookingConfirmationWhatsApp({
        to: a.client.phone, clientName: a.client.name, serviceName, businessName: a.business.name,
        date: dateLabel, time: token ? `${time} (Token #${token.number})` : time,
      });
    } catch (e) {
      logger.error("[WhatsApp] Failed:", { err: e });
    }
  }
}

/**
 * Refund (part of) a payment through its gateway. The payment is claimed (status REFUNDED) before
 * the gateway call so two callers can never refund twice; a gateway error rolls the claim back.
 */
export async function refundPayment(paymentId: string, amountMinor: number, reason: string, provider: PaymentProvider | null = getPaymentProvider()): Promise<boolean> {
  if (!provider || amountMinor <= 0) return false;
  // Claim and credit-check under the payment lock: a payment that already became wallet credit is
  // never refunded as well (the customer would be paid twice).
  const claimed = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${paymentLockKey(paymentId)}, 0))`;
    const credits = await tx.customerCredit.findMany({ where: { paymentId }, select: { kind: true, amountMinor: true } });
    if (refundBlockedByCredit(credits)) return { count: 0, blocked: true };
    return { ...(await tx.payment.updateMany({ where: { id: paymentId, status: "PAID" }, data: { status: "REFUNDED", refundedMinor: amountMinor } })), blocked: false };
  }, BOOKING_TX_OPTIONS);
  if (claimed.blocked) logger.warn("[Payments] refund refused: this payment already became wallet credit", { paymentId });
  if (claimed.count === 0) return false;
  const payment = await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });
  try {
    await provider.refund({ providerOrderId: payment.providerOrderId, refundId: `refund_${paymentId}`, amountMinor, note: reason });
  } catch (e) {
    logger.error("[Payments] refund failed", { err: e, paymentId });
    await prisma.payment.update({ where: { id: paymentId }, data: { status: "PAID", refundedMinor: 0 } });
    return false;
  }
  // A full refund returns the platform fee too; the ledger records it only if it was charged
  // (a hold refunded after expiry was never confirmed, so it has no CHARGED entry).
  const charged = await prisma.platformFeeEntry.count({ where: { paymentId, kind: "CHARGED" } });
  if (amountMinor >= payment.amountMinor && payment.platformFeeMinor > 0 && charged > 0) {
    await prisma.platformFeeEntry.create({
      data: { businessId: payment.businessId, appointmentId: payment.appointmentId, paymentId, kind: "REFUNDED", amountMinor: payment.platformFeeMinor },
    });
  }
  return true;
}

export type SettleResult = "confirmed" | "refunded" | "noop";

/**
 * A payment succeeded: confirm its live hold (fee ledger CHARGED + confirmation email), or refund
 * it when the hold already lapsed. Safe to call repeatedly (webhook retries, return page).
 */
export async function settlePaidPayment(paymentId: string): Promise<SettleResult> {
  const decision = await prisma.$transaction(async (tx) => {
    const payment = await tx.payment.findUnique({ where: { id: paymentId } });
    if (!payment?.appointmentId || payment.status !== "PAID") return { action: "noop" as const };
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${"appt:" + payment.appointmentId}, 0))`;
    const appt = await tx.appointment.findUnique({ where: { id: payment.appointmentId }, select: { id: true, status: true, holdExpiresAt: true, clientId: true, date: true } });
    if (!appt) return { action: "noop" as const };
    const action = onPaid(appt);
    if (action === "confirm") {
      await tx.appointment.update({ where: { id: appt.id }, data: { status: "confirmed", paymentStatus: "paid", holdExpiresAt: null } });
      await tx.client.update({ where: { id: appt.clientId }, data: { totalAppointments: { increment: 1 }, lastVisit: appt.date } });
      if (payment.platformFeeMinor > 0) {
        await tx.platformFeeEntry.create({
          data: { businessId: payment.businessId, appointmentId: appt.id, paymentId, kind: "CHARGED", amountMinor: payment.platformFeeMinor },
        });
      }
    } else if (action === "refund" && appt.status === PENDING_PAYMENT) {
      await tx.appointment.update({ where: { id: appt.id }, data: { status: EXPIRED } });
    }
    return { action, appointmentId: appt.id, amountMinor: payment.amountMinor };
  }, BOOKING_TX_OPTIONS);

  if (decision.action === "confirm") {
    await sendConfirmationFor(decision.appointmentId, { paid: true });
    return "confirmed";
  }
  if (decision.action === "refund") {
    await refundPayment(paymentId, decision.amountMinor, "Booking hold expired before payment completed");
    return "refunded";
  }
  return "noop";
}

/** Daily sweep: mark lapsed holds expired and their unpaid payments EXPIRED (reads already ignore them). */
export async function releaseExpiredHolds(now: Date = new Date()): Promise<number> {
  const lapsed = await prisma.appointment.findMany({
    where: { status: PENDING_PAYMENT, holdExpiresAt: { lte: now } },
    select: { id: true },
  });
  if (!lapsed.length) return 0;
  const ids = lapsed.map((a) => a.id);
  await prisma.$transaction([
    prisma.appointment.updateMany({ where: { id: { in: ids }, status: PENDING_PAYMENT }, data: { status: EXPIRED } }),
    prisma.payment.updateMany({ where: { appointmentId: { in: ids }, status: { in: ["CREATED", "FAILED"] } }, data: { status: "EXPIRED" } }),
  ]);
  return ids.length;
}

export type OrderView = "pending" | "confirmed" | "failed" | "expired" | "refunded" | "unknown";

/**
 * Bring a payment up to date from the gateway (used by the return page, so bookings confirm even
 * when the webhook has not arrived) and say where the booking stands.
 */
export async function reconcileOrder(orderId: string): Promise<{ view: OrderView; appointmentId: string | null }> {
  const payment = await prisma.payment.findUnique({ where: { providerOrderId: orderId } });
  if (!payment) return { view: "unknown", appointmentId: null };
  const provider = getPaymentProvider();

  if ((payment.status === "CREATED" || payment.status === "FAILED") && provider && provider.name === payment.provider) {
    const state = await provider.getOrderState(orderId).catch(() => "UNKNOWN" as const);
    if (state === "PAID") {
      await applyPaymentEvent(prismaPaymentEventStore, payment.provider, {
        eventId: `reconcile:${orderId}`, kind: "PAID", providerOrderId: orderId, amountMinor: null, method: null, paymentRef: null,
      });
    }
  }
  const fresh = await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
  if (fresh.status === "PAID") await settlePaidPayment(fresh.id);

  const final = await prisma.payment.findUniqueOrThrow({ where: { id: payment.id }, include: { appointment: { select: { status: true, holdExpiresAt: true } } } });
  const appt = final.appointment;
  let view: OrderView = "pending";
  if (final.status === "REFUNDED") view = "refunded";
  else if (appt?.status === "confirmed" || appt?.status === "completed") view = "confirmed";
  else if (appt?.status === EXPIRED || final.status === "EXPIRED") view = "expired";
  else if (appt?.status === PENDING_PAYMENT && appt.holdExpiresAt && appt.holdExpiresAt <= new Date()) view = "expired";
  else if (final.status === "FAILED") view = "failed";
  return { view, appointmentId: final.appointmentId };
}
