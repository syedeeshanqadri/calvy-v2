// Helpers for gateways that talk in url-encoded forms and take the customer over with a form POST (PayU, CCAvenue, Paytm).

/** Parse "a=1&b=2" into a plain object (first value wins). */
export function parseForm(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of new URLSearchParams(raw)) if (!(k in out)) out[k] = v;
  return out;
}

/**
 * These gateways send the customer back with a POST, which the booking return PAGE cannot take. They are pointed at
 * /api/payments/return instead, which answers with a redirect to the normal return page for the same order.
 */
export function postReturnUrl(returnUrl: string, orderId: string): string {
  const base = returnUrl.split("/booking/return")[0];
  return `${base}/api/payments/return?order_id=${encodeURIComponent(orderId)}`;
}
