"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

const field = "h-10 rounded-xl border border-[#e8e6e0] bg-white px-3 text-sm w-full";
const lab = "text-xs font-semibold text-[#4b4b5e] space-y-1 block";

/** Make a Calvy coupon. Amounts are typed in rupees and sent as paise. */
export function CouponForm() {
  const router = useRouter();
  const [f, setF] = useState({ code: "", name: "", target: "FEE", kind: "PERCENT", value: "", min: "", startsAt: "", endsAt: "", max: "", per: "1", first: false, plans: "", businesses: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (k: keyof typeof f, v: string | boolean) => setF((p) => ({ ...p, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError("");
    const rupees = (s: string) => Math.round(Number(s || 0) * 100);
    const list = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);
    const body = {
      code: f.code, name: f.name, target: f.target, kind: f.kind,
      value: f.kind === "PERCENT" ? Number(f.value) : rupees(f.value),
      minAmountMinor: rupees(f.min),
      startsAt: f.startsAt ? new Date(f.startsAt).toISOString() : null, endsAt: f.endsAt ? new Date(f.endsAt).toISOString() : null,
      maxRedemptions: f.max ? Number(f.max) : null, perCustomerLimit: Number(f.per || 1), firstBookingOnly: f.first,
      planIds: f.target === "SUBSCRIPTION" ? list(f.plans) : [], businessIds: list(f.businesses),
    };
    try {
      const res = await fetch("/api/admin/coupons", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) setError(d.error ?? "Could not make the coupon.");
      else { setF({ ...f, code: "", name: "", value: "" }); router.refresh(); }
    } catch { setError("Network error."); } finally { setBusy(false); }
  }

  return (
    <form onSubmit={submit} className="bg-white rounded-2xl border border-[#e8e6e0] p-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <label className={lab}>Code<input required className={field} value={f.code} onChange={(e) => set("code", e.target.value)} maxLength={24} placeholder="WELCOME10" /></label>
      <label className={lab}>Name (internal)<input required className={field} value={f.name} onChange={(e) => set("name", e.target.value)} maxLength={80} /></label>
      <label className={lab}>What it discounts
        <select className={field} value={f.target} onChange={(e) => set("target", e.target.value)}>
          <option value="FEE">The Rs 10 confirmation fee</option>
          <option value="SUBSCRIPTION">A plan&apos;s first payment</option>
        </select>
      </label>
      <label className={lab}>Type
        <select className={field} value={f.kind} onChange={(e) => set("kind", e.target.value)}>
          <option value="PERCENT">Percent off</option>
          <option value="FLAT">Flat amount off (Rs)</option>
        </select>
      </label>
      <label className={lab}>{f.kind === "PERCENT" ? "Percent (1 to 100)" : "Amount (Rs)"}<input required type="number" min={1} step="any" className={field} value={f.value} onChange={(e) => set("value", e.target.value)} /></label>
      <label className={lab}>Minimum amount (Rs, optional)<input type="number" min={0} step="any" className={field} value={f.min} onChange={(e) => set("min", e.target.value)} /></label>
      <label className={lab}>Starts<input type="datetime-local" className={field} value={f.startsAt} onChange={(e) => set("startsAt", e.target.value)} /></label>
      <label className={lab}>Ends<input type="datetime-local" className={field} value={f.endsAt} onChange={(e) => set("endsAt", e.target.value)} /></label>
      <label className={lab}>Total uses (blank = no limit)<input type="number" min={1} className={field} value={f.max} onChange={(e) => set("max", e.target.value)} /></label>
      <label className={lab}>Uses per customer<input type="number" min={1} className={field} value={f.per} onChange={(e) => set("per", e.target.value)} /></label>
      {f.target === "SUBSCRIPTION" && <label className={lab}>Plans (professional, business; blank = all)<input className={field} value={f.plans} onChange={(e) => set("plans", e.target.value)} /></label>}
      <label className={lab}>Only these businesses (ids, comma separated; blank = all)<input className={field} value={f.businesses} onChange={(e) => set("businesses", e.target.value)} /></label>
      <label className="flex items-center gap-2 text-sm self-end h-10"><input type="checkbox" checked={f.first} onChange={(e) => set("first", e.target.checked)} /> First booking only</label>
      <div className="sm:col-span-2 lg:col-span-3 flex items-center gap-3">
        <button type="submit" disabled={busy} className="h-10 px-5 rounded-xl bg-[#0f0f14] text-white text-sm font-semibold disabled:opacity-60">{busy ? "Saving…" : "Make coupon"}</button>
        {error && <span role="alert" className="text-sm text-red-600">{error}</span>}
      </div>
    </form>
  );
}
