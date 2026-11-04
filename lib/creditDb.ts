import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { creditBalance, creditForPayment, creditToRemove, paymentLockKey, type CreditKind } from "@/lib/credit";
import { signTicket, verifyTicket } from "@/lib/signedTicket";
import { tryNormalizeEmail } from "@/lib/email-normalize";

type Db = Prisma.TransactionClient | typeof prisma;

/**
 * Credit a missed or cancelled online-paid booking to the customer's wallet at that clinic.
 * Returns the amount credited (null when nothing was paid online). Safe to repeat: one credit per
 * booking per cause, enforced by a unique index.
 */
export async function creditClosedBooking(
  tx: Prisma.TransactionClient,
  p: { businessId: string; clientId: string; appointmentId: string; kind: Extract<CreditKind, "MISSED" | "CANCELLED">; note?: string },
): Promise<{ amountMinor: number; currency: string } | null> {
  const existing = await tx.customerCredit.findUnique({ where: { appointmentId_kind: { appointmentId: p.appointmentId, kind: p.kind } } });
  if (existing) return { amountMinor: existing.amountMinor, currency: existing.currency };

  const found = await tx.payment.findFirst({ where: { appointmentId: p.appointmentId, status: "PAID" }, orderBy: { createdAt: "desc" }, select: { id: true } });
  if (!found) return null;
  // Same lock as refundPayment: either the refund wins (then nothing is left to credit) or the
  // credit wins (then the refund is refused). Never both.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${paymentLockKey(found.id)}, 0))`;
  // Re-read under the lock: a refund that committed while we waited has changed the status.
  const payment = await tx.payment.findFirst({ where: { id: found.id, status: "PAID", refundedMinor: 0 } });
  if (!payment) return null;
  const amountMinor = creditForPayment(payment);
  if (amountMinor <= 0) return null;

  await tx.customerCredit.create({
    data: {
      businessId: p.businessId, clientId: p.clientId, kind: p.kind, amountMinor, currency: payment.currency,
      appointmentId: p.appointmentId, paymentId: payment.id,
      note: p.note ?? (p.kind === "MISSED" ? "Missed appointment" : "Cancelled at reception"),
    },
  });
  return { amountMinor, currency: payment.currency };
}

/** A customer's wallet balance at one clinic. */
export async function walletBalance(db: Db, businessId: string, clientId: string): Promise<number> {
  const rows = await db.customerCredit.findMany({ where: { businessId, clientId }, select: { amountMinor: true } });
  return creditBalance(rows);
}

/** One wallet (one client at one business) is changed by one transaction at a time: spending and removing credit cannot overlap. */
const walletLockKey = (businessId: string, clientId: string) => `wallet:${businessId}:${clientId}`;

export class InsufficientCreditError extends Error {
  constructor() { super("Your credit changed while you were booking. Please try again."); }
}

/**
 * Spend credit on a booking: a negative USED entry tied to the appointment, written in the booking's own
 * transaction. Re-checks the balance under the wallet lock, so two parallel bookings cannot spend it twice.
 * One USED entry per appointment (unique index).
 */
