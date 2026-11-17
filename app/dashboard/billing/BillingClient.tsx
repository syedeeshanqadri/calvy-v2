"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { formatCurrencyAmount } from "@/lib/currency";

type Interval = "MONTHLY" | "YEARLY";
export interface BillingData {
  isIndia: boolean;
  paymentsOn: boolean;
  planId: string;
  planLabel: string;
  override: { planLabel: string; until: string | null } | null;
  returnState: string | null;
  subscription: { state: string; planId: string; planLabel: string; interval: string; amountMinor: number; periodEnd: string | null; method: string | null; pendingPlanId: string | null; pendingPlanLabel: string | null; pendingInterval: string | null; graceUntil: string | null; endedReason: string | null } | null;
  plans: { id: "professional" | "business"; name: string; blurb: string; features: string[]; prices: Record<Interval, number> }[];
  invoices: { id: string; number: string; kind: string; issuedAt: string; amountMinor: number; planLabel: string; interval: string }[];
  extraAuthPlans: string[];
}
interface Quote { kind: string; grossMinor: number; creditMinor: number; dueMinor: number; mandate: { needsExtraAuth: boolean; note: string | null } }

const rs = (minor: number) => formatCurrencyAmount(minor / 100, "INR");
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }) : "");
const card = "bg-white rounded-2xl border border-[#e8e6e0] p-5";
const btn = "h-10 px-4 rounded-xl text-sm font-semibold disabled:opacity-50";
const CASHFREE_SDK = "https://sdk.cashfree.com/js/v3/cashfree.js";

type CashfreeFactory = (o: { mode: "sandbox" | "production" }) => { subscriptionsCheckout(o: { subsSessionId: string; redirectTarget: "_self" }): Promise<unknown> };
function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const el = document.createElement("script");
    el.src = src; el.async = true; el.onload = () => resolve(); el.onerror = () => reject(new Error("Could not load the payment page."));
    document.head.appendChild(el);
  });
}

