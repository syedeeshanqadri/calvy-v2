// Payment gateway interface. Implementations: mock.ts (tests, dev without keys) and cashfree.ts.
// Money is in integer minor units; adapters convert to the gateway's format.

export type ProviderName = "MOCK" | "CASHFREE";

export interface CreateOrderInput {
  /** Our order id (also the gateway's order_id): unique, [A-Za-z0-9_-], max 45 chars. */
  orderId: string;
  amountMinor: number;
  currency: string;
  customer: { id: string; name: string; email: string; phone: string };
  /** Where the customer lands after checkout. Cashfree replaces {order_id}. */
  returnUrl: string;
  /** Webhook URL for this order (defaults to the one set in the gateway dashboard). */
  notifyUrl?: string;
  note?: string;
  tags?: Record<string, string>;
}

export interface CreatedOrder {
  providerOrderId: string;
  /** Token the checkout page needs (Cashfree payment_session_id). */
  sessionId: string;
  expiresAt: Date | null;
}

export type OrderState = "ACTIVE" | "PAID" | "EXPIRED" | "TERMINATED" | "UNKNOWN";

export interface RefundInput {
  providerOrderId: string;
  /** Our refund id: unique per refund, makes retries safe. */
  refundId: string;
  amountMinor: number;
  note?: string;
}

export type PaymentEventKind = "PAID" | "FAILED" | "DROPPED" | "OTHER";

/** A verified gateway webhook, normalised. */
export interface PaymentEvent {
  /** Stable id for idempotency (the same event delivered twice has the same id). */
  eventId: string;
  kind: PaymentEventKind;
  providerOrderId: string;
  amountMinor: number | null;
  method: string | null;
  /** Gateway's payment reference. */
  paymentRef: string | null;
}

export interface PaymentProvider {
  readonly name: ProviderName;
  createOrder(input: CreateOrderInput): Promise<CreatedOrder>;
  getOrderState(providerOrderId: string): Promise<OrderState>;
  refund(input: RefundInput): Promise<{ refundRef: string }>;
  /** Returns the normalised event, or null when the signature is missing or wrong. */
  verifyWebhook(rawBody: string, headers: Headers): PaymentEvent | null;
}

export class PaymentProviderError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "PaymentProviderError";
  }
}
