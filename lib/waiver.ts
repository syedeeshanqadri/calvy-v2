// The Rs 10 confirmation fee is never refunded when a confirmed booking is cancelled or not attended. Instead the booking
// shows "Not attended — confirmation still valid", and the customer's NEXT booking at the same business skips the fee once.
// This replaces the old money wallet: no balance, no withdrawals, nothing to pay out.
import { Prisma } from "@prisma/client";
import type { prisma } from "@/lib/prisma";

type Db = Prisma.TransactionClient | typeof prisma;

export const NOT_ATTENDED_LABEL = "Not attended — confirmation still valid";
export const WAIVER_NOTE = "Your Rs 10 confirmation fee is kept, and you can rebook once at this business without paying it again.";

/**
 * A confirmed booking was cancelled or not attended: keep the Rs 10 and remember it for one free rebooking.
 * Only Calvy's own confirmation fee counts (a payment taken by the business's gateway never creates a waiver).
 * Safe to repeat: one waiver per booking (unique index). Returns true when the booking now has a waiver.
 */
export async function keepConfirmationFee(tx: Prisma.TransactionClient, p: { businessId: string; clientId: string; appointmentId: string }): Promise<boolean> {
  const existing = await tx.confirmationWaiver.findUnique({ where: { sourceAppointmentId: p.appointmentId }, select: { id: true } });
  if (existing) return true;
  const fee = await tx.payment.findFirst({
    where: { appointmentId: p.appointmentId, businessId: p.businessId, status: "PAID", gatewayId: null, platformFeeMinor: { gt: 0 } },
    select: { id: true },
  });
  if (!fee) return false;
  try {
    await tx.confirmationWaiver.create({ data: { businessId: p.businessId, clientId: p.clientId, sourceAppointmentId: p.appointmentId } });
  } catch (e) {
    if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")) throw e;
  }
  return true;
}

/** Does this customer have an unused waiver at this business? */
export async function waiverAvailable(db: Db, businessId: string, clientId: string): Promise<boolean> {
  return (await db.confirmationWaiver.count({ where: { businessId, clientId, usedAppointmentId: null } })) > 0;
}

/**
 * Use the customer's waiver for a new booking (inside the booking's transaction). One use only: the conditional update means
 * two parallel bookings cannot both claim it. Returns true when this booking got the fee waived.
 */
export async function claimWaiver(tx: Prisma.TransactionClient, p: { businessId: string; clientId: string; appointmentId: string }): Promise<boolean> {
  const w = await tx.confirmationWaiver.findFirst({ where: { businessId: p.businessId, clientId: p.clientId, usedAppointmentId: null }, orderBy: { createdAt: "asc" }, select: { id: true } });
  if (!w) return false;
  const claimed = await tx.confirmationWaiver.updateMany({ where: { id: w.id, usedAppointmentId: null }, data: { usedAppointmentId: p.appointmentId, usedAt: new Date() } });
  return claimed.count === 1;
}

/** The booking that used the waiver will not happen (cancelled by the business, hold lapsed): the customer gets it back. */
export async function releaseWaiver(tx: Prisma.TransactionClient, appointmentId: string): Promise<void> {
  await tx.confirmationWaiver.updateMany({ where: { usedAppointmentId: appointmentId }, data: { usedAppointmentId: null, usedAt: null } });
}

/** True when this payment's booking already kept its fee, so refunding the Rs 10 now would pay the customer twice. */
export async function feeKept(tx: Db, appointmentId: string | null): Promise<boolean> {
  if (!appointmentId) return false;
  return (await tx.confirmationWaiver.count({ where: { sourceAppointmentId: appointmentId } })) > 0;
}