export default function BillingClient({ data }: { data: BillingData }) {
  const router = useRouter();
  const [interval, setIntervalChoice] = useState<Interval>(data.subscription?.interval === "YEARLY" ? "YEARLY" : "MONTHLY");
  const [pick, setPick] = useState<{ planId: "professional" | "business"; interval: Interval } | null>(null);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [method, setMethod] = useState<"upi_card" | "enach">("upi_card");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState(data.returnState === "activated" ? "Your plan is active. Thank you!" : data.returnState === "authorised" ? "Payment method set up. Your first payment is being collected." : data.returnState === "pending" ? "We are waiting for your bank to confirm. This page updates when it does." : data.returnState === "failed" ? "The payment was not completed. You have not been charged." : "");
  const sub = data.subscription && data.subscription.state !== "ENDED" ? data.subscription : null;

  async function openQuote(planId: "professional" | "business") {
    setError(""); setBusy(true);
    try {
      const res = await fetch(`/api/subscriptions/quote?planId=${planId}&interval=${interval}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setError(json.error ?? "Could not load the price."); return; }
      setPick({ planId, interval }); setQuote(json);
    } finally { setBusy(false); }
  }

  async function post(path: string, body: object) {
    const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return { ok: res.ok, json: await res.json().catch(() => ({})) as Record<string, any> };
  }

  async function pay() {
    if (!pick) return;
    setBusy(true); setError("");
    try {
      const r = await post("/api/subscriptions/checkout", { ...pick, method });
      if (!r.ok) { setError(r.json.error ?? "Could not start the payment."); return; }
      await loadScript(CASHFREE_SDK);
      const factory = (window as unknown as { Cashfree?: CashfreeFactory }).Cashfree;
      if (!factory) throw new Error("Could not load the payment page.");
      await factory({ mode: r.json.env }).subscriptionsCheckout({ subsSessionId: r.json.sessionId, redirectTarget: "_self" });
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  async function change(action: "cancel" | "downgrade" | "undo", planId?: string, iv?: Interval) {
    setBusy(true); setError("");
    try {
      const r = await post("/api/subscriptions/change", { action, ...(planId ? { planId } : {}), ...(iv ? { interval: iv } : {}) });
      if (!r.ok) { setError(r.json.error ?? "Could not save the change."); return; }
      setPick(null); setQuote(null);
      setNotice(action === "undo" ? "The scheduled change was removed." : "Done. It takes effect at the end of your billing period.");
      router.refresh();
    } finally { setBusy(false); }
  }

  if (!data.isIndia) {
    return (
      <DashboardLayout title="Your plan" subtitle="Plan and billing">
        <div className={`${card} max-w-xl space-y-2`}>
          <p className="font-syne font-bold text-xl">{data.planLabel}</p>
          <p className="text-sm text-[#6b6b80]">Paid plans for businesses outside India are coming soon. You can keep using Calvy on your current plan, and we will tell you when upgrades open.</p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title="Your plan" subtitle="Plan, next bill and invoices">
      <div className="max-w-3xl space-y-5">
        {notice && <p role="status" className="text-sm rounded-xl bg-emerald-50 text-emerald-800 px-3 py-2">{notice}</p>}
        {error && <p role="alert" className="text-sm rounded-xl bg-red-50 text-red-700 px-3 py-2">{error}</p>}
        {data.override && <p className="text-sm rounded-xl bg-amber-50 text-amber-900 px-3 py-2">Your plan is set to {data.override.planLabel} by Calvy support{data.override.until ? ` until ${day(data.override.until)}` : ""}. Subscription changes apply after that.</p>}

        <section className={`${card} space-y-2`} aria-label="Current plan">
          <p className="text-sm text-[#6b6b80]">Current plan</p>
          <p className="font-syne font-bold text-2xl">{data.planLabel}</p>
          {sub && (
            <div className="text-sm text-[#3d3d4d] space-y-1">
              <p>{sub.planLabel} · {sub.interval === "YEARLY" ? "yearly" : "monthly"} · {rs(sub.amountMinor)} per {sub.interval === "YEARLY" ? "year" : "month"} (GST included)</p>
              {sub.state === "PAST_DUE"
                ? <p className="text-red-700 font-semibold">Your last payment failed. We will retry; please check your payment method. Paid features stay on until {day(sub.graceUntil)}.</p>
                : sub.pendingPlanId === "free"
                  ? <p>Cancelled. You keep your plan until {day(sub.periodEnd)}, then move to Basic. You will not be charged again.</p>
                  : <p>Next bill: <strong>{day(sub.periodEnd)}</strong>{sub.pendingPlanLabel ? ` · changes to ${sub.pendingPlanLabel} ${sub.pendingInterval === "YEARLY" ? "yearly" : "monthly"} then` : ""}</p>}
              {sub.method && <p>Payment method: {sub.method}</p>}
            </div>
          )}
          {!sub && data.planId === "free" && <p className="text-sm text-[#6b6b80]">Basic is free. You pay Calvy a Rs 10 confirmation fee on online bookings. Paid plans remove that fee and let you take payments straight into your own account.</p>}
          {sub && (
            <div className="flex flex-wrap gap-2 pt-2">
              {(sub.pendingPlanId) && <button type="button" disabled={busy} onClick={() => change("undo")} className={`${btn} border border-[#e8e6e0]`}>Undo scheduled change</button>}
              {!sub.pendingPlanId && <button type="button" disabled={busy} onClick={() => { if (confirm("Cancel your subscription? You keep your plan until the end of the period you paid for.")) change("cancel"); }} className={`${btn} border border-red-200 text-red-700`}>Cancel subscription</button>}
            </div>
          )}
        </section>

        {data.paymentsOn ? (
          <section aria-label="Plans" className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-syne font-bold text-lg">{sub ? "Change plan" : "Choose a plan"}</h2>
              <div role="group" aria-label="Billing period" className="flex gap-1 bg-[#f6f5f1] rounded-xl p-1">
                {(["MONTHLY", "YEARLY"] as const).map((i) => <button key={i} type="button" onClick={() => setIntervalChoice(i)} aria-pressed={interval === i} className={`h-9 px-3 rounded-lg text-sm font-semibold ${interval === i ? "bg-white shadow-sm" : "text-[#6b6b80]"}`}>{i === "MONTHLY" ? "Monthly" : "Yearly"}</button>)}
              </div>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              {data.plans.map((p) => {
                const current = sub && sub.planId === p.id && sub.interval === interval;
                return (
                  <div key={p.id} className={`${card} space-y-3 ${current ? "ring-2 ring-[#0f0f1a]" : ""}`}>
                    <p className="font-syne font-bold text-lg">{p.name}</p>
                    <p><span className="text-2xl font-bold">{rs(p.prices[interval])}</span> <span className="text-sm text-[#6b6b80]">per {interval === "YEARLY" ? "year" : "month"}, GST included</span></p>
                    <p className="text-sm text-[#6b6b80]">{p.blurb}</p>
                    <ul className="text-sm text-[#3d3d4d] list-disc pl-5 space-y-0.5">{p.features.map((f) => <li key={f}>{f}</li>)}</ul>
                    <button type="button" disabled={busy || !!current} onClick={() => openQuote(p.id)} className={`${btn} bg-[#0f0f1a] text-white w-full`}>{current ? "Your current plan" : sub ? "Switch to this plan" : "Choose this plan"}</button>
                  </div>
                );
              })}
            </div>
            {data.extraAuthPlans.length > 0 && <p className="text-xs text-[#6b6b80]">Above Rs 15,000 per payment ({data.extraAuthPlans.join(", ")}) your bank asks for an extra authentication on each payment.</p>}
          </section>
        ) : <p className="text-sm rounded-xl bg-amber-50 text-amber-900 px-3 py-2">Plan payments are not switched on yet. Email support to change your plan.</p>}

        {pick && quote && (
          <section className={`${card} space-y-3`} aria-label="Checkout">
            <h2 className="font-syne font-bold text-lg">{quote.kind === "downgrade" ? "Change at the end of your period" : "Checkout"}</h2>
            <p className="text-sm">{data.plans.find((p) => p.id === pick.planId)?.name} · {pick.interval === "YEARLY" ? "yearly" : "monthly"}</p>
            {quote.kind === "downgrade" ? (
              <>
                <p className="text-sm text-[#3d3d4d]">Your plan changes at the end of the period you already paid for. Until then you keep everything. Nothing is charged now.</p>
                <button type="button" disabled={busy} onClick={() => change("downgrade", pick.planId, pick.interval)} className={`${btn} bg-[#0f0f1a] text-white`}>Schedule the change</button>
              </>
            ) : (
              <>
                <dl className="text-sm space-y-1">
                  <div className="flex justify-between"><dt>Plan price (GST included)</dt><dd>{rs(quote.grossMinor)}</dd></div>
                  {quote.creditMinor > 0 && <div className="flex justify-between text-emerald-700"><dt>Credit for the unused part of your current plan</dt><dd>- {rs(quote.creditMinor)}</dd></div>}
                  <div className="flex justify-between font-bold border-t border-[#e8e6e0] pt-1"><dt>Due now</dt><dd>{rs(quote.dueMinor)}</dd></div>
                </dl>
                <p className="text-xs text-[#6b6b80]">Your plan starts now. After this, {rs(quote.grossMinor)} is charged every {pick.interval === "YEARLY" ? "year" : "month"} automatically. Cancel any time; you keep access to the end of the period.</p>
                <fieldset className="flex flex-wrap gap-2" aria-label="Payment method">
                  <button type="button" onClick={() => setMethod("upi_card")} aria-pressed={method === "upi_card"} className={`${btn} border ${method === "upi_card" ? "border-[#0f0f1a] bg-[#f6f5f1]" : "border-[#e8e6e0]"}`}>UPI Autopay or card</button>
                  <button type="button" onClick={() => setMethod("enach")} aria-pressed={method === "enach"} className={`${btn} border ${method === "enach" ? "border-[#0f0f1a] bg-[#f6f5f1]" : "border-[#e8e6e0]"}`}>Bank e-mandate</button>
                </fieldset>
                {method === "enach" && <p className="text-xs text-[#6b6b80]">With a bank e-mandate nothing is taken while you set it up; the first payment is collected a day later.</p>}
                {quote.mandate.note && <p className="text-xs rounded-lg bg-amber-50 text-amber-900 px-3 py-2">{quote.mandate.note}</p>}
                <button type="button" disabled={busy} onClick={pay} className={`${btn} bg-[#0f0f1a] text-white`}>{busy ? "Opening…" : `Pay ${method === "enach" ? "later" : rs(quote.dueMinor)} and start`}</button>
              </>
            )}
            <button type="button" onClick={() => { setPick(null); setQuote(null); }} className="text-sm underline text-[#6b6b80] ml-3">Cancel</button>
          </section>
        )}

        <section className={card} aria-label="Invoices">
          <h2 className="font-syne font-bold text-lg mb-3">Invoices</h2>
          {data.invoices.length === 0 ? <p className="text-sm text-[#6b6b80]">No invoices yet.</p> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-left text-xs text-[#6b6b80]"><th className="py-1 pr-3">Number</th><th className="pr-3">Date</th><th className="pr-3">Plan</th><th className="pr-3 text-right">Amount</th><th /></tr></thead>
                <tbody>{data.invoices.map((i) => (
                  <tr key={i.id} className="border-t border-[#f0ede8]">
                    <td className="py-2 pr-3 font-mono text-xs">{i.number}</td><td className="pr-3">{day(i.issuedAt)}</td><td className="pr-3">{i.planLabel} · {i.interval === "YEARLY" ? "yearly" : "monthly"}</td><td className="pr-3 text-right">{rs(i.amountMinor)}</td>
                    <td className="text-right"><a className="underline" href={`/api/subscriptions/invoices/${i.id}/pdf`}>{i.kind === "TAX_INVOICE" ? "Invoice PDF" : "Receipt PDF"}</a></td>
                  </tr>))}</tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </DashboardLayout>
  );
}