export async function spendCredit(
  tx: Prisma.TransactionClient,
  p: { businessId: string; clientId: string; appointmentId: string; amountMinor: number; currency: string },
): Promise<void> {
  if (p.amountMinor <= 0) return;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${walletLockKey(p.businessId, p.clientId)}, 0))`;
  if ((await walletBalance(tx, p.businessId, p.clientId)) < p.amountMinor) throw new InsufficientCreditError();
  await tx.customerCredit.create({
    data: { businessId: p.businessId, clientId: p.clientId, kind: "USED", amountMinor: -p.amountMinor, currency: p.currency, appointmentId: p.appointmentId, note: "Used on a booking" },
  });
}

/**
 * The clinic returned the fee by hand (cash/UPI) for a booking that had become wallet credit: that credit leaves the
 * wallet, so the customer is not paid twice. Only what is still in the wallet can be removed. One removal per booking.
 */
export async function removeCreditForReturn(
  tx: Prisma.TransactionClient,
  p: { businessId: string; clientId: string; appointmentId: string },
): Promise<number> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${walletLockKey(p.businessId, p.clientId)}, 0))`;
  const entries = await tx.customerCredit.findMany({ where: { appointmentId: p.appointmentId, businessId: p.businessId }, select: { kind: true, amountMinor: true, currency: true } });
  if (entries.some((e) => e.kind === "REFUND_REMOVED")) return 0;
  const issued = entries.filter((e) => e.kind === "MISSED" || e.kind === "CANCELLED").reduce((n, e) => n + e.amountMinor, 0);
  if (issued <= 0) return 0;
  const removeMinor = creditToRemove(issued, 0, await walletBalance(tx, p.businessId, p.clientId));
  if (removeMinor <= 0) return 0;
  await tx.customerCredit.create({
    data: { businessId: p.businessId, clientId: p.clientId, kind: "REFUND_REMOVED", amountMinor: -removeMinor, currency: entries[0].currency, appointmentId: p.appointmentId, note: "Fee returned by the clinic" },
  });
  return removeMinor;
}

/* ── "Use my credit" ticket: the signed-in verified customer proves who they are (the booking page may be on another host) ── */
const CREDIT_PURPOSE = "use-credit";
const CREDIT_TTL_MS = 60 * 60_000;

export function signCreditTicket(customerId: string, businessId: string): string {
  return signTicket(CREDIT_PURPOSE, `${customerId}:${businessId}`, process.env.NEXTAUTH_SECRET ?? "", CREDIT_TTL_MS);
}

export function readCreditTicket(ticket: string | null | undefined): { customerId: string; businessId: string } | null {
  const v = verifyTicket(CREDIT_PURPOSE, ticket, process.env.NEXTAUTH_SECRET ?? "");
  const [customerId, businessId, extra] = (v ?? "").split(":");
  return customerId && businessId && extra === undefined ? { customerId, businessId } : null;
}

export class CreditTicketError extends Error {
  constructor() { super("Your credit link has expired. Open it again from My wallet."); }
}

/**
 * The credit a ticket may spend for this booking: the ticket's customer must be verified, the ticket must be for this
 * business, and the booking's client must have that customer's verified email. Returns the client's balance.
 */
export async function creditForTicket(
  db: Db,
  ticket: string,
  business: { id: string },
  client: { id: string; email: string | null },
): Promise<{ balanceMinor: number }> {
  const t = readCreditTicket(ticket);
  if (!t || t.businessId !== business.id) throw new CreditTicketError();
  const customer = await db.customer.findUnique({ where: { id: t.customerId }, select: { email: true, emailVerified: true } });
  if (!customer?.emailVerified) throw new CreditTicketError();
  // A booking made with someone else's contact details never touches this wallet.
  if (!client.email || tryNormalizeEmail(client.email) !== tryNormalizeEmail(customer.email)) return { balanceMinor: 0 };
  return { balanceMinor: Math.max(0, await walletBalance(db, business.id, client.id)) };
}

/** For the booking page: what credit this ticket has at the business (to show "Using your credit"). Null if none. */
export async function creditOfferFromQuery(
  value: string | string[] | undefined,
  business: { id: string; currency: string | null },
): Promise<{ ticket: string; balanceMinor: number; email: string } | null> {
  const ticket = Array.isArray(value) ? value[0] : value;
  const t = readCreditTicket(ticket);
  if (!ticket || !t || t.businessId !== business.id) return null;
  const customer = await prisma.customer.findUnique({ where: { id: t.customerId }, select: { email: true, emailVerified: true } });
  if (!customer?.emailVerified) return null;
  const client = await prisma.client.findFirst({ where: { businessId: business.id, email: { equals: customer.email, mode: "insensitive" } }, select: { id: true } });
  if (!client) return null;
  const balanceMinor = await walletBalance(prisma, business.id, client.id);
  return balanceMinor > 0 ? { ticket: ticket as string, balanceMinor, email: customer.email } : null;
}
