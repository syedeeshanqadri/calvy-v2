// Browser side: load a payment gateway's checkout script and, when it cannot load, say WHY in words a customer can act on, with a reference id
// that is also logged on the server so support can find it.
//   blocked      the page's Content-Security-Policy refused the script (a `securitypolicyviolation` event named it)
//   network      the request failed (offline, an ad blocker, the gateway is down)
//   not_started  the script loaded but the gateway's object was missing or did not start (a gateway-side problem)
export type PaymentScriptFailure = "blocked" | "network" | "not_started";

export class PaymentScriptError extends Error {
  constructor(public kind: PaymentScriptFailure, public provider: string, public reference: string) {
    super(paymentScriptMessage(kind, provider, reference));
    this.name = "PaymentScriptError";
  }
}

/** A short id the customer can quote, like PAY-7K3QX9. */
export function newReference(): string {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let s = "";
  const bytes = typeof crypto !== "undefined" && crypto.getRandomValues ? crypto.getRandomValues(new Uint8Array(6)) : Uint8Array.from({ length: 6 }, () => Math.floor(Math.random() * 256));
  for (const b of bytes) s += alphabet[b % alphabet.length];
  return `PAY-${s}`;
}

export function paymentScriptMessage(kind: PaymentScriptFailure, provider: string, reference: string): string {
  if (kind === "blocked") return `Your browser blocked the ${provider} payment page because of a security setting. Please contact support and quote reference ${reference}.`;
  if (kind === "network") return `We could not reach the ${provider} payment page. Check your connection, turn off any ad blocker for this page, and try again. Reference ${reference}.`;
  return `The ${provider} payment page loaded but could not start. Please try again in a moment. Reference ${reference}.`;
}

/** Tell the server (so the reference is logged). Best effort: never throws and never delays the message. */
export function reportPaymentScriptFailure(f: { reference: string; kind: PaymentScriptFailure; provider: string; src: string }): void {
  try {
    const body = JSON.stringify({ reference: f.reference, kind: f.kind, provider: f.provider, host: new URL(f.src).host, page: window.location.pathname.slice(0, 120) });
    if (navigator.sendBeacon) navigator.sendBeacon("/api/client-errors/payment-script", new Blob([body], { type: "application/json" }));
    else void fetch("/api/client-errors/payment-script", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true });
  } catch { /* the message is still shown */ }
}

/**
 * Load a gateway script once. On failure throws a PaymentScriptError whose message says whether the policy blocked it or the network failed.
 * `already` lets a caller skip loading when the gateway's global is already there.
 */
export function loadPaymentScript(src: string, provider: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    let blocked = false;
    const onViolation = (e: SecurityPolicyViolationEvent) => {
      if (e.blockedURI && src.startsWith(e.blockedURI.split("?")[0].replace(/\/$/, "")) && e.violatedDirective.startsWith("script-src")) blocked = true;
      else if (e.blockedURI === src && e.violatedDirective.startsWith("script-src")) blocked = true;
    };
    document.addEventListener("securitypolicyviolation", onViolation);
    const fail = (kind: PaymentScriptFailure) => {
      document.removeEventListener("securitypolicyviolation", onViolation);
      const err = new PaymentScriptError(kind, provider, newReference());
      reportPaymentScriptFailure({ reference: err.reference, kind, provider, src });
      reject(err);
    };
    const el = document.createElement("script");
    el.src = src;
    el.async = true;
    el.onload = () => { document.removeEventListener("securitypolicyviolation", onViolation); resolve(); };
    el.onerror = () => fail(blocked ? "blocked" : "network");
    document.head.appendChild(el);
  });
}

/** The script loaded but its global is missing: a gateway-side problem, reported with a reference. */
export function notStarted(provider: string, src: string): PaymentScriptError {
  const err = new PaymentScriptError("not_started", provider, newReference());
  reportPaymentScriptFailure({ reference: err.reference, kind: "not_started", provider, src });
  return err;
}
