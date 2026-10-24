import { createCashfreeProvider } from "./cashfree";
import { createMockProvider } from "./mock";
import type { PaymentProvider } from "./provider";

let cached: PaymentProvider | null | undefined;

/**
 * The gateway for online booking payments: Cashfree when its keys are set, the in-memory mock in
 * dev/test without keys, and null in production without keys (callers must fail closed).
 */
export function getPaymentProvider(env: NodeJS.ProcessEnv = process.env): PaymentProvider | null {
  if (env === process.env && cached !== undefined) return cached;
  let provider: PaymentProvider | null;
  if (env.CASHFREE_APP_ID && env.CASHFREE_SECRET_KEY) {
    provider = createCashfreeProvider({
      appId: env.CASHFREE_APP_ID,
      secretKey: env.CASHFREE_SECRET_KEY,
      env: env.CASHFREE_ENV === "production" ? "production" : "sandbox",
    });
  } else {
    provider = env.NODE_ENV === "production" ? null : createMockProvider();
  }
  if (env === process.env) cached = provider;
  return provider;
}

export * from "./provider";
