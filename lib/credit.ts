// Customer wallet credit (pure rules). Money in minor units. The ledger is append-only:
// balance = sum of entries. Credit is per customer per clinic and never expires.
import { formatCurrencyAmount } from "@/lib/currency";

export type CreditKind = "MISSED" | "CANCELLED" | "USED" | "REFUND_REMOVED" | "ADJUSTMENT";

/**
 * What a missed or cancelled booking turns into: everything the customer paid online and that has
 * not been refunded. Nothing when the payment is not settled (unpaid, failed, expired, refunded).
 */
export function creditForPayment(p: { status: string; amountMinor: number; refundedMinor: number }): number {
  if (p.status !== "PAID") return 0;
  return Math.max(0, p.amountMinor - p.refundedMinor);
}

export function creditBalance(entries: { amountMinor: number }[]): number {
  return entries.reduce((sum, e) => sum + e.amountMinor, 0);
}

/** "Rs 10.00" style label for emails and messages. */
export function creditLabel(amountMinor: number, currency: string): string {
  return formatCurrencyAmount(amountMinor / 100, currency);
}

/**
 * Using credit on a new booking: how much of the charge the wallet covers and what is left to pay
 * online. Credit never exceeds the balance or the charge.
 */
export function applyCredit(chargeMinor: number, balanceMinor: number): { usedMinor: number; payMinor: number } {
  const usedMinor = Math.max(0, Math.min(chargeMinor, balanceMinor));
  return { usedMinor, payMinor: chargeMinor - usedMinor };
}

/** Advisory-lock key serialising everything that moves one payment's money (credit it, refund it). */
export const paymentLockKey = (paymentId: string) => `pay:${paymentId}`;

/**
 * A payment whose money already became wallet credit must not also be refunded: the customer would
 * be paid twice. Credit entries that came from a payment block refunding it; to refund, the clinic
 * first removes the credit (a REFUND_REMOVED entry), which comes with the refund screen.
 */
export function refundBlockedByCredit(entries: { kind: CreditKind; amountMinor: number }[]): boolean {
  const issued = entries.filter((e) => e.kind === "MISSED" || e.kind === "CANCELLED").reduce((n, e) => n + e.amountMinor, 0);
  const removed = entries.filter((e) => e.kind === "REFUND_REMOVED").reduce((n, e) => n + -e.amountMinor, 0);
  return issued - removed > 0;
}

/** Calvy platform fee and the business's share of an online charge (minor units). */
export interface ChargeParts { chargeMinor: number; platformFeeMinor: number; businessShareMinor: number }

/**
 * What is left to pay online after wallet credit covered `usedMinor` of the charge. The platform fee and the
 * business share shrink in proportion, so the parts still add up to the new charge. Fully covered: nothing is
 * charged and no fee is taken (the money was already paid when the credit was created).
 */
export function reduceCharge(charge: ChargeParts, usedMinor: number): ChargeParts {
  const used = Math.max(0, Math.min(usedMinor, charge.chargeMinor));
  const pay = charge.chargeMinor - used;
  if (pay <= 0) return { chargeMinor: 0, platformFeeMinor: 0, businessShareMinor: 0 };
  if (used === 0) return { ...charge };
  const platformFeeMinor = Math.min(pay, Math.round((charge.platformFeeMinor * pay) / charge.chargeMinor));
  return { chargeMinor: pay, platformFeeMinor, businessShareMinor: pay - platformFeeMinor };
}

/** How much credit a returned fee takes back out of the wallet: what that booking issued, never more than the balance (spent credit cannot be recalled). */
export function creditToRemove(issuedMinor: number, alreadyRemovedMinor: number, balanceMinor: number): number {
  return Math.max(0, Math.min(issuedMinor - alreadyRemovedMinor, balanceMinor));
}
