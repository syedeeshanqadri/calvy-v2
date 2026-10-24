import type { PaymentEvent, ProviderName } from "./provider";

export type PayStatus = "CREATED" | "PAID" | "FAILED" | "EXPIRED" | "REFUNDED";

/**
 * Payment status after a webhook. PAID and REFUNDED are final for webhooks (a late FAILED or a
 * dropped checkout never undoes a payment); a failed attempt can still be followed by a success.
 * Returns null when the event changes nothing.
 */
export function nextPayStatus(current: PayStatus, event: Pick<PaymentEvent, "kind">): PayStatus | null {
  if (current === "PAID" || current === "REFUNDED") return null;
  if (event.kind === "PAID") return "PAID";
  if (event.kind === "FAILED" && current === "CREATED") return "FAILED";
  return null;
}

/** Storage for applyPaymentEvent; `transaction` runs everything atomically. */
export interface PaymentEventStore<Tx> {
  transaction<R>(fn: (tx: Tx) => Promise<R>): Promise<R>;
  /** Record the event; false when (provider, eventId) was already recorded. */
  recordEvent(tx: Tx, provider: ProviderName, event: PaymentEvent): Promise<boolean>;
  findPayment(tx: Tx, provider: ProviderName, providerOrderId: string): Promise<{ id: string; status: PayStatus; amountMinor: number } | null>;
  updatePayment(tx: Tx, id: string, data: { status: PayStatus; method: string | null; paymentRef: string | null }): Promise<void>;
}

export type ApplyOutcome =
  | { result: "duplicate" }
  | { result: "unknown_order" }
  | { result: "amount_mismatch"; paymentId: string }
  | { result: "unchanged"; paymentId: string; status: PayStatus }
  | { result: "updated"; paymentId: string; from: PayStatus; to: PayStatus };

/**
 * Apply a verified webhook exactly once. A redelivered event is a no-op; a PAID event whose amount
 * differs from the order is not applied (kept for review).
 */
export async function applyPaymentEvent<Tx>(store: PaymentEventStore<Tx>, provider: ProviderName, event: PaymentEvent): Promise<ApplyOutcome> {
  return store.transaction(async (tx) => {
    if (!(await store.recordEvent(tx, provider, event))) return { result: "duplicate" as const };
    const payment = await store.findPayment(tx, provider, event.providerOrderId);
    if (!payment) return { result: "unknown_order" as const };
    if (event.kind === "PAID" && event.amountMinor !== null && event.amountMinor !== payment.amountMinor) {
      return { result: "amount_mismatch" as const, paymentId: payment.id };
    }
    const to = nextPayStatus(payment.status, event);
    if (!to) return { result: "unchanged" as const, paymentId: payment.id, status: payment.status };
    await store.updatePayment(tx, payment.id, { status: to, method: event.method, paymentRef: event.paymentRef });
    return { result: "updated" as const, paymentId: payment.id, from: payment.status, to };
  });
}
