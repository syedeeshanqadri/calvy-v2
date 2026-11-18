// Browser side of checkout: open the gateway's hosted payment page for a pending booking.
import type { CheckoutInfo } from "@/lib/onlinePayment";

const CASHFREE_SDK = "https://sdk.cashfree.com/js/v3/cashfree.js";

type CashfreeFactory = (opts: { mode: "sandbox" | "production" }) => {
  checkout(opts: { paymentSessionId: string; redirectTarget: "_self" }): Promise<unknown>;
};

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const el = document.createElement("script");
    el.src = src;
    el.async = true;
    el.onload = () => resolve();
    el.onerror = () => reject(new Error("Could not load the payment page. Check your connection and try again."));
    document.head.appendChild(el);
  });
}

/** Sends the customer to pay; they come back to /booking/return?order_id=... */
export async function launchCheckout(c: CheckoutInfo): Promise<void> {
  if (c.provider === "MOCK") {
    window.location.assign(new URL(`/booking/mock-checkout?order_id=${encodeURIComponent(c.orderId)}`, window.location.origin).href);
    return;
  }
  // PayU, CCAvenue and Paytm take the customer over with a form POST to their page.
  if (c.post) {
    const form = document.createElement("form");
    form.method = "POST";
    form.action = c.post.url;
    for (const [name, value] of Object.entries(c.post.fields)) {
      const input = document.createElement("input");
      input.type = "hidden"; input.name = name; input.value = value;
      form.appendChild(input);
    }
    document.body.appendChild(form);
    form.submit();
    return;
  }
  // Razorpay, PhonePe, Stripe and PayPal send the customer to their hosted payment page.
  if (c.redirect) {
    window.location.assign(c.sessionId);
    return;
  }
  await loadScript(CASHFREE_SDK);
  const factory = (window as unknown as { Cashfree?: CashfreeFactory }).Cashfree;
  if (!factory) throw new Error("Could not load the payment page. Please try again.");
  await factory({ mode: c.env }).checkout({ paymentSessionId: c.sessionId, redirectTarget: "_self" });
}
