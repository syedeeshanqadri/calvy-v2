/** Fields an admin must never see in clear, in view-as or anywhere in the admin console: bank, PAN and gateway account details. */
const SECRET_FIELDS = [
  "bankAccountName", "bankAccountNumber", "bankRoutingNumber", "bankIban", "panNumber", "gstNumber",
  "razorpayConnectAccountId", "razorpayStakeholderId", "razorpayRouteProductId", "razorpayCustomerId", "razorpaySubscriptionId",
] as const;

export const MASK = "••••••";

/** A copy with every secret field replaced by a mask (empty ones stay empty, so the screen still shows what is set). */
export function redactSecrets<T extends Record<string, unknown>>(row: T): T {
  const out: Record<string, unknown> = { ...row };
  for (const f of SECRET_FIELDS) if (f in out) out[f] = out[f] ? MASK : out[f] ?? "";
  return out as T;
}
