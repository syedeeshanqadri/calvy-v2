import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { creditBalance, creditForPayment, paymentLockKey, type CreditKind } from "@/lib/credit";

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
