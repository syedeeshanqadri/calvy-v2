"use client";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { formatCurrencyAmount } from "@/lib/currency";
import { payExample } from "@/lib/paymentSettings";
import type { FeePayer, OnlinePayMode } from "@/lib/fees";

export interface PaymentsSettingsProps {
  mode: OnlinePayMode;
  payer: FeePayer;
  /** Calvy's fee per public online booking on this plan, in minor units (India). 0 on paid plans. */
  feeMinorIN: number;
  currency: string;
  isIndia: boolean;
  /** Is online payment switched on for the whole product (FEATURE_ONLINE_PAYMENTS)? */
  live: boolean;
  fullOnlineAvailable: boolean;
}

/** Settings → Online payments. Owner only. */
export function PaymentsSettings(p: PaymentsSettingsProps) {
  const [mode, setMode] = useState<OnlinePayMode>(p.mode);
  const [payer, setPayer] = useState<FeePayer>(p.payer);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const money = (minor: number) => formatCurrencyAmount(minor / 100, p.currency);
  const sample = 50_000; // an example booking priced 500
  const feeLabel = p.feeMinorIN > 0 ? money(p.feeMinorIN) : "no fee";
  const ex = (m: OnlinePayMode, who: FeePayer) => payExample({ mode: m, payer: who, feeMinorIN: p.feeMinorIN, priceMinor: sample });

  async function save() {
    setBusy(true); setMsg(""); setError("");
    try {
      const res = await fetch("/api/settings/payments", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ onlinePayMode: mode, feePayer: payer }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error ?? "Could not save."); return; }
      setMsg("Saved.");
    } catch {
      setError("We could not reach the server. Please try again.");
    } finally { setBusy(false); }
  }

  const radio = (selected: boolean, disabled = false) =>
    `w-full text-left rounded-xl border-2 p-4 transition-colors ${selected ? "border-accent bg-accent/5" : "border-[#e8e6e0]"} ${disabled ? "opacity-60 cursor-not-allowed" : "hover:border-accent/50"}`;

  return (
    <div className="space-y-6">
      <div role="status" className={`text-sm rounded-xl px-4 py-3 ${p.live ? "bg-green-50 text-green-800" : "bg-amber-50 text-amber-900"}`}>
        {p.live
          ? "Online payments are live. Customers who book on your public page pay online where it applies."
          : "Online payments aren't switched on yet. These settings apply as soon as they are."}
      </div>

      <Card>
        <CardHeader><CardTitle>What customers pay online</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div role="radiogroup" aria-label="Online payment mode" className="space-y-3">
            <button type="button" role="radio" aria-checked={mode === "BOOKING_FEE_ONLY"} onClick={() => setMode("BOOKING_FEE_ONLY")} className={radio(mode === "BOOKING_FEE_ONLY")}>
              <b className="block text-sm">Booking fee only</b>
              <span className="block text-xs text-[#6b6b80] mt-0.5">
                {p.isIndia
                  ? p.feeMinorIN > 0
                    ? `Each public online booking pays a ${feeLabel} booking fee to Calvy; the service itself is paid at your place. Dashboard bookings and walk-ins are free.`
                    : "Your plan has no booking fee, so customers book without paying online and pay at your place."
                  : "Outside India customers book without paying online and pay at your place."}
              </span>
            </button>
            <button type="button" role="radio" aria-checked={mode === "FULL_ONLINE"} aria-disabled={!p.fullOnlineAvailable} disabled={!p.fullOnlineAvailable} onClick={() => setMode("FULL_ONLINE")} className={radio(mode === "FULL_ONLINE", !p.fullOnlineAvailable)}>
              <b className="block text-sm">Full online payment{!p.fullOnlineAvailable && <span className="ml-2 text-[10px] font-bold bg-[#f0ede8] text-[#6b6b80] px-2 py-0.5 rounded-full">Coming soon</span>}</b>
              <span className="block text-xs text-[#6b6b80] mt-0.5">The whole service price is paid online and paid out to you. Available once payout accounts are set up.</span>
            </button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Who pays Calvy&apos;s fee (full online)</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div role="radiogroup" aria-label="Who pays the fee" className="grid sm:grid-cols-2 gap-3">
            {(["CUSTOMER", "BUSINESS"] as const).map((who) => {
              const e = ex("FULL_ONLINE", who);
              return (
                <button key={who} type="button" role="radio" aria-checked={payer === who} onClick={() => setPayer(who)} className={radio(payer === who)}>
                  <b className="block text-sm">{who === "CUSTOMER" ? "Customer pays the fee" : "I absorb the fee"}</b>
                  <span className="block text-xs text-[#6b6b80] mt-0.5">A {money(sample)} booking: the customer pays {money(e.customerPaysMinor)}, you get {money(e.businessGetsMinor)}.</span>
                </button>
              );
            })}
          </div>
          <p className="text-xs text-[#6b6b80]">Only used with full online payment. Paid India plans have no Calvy fee ({feeLabel} on your plan).</p>
        </CardContent>
      </Card>

      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      {msg && <p role="status" className="text-sm text-green-700">{msg}</p>}
      <Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Save payment settings"}</Button>
    </div>
  );
}
