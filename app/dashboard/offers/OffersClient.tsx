"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Card } from "@/components/ui/Card";
import { useCurrency } from "@/components/providers/CurrencyProvider";
import { toMinorUnits, fromMinorUnits, formatCurrencyAmount } from "@/lib/currency";
import { offerSummary } from "@/lib/offers/rules";

interface Svc { id: string; name: string }
interface OfferRow { id: string; kind: string; name: string; percent: number; nth: number | null; days: number[]; startMinute: number | null; endMinute: number | null; serviceIds: string[]; active: boolean; showOnSite: boolean }
interface CouponRow { id: string; code: string; name: string; kind: string; value: number; minAmountMinor: number; endsAt: string | null; maxRedemptions: number | null; perCustomerLimit: number; firstBookingOnly: boolean; active: boolean; used: number }

const field = "h-10 rounded-xl border border-[#e8e6e0] bg-white px-3 text-sm w-full";
const lab = "text-xs font-semibold text-[#4b4b5e] space-y-1 block";
const btn = "h-10 px-5 rounded-xl bg-[#0f0f14] text-white text-sm font-semibold disabled:opacity-60";
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const minutes = (hhmm: string) => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + m; };

async function send(url: string, method: string, body?: unknown): Promise<string | null> {
  try {
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
    if (res.ok) return null;
    return ((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Something went wrong.";
  } catch { return "Network error."; }
}

function ServicePicker({ services, value, onChange, hint }: { services: Svc[]; value: string[]; onChange: (v: string[]) => void; hint: string }) {
  return (
    <fieldset className="sm:col-span-2 lg:col-span-3">
      <legend className="text-xs font-semibold text-[#4b4b5e]">{hint}</legend>
      <div className="flex flex-wrap gap-2 mt-1">
        {services.map((s) => (
          <label key={s.id} className="flex items-center gap-1.5 text-sm rounded-xl border border-[#e8e6e0] px-3 min-h-9 bg-white">
            <input type="checkbox" checked={value.includes(s.id)} onChange={(e) => onChange(e.target.checked ? [...value, s.id] : value.filter((x) => x !== s.id))} />
            {s.name}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function OffersClient({ services, offers, coupons }: { services: Svc[]; offers: OfferRow[]; coupons: CouponRow[] }) {
  const router = useRouter();
  const { currency } = useCurrency();
  const money = (minor: number) => formatCurrencyAmount(fromMinorUnits(minor, currency), currency);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // New offer
  const [o, setO] = useState({ kind: "NTH_VISIT", name: "", percent: "10", nth: "5", days: [] as number[], start: "14:00", end: "16:00", serviceIds: [] as string[], site: true });
  // New coupon
  const [c, setC] = useState({ code: "", name: "", kind: "PERCENT", value: "10", min: "", ends: "", max: "", per: "1", first: false, serviceIds: [] as string[] });

  async function run(p: Promise<string | null>) {
    setBusy(true); setError("");
    const e = await p;
    setBusy(false);
    if (e) setError(e); else router.refresh();
  }

  const addOffer = (e: React.FormEvent) => {
    e.preventDefault();
    return run(send("/api/offers", "POST", {
      kind: o.kind, name: o.name, percent: Number(o.percent), showOnSite: o.site, serviceIds: o.serviceIds,
      ...(o.kind === "NTH_VISIT" ? { nth: Number(o.nth) } : {}),
      ...(o.kind === "HAPPY_HOUR" ? { days: o.days, startMinute: minutes(o.start), endMinute: minutes(o.end) } : {}),
    }));
  };
  const addCoupon = (e: React.FormEvent) => {
    e.preventDefault();
    return run(send("/api/offers/coupons", "POST", {
      code: c.code, name: c.name, kind: c.kind, value: c.kind === "PERCENT" ? Number(c.value) : toMinorUnits(Number(c.value), currency),
      minAmountMinor: c.min ? toMinorUnits(Number(c.min), currency) : 0, endsAt: c.ends ? new Date(c.ends).toISOString() : null,
      maxRedemptions: c.max ? Number(c.max) : null, perCustomerLimit: Number(c.per || 1), firstBookingOnly: c.first, serviceIds: c.serviceIds,
    }));
  };

  return (
    <DashboardLayout title="Offers & discounts" subtitle="You pay for these discounts: they come out of your own prices">
      <div className="space-y-8 max-w-5xl">
        <p className="text-sm text-[#6b6b80]">Customers get one discount per booking: the better of one coupon code and one offer, never both. Offers apply automatically and show on your website and booking page.</p>
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}

        <section aria-label="Offers" className="space-y-3">
          <h2 className="font-syne text-lg font-bold">Offers</h2>
          {offers.length === 0 && <p className="text-sm text-[#6b6b80]">No offers yet.</p>}
          {offers.map((x) => (
            <Card key={x.id}><div className="p-4 flex flex-wrap items-center justify-between gap-3">
              <div className="text-sm"><p className="font-semibold">{x.name}</p><p className="text-[#6b6b80]">{offerSummary(x)}{x.serviceIds.length ? ` · ${x.serviceIds.length} service(s)` : " · all services"}</p></div>
              <div className="flex gap-2 flex-wrap">
                <button type="button" disabled={busy} onClick={() => run(send(`/api/offers/${x.id}`, "PATCH", { active: !x.active }))} aria-pressed={x.active} className={`h-9 px-4 rounded-xl text-sm font-semibold ${x.active ? "bg-[#e7f7ec] text-[#166534]" : "bg-[#f1f0ec] text-[#4b4b5e]"}`}>{x.active ? "On" : "Off"}</button>
                <button type="button" disabled={busy} onClick={() => run(send(`/api/offers/${x.id}`, "PATCH", { showOnSite: !x.showOnSite }))} aria-pressed={x.showOnSite} className="h-9 px-4 rounded-xl text-sm border border-[#e8e6e0]">{x.showOnSite ? "Shown on site" : "Hidden on site"}</button>
                <button type="button" disabled={busy} onClick={() => confirm("Delete this offer?") && run(send(`/api/offers/${x.id}`, "DELETE"))} className="h-9 px-4 rounded-xl text-sm text-red-600 border border-[#e8e6e0]">Delete</button>
              </div>
            </div></Card>
          ))}
          <form onSubmit={addOffer} className="bg-white rounded-2xl border border-[#e8e6e0] p-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <label className={lab}>Type
              <select className={field} value={o.kind} onChange={(e) => setO({ ...o, kind: e.target.value })}>
                <option value="NTH_VISIT">Every Nth visit</option><option value="HAPPY_HOUR">Happy hour</option><option value="BUNDLE">Package (services together)</option>
              </select>
            </label>
            <label className={lab}>Name<input required className={field} value={o.name} onChange={(e) => setO({ ...o, name: e.target.value })} maxLength={80} /></label>
            <label className={lab}>Percent off (1 to 90)<input required type="number" min={1} max={90} className={field} value={o.percent} onChange={(e) => setO({ ...o, percent: e.target.value })} /></label>
            {o.kind === "NTH_VISIT" && <label className={lab}>Every how many visits (2 or more)<input required type="number" min={2} className={field} value={o.nth} onChange={(e) => setO({ ...o, nth: e.target.value })} /></label>}
            {o.kind === "HAPPY_HOUR" && (
              <>
                <label className={lab}>From<input type="time" className={field} value={o.start} onChange={(e) => setO({ ...o, start: e.target.value })} /></label>
                <label className={lab}>To<input type="time" className={field} value={o.end} onChange={(e) => setO({ ...o, end: e.target.value })} /></label>
                <fieldset className="sm:col-span-2 lg:col-span-3"><legend className="text-xs font-semibold text-[#4b4b5e]">Days (none ticked = every day)</legend>
                  <div className="flex flex-wrap gap-2 mt-1">{DAYS.map((d, i) => <label key={d} className="flex items-center gap-1.5 text-sm rounded-xl border border-[#e8e6e0] px-3 min-h-9 bg-white"><input type="checkbox" checked={o.days.includes(i)} onChange={(e) => setO({ ...o, days: e.target.checked ? [...o.days, i] : o.days.filter((x) => x !== i) })} />{d}</label>)}</div>
                </fieldset>
              </>
            )}
            <ServicePicker services={services} value={o.serviceIds} onChange={(v) => setO({ ...o, serviceIds: v })} hint={o.kind === "BUNDLE" ? "Services that must all be booked together (pick at least two)" : "Services it covers (none ticked = all)"} />
            <label className="flex items-center gap-2 text-sm self-end h-10"><input type="checkbox" checked={o.site} onChange={(e) => setO({ ...o, site: e.target.checked })} /> Show on my website and booking page</label>
            <div className="sm:col-span-2 lg:col-span-3"><button type="submit" disabled={busy} className={btn}>{busy ? "Saving…" : "Add offer"}</button></div>
          </form>
        </section>

        <section aria-label="Coupons" className="space-y-3">
          <h2 className="font-syne text-lg font-bold">Coupon codes</h2>
          {coupons.length === 0 && <p className="text-sm text-[#6b6b80]">No coupons yet.</p>}
          {coupons.map((x) => (
            <Card key={x.id}><div className="p-4 flex flex-wrap items-center justify-between gap-3">
              <div className="text-sm"><p className="font-semibold">{x.code} <span className="font-normal text-[#6b6b80]">· {x.name}</span></p>
                <p className="text-[#6b6b80]">{x.kind === "PERCENT" ? `${x.value}% off` : `${money(x.value)} off`}{x.minAmountMinor ? ` · min ${money(x.minAmountMinor)}` : ""}{x.firstBookingOnly ? " · first booking only" : ""} · used {x.used}{x.maxRedemptions ? ` of ${x.maxRedemptions}` : ""} · {x.perCustomerLimit} per customer{x.endsAt ? ` · ends ${x.endsAt.slice(0, 10)}` : ""}</p></div>
              <button type="button" disabled={busy} onClick={() => run(send(`/api/offers/coupons/${x.id}`, "PATCH", { active: !x.active }))} aria-pressed={x.active} className={`h-9 px-4 rounded-xl text-sm font-semibold ${x.active ? "bg-[#e7f7ec] text-[#166534]" : "bg-[#f1f0ec] text-[#4b4b5e]"}`}>{x.active ? "Active (switch off)" : "Off (switch on)"}</button>
            </div></Card>
          ))}
          <form onSubmit={addCoupon} className="bg-white rounded-2xl border border-[#e8e6e0] p-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <label className={lab}>Code<input required className={field} value={c.code} onChange={(e) => setC({ ...c, code: e.target.value })} maxLength={24} placeholder="FIRST10" /></label>
            <label className={lab}>Name (for you)<input required className={field} value={c.name} onChange={(e) => setC({ ...c, name: e.target.value })} maxLength={80} /></label>
            <label className={lab}>Type<select className={field} value={c.kind} onChange={(e) => setC({ ...c, kind: e.target.value })}><option value="PERCENT">Percent off</option><option value="FLAT">Flat amount off</option></select></label>
            <label className={lab}>{c.kind === "PERCENT" ? "Percent (1 to 100)" : "Amount off"}<input required type="number" min={1} step="any" className={field} value={c.value} onChange={(e) => setC({ ...c, value: e.target.value })} /></label>
            <label className={lab}>Minimum order (optional)<input type="number" min={0} step="any" className={field} value={c.min} onChange={(e) => setC({ ...c, min: e.target.value })} /></label>
            <label className={lab}>Ends (optional)<input type="datetime-local" className={field} value={c.ends} onChange={(e) => setC({ ...c, ends: e.target.value })} /></label>
            <label className={lab}>Total uses (blank = no limit)<input type="number" min={1} className={field} value={c.max} onChange={(e) => setC({ ...c, max: e.target.value })} /></label>
            <label className={lab}>Uses per customer<input type="number" min={1} className={field} value={c.per} onChange={(e) => setC({ ...c, per: e.target.value })} /></label>
            <label className="flex items-center gap-2 text-sm self-end h-10"><input type="checkbox" checked={c.first} onChange={(e) => setC({ ...c, first: e.target.checked })} /> First booking only</label>
            <ServicePicker services={services} value={c.serviceIds} onChange={(v) => setC({ ...c, serviceIds: v })} hint="Services it works on (none ticked = all)" />
            <div className="sm:col-span-2 lg:col-span-3"><button type="submit" disabled={busy} className={btn}>{busy ? "Saving…" : "Add coupon"}</button></div>
          </form>
        </section>
      </div>
    </DashboardLayout>
  );
}
