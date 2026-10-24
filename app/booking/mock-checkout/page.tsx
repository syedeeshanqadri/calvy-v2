"use client";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";

// Dev-only stand-in for the Cashfree page, used when no Cashfree keys are set. The API refuses
// it in production and whenever a real gateway is configured.
function MockCheckoutInner() {
  const orderId = useSearchParams()?.get("order_id") ?? "";
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function finish(outcome: "PAID" | "FAILED") {
    setBusy(true); setError("");
    const res = await fetch("/api/payments/mock/complete", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderId, outcome }),
    });
    if (!res.ok) { setError((await res.json().catch(() => ({}))).error ?? "Mock checkout is not available."); setBusy(false); return; }
    window.location.assign(new URL(`/booking/return?order_id=${encodeURIComponent(orderId)}`, window.location.origin).href);
  }

  return (
    <div className="min-h-screen bg-[#f8f7f4] flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl p-8 max-w-sm w-full shadow-xl border border-[#e8e6e0] space-y-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-amber-700">Test checkout (no real money)</p>
        <h1 className="font-syne font-bold text-xl">Pay for your booking</h1>
        <div className="rounded-xl border-2 border-[#0f0f1a] p-3 text-sm">
          <span className="font-semibold">UPI</span> <span className="text-xs text-green-700 ml-1">Recommended</span>
        </div>
        <div className="rounded-xl border border-[#e8e6e0] p-3 text-sm text-[#6b6b80]">Card · Netbanking</div>
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        <div className="flex gap-2">
          <button type="button" disabled={busy || !orderId} onClick={() => finish("PAID")} className="flex-1 bg-[#0f0f1a] text-white font-semibold py-3 rounded-xl text-sm disabled:opacity-50">Pay</button>
          <button type="button" disabled={busy || !orderId} onClick={() => finish("FAILED")} className="flex-1 border border-[#e8e6e0] font-semibold py-3 rounded-xl text-sm disabled:opacity-50">Fail payment</button>
        </div>
      </div>
    </div>
  );
}

export default function MockCheckoutPage() {
  return (
    <Suspense fallback={null}>
      <MockCheckoutInner />
    </Suspense>
  );
}
