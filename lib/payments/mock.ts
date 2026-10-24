import { createHmac } from "node:crypto";
import type { OrderState, PaymentEvent, PaymentEventKind, PaymentProvider } from "./provider";

// In-memory gateway for tests and local dev without Cashfree keys. Never used in production.
const MOCK_SECRET = "calvy-mock-gateway";

interface MockOrder { amountMinor: number; state: OrderState; refundedMinor: number }

/** Sign a mock webhook body (used by tests and the dev mock checkout). */
export function signMockWebhook(rawBody: string): string {
  return createHmac("sha256", MOCK_SECRET).update(rawBody).digest("hex");
}

export function createMockProvider(): PaymentProvider & {
  /** Simulate the customer paying (or failing); returns the webhook body + headers the gateway would send. */
  simulate(providerOrderId: string, kind: PaymentEventKind): { rawBody: string; headers: Headers };
} {
  const orders = new Map<string, MockOrder>();
  let seq = 0;

  return {
    name: "MOCK",

    async createOrder(input) {
      if (orders.has(input.orderId)) throw new Error(`order ${input.orderId} already exists`);
      orders.set(input.orderId, { amountMinor: input.amountMinor, state: "ACTIVE", refundedMinor: 0 });
      return { providerOrderId: input.orderId, sessionId: `mock_session_${input.orderId}`, expiresAt: null };
    },

    async getOrderState(providerOrderId) {
      return orders.get(providerOrderId)?.state ?? "UNKNOWN";
    },

    async refund(input) {
      const o = orders.get(input.providerOrderId);
      if (!o || o.state !== "PAID") throw new Error("only paid orders can be refunded");
      if (o.refundedMinor + input.amountMinor > o.amountMinor) throw new Error("refund exceeds the amount paid");
      o.refundedMinor += input.amountMinor;
      return { refundRef: `mock_refund_${input.refundId}` };
    },

    verifyWebhook(rawBody, headers): PaymentEvent | null {
      if (headers.get("x-mock-signature") !== signMockWebhook(rawBody)) return null;
      try {
        return JSON.parse(rawBody) as PaymentEvent;
      } catch {
        return null;
      }
    },

    simulate(providerOrderId, kind) {
      const o = orders.get(providerOrderId);
      if (!o) throw new Error(`unknown order ${providerOrderId}`);
      if (kind === "PAID") o.state = "PAID";
      const event: PaymentEvent = {
        eventId: `mock_evt_${++seq}`, kind, providerOrderId,
        amountMinor: o.amountMinor, method: "upi", paymentRef: `mock_pay_${seq}`,
      };
      const rawBody = JSON.stringify(event);
      return { rawBody, headers: new Headers({ "x-mock-signature": signMockWebhook(rawBody) }) };
    },
  };
}
