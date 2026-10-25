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
