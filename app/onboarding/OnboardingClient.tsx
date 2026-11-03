"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Check, ChevronLeft, Copy, ExternalLink, Plus, Share2, Trash2 } from "lucide-react";
import { Logo } from "@/components/ui/Logo";
import { PackPicker } from "@/components/packs/PackPicker";
import { getPack } from "@/lib/packs";
import type { PackId } from "@/lib/packs/types";
import { REGIONS, currencyForRegion } from "@/lib/regions";
import { getRegionPricing, formatMoney, isFeatureHeading, PRICING_NOTE } from "@/lib/pricing";
import { HOURS_PRESETS, SKIPPABLE, STEPS, detectRegion, type Hours } from "@/lib/onboarding";
import { businessHoursFromJson } from "@/lib/schedule";
import { inputClass, primaryBtn, secondaryBtn } from "@/components/auth/AuthShell";

type WizardState = {
  step: number; completed: boolean; region: "IN" | "INTL"; currency: string; packId: PackId;
  name: string; slug: string; timezone: string; phone: string; address: string;
  bookingMode: "SLOT" | "TOKEN"; intendedPlan: "free" | "professional" | "business"; availabilityJson: string;
  services: { id: string; name: string; duration: number; price: number }[]; rootDomain: string | null;
};
type Svc = { id?: string; name: string; duration: number; price: number };

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const TITLES = ["Where are you based?", "What kind of business is it?", "The basics", "How do customers book?", "Your services", "Working hours", "Choose a plan", "You're live"];

function hoursFromState(json: string): Hours {
  if (!json || json === "{}") return HOURS_PRESETS[0].hours;
  const rows = businessHoursFromJson(json);
  const out: Record<string, { enabled: boolean; start: string; end: string }> = {};
  const hm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  for (let d = 0; d < 7; d++) {
    const r = rows.find((x) => x.weekday === d);
    out[String(d)] = r ? { enabled: true, start: hm(r.startMin), end: hm(Math.min(r.endMin, 1439)) } : { enabled: false, start: "09:00", end: "18:00" };
  }
  return out as Hours;
}

export default function OnboardingClient({ initial, ownerName }: { initial: WizardState; ownerName: string }) {
  const router = useRouter();
  const { update } = useSession();
  const [st, setSt] = useState<WizardState>(initial);
  const [view, setView] = useState(Math.min(Math.max(initial.step, 1), STEPS.length));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Step 1: region, auto-detected until the owner changes it (only when nothing was saved yet).
  const [region, setRegion] = useState<"IN" | "INTL">(initial.step <= 1 ? "INTL" : initial.region);
  const [country, setCountry] = useState(() => REGIONS.find((r) => r.currency === initial.currency && r.code !== "IN")?.code ?? "US");
  useEffect(() => {
    if (initial.step <= 1) setRegion(detectRegion(Intl.DateTimeFormat().resolvedOptions().timeZone, navigator.language));
  }, [initial.step]);

  const [packId, setPackId] = useState<PackId>(initial.packId);
  const [basics, setBasics] = useState({ name: initial.name, slug: initial.slug, phone: initial.phone, address: initial.address, timezone: initial.timezone });
  const [mode, setMode] = useState(initial.bookingMode);
  const [services, setServices] = useState<Svc[]>(initial.services);
  const [hours, setHours] = useState<Hours>(() => hoursFromState(initial.availabilityJson));
  const [plan, setPlan] = useState(initial.intendedPlan);
  const [copied, setCopied] = useState(false);

  const pack = getPack(packId);
  const svcN = pack.terms.service.plural.toLowerCase();

  // Step 3: live slug check (debounced).
  const [slugState, setSlugState] = useState<{ status: "idle" | "checking" | "ok" | "bad"; msg: string }>({ status: "idle", msg: "" });
  const slugSeq = useRef(0);
  useEffect(() => {
    if (view !== 3) return;
    const seq = ++slugSeq.current;
    setSlugState({ status: "checking", msg: "Checking…" });
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/onboarding/slug?slug=${encodeURIComponent(basics.slug)}`);
        const j = await r.json();
        if (seq !== slugSeq.current) return;
        setSlugState(j.available ? { status: "ok", msg: "Available" } : { status: "bad", msg: j.error ?? "Not available" });
      } catch {
        if (seq === slugSeq.current) setSlugState({ status: "idle", msg: "" });
      }
    }, 350);
    return () => clearTimeout(t);
  }, [basics.slug, view]);

  const send = useCallback(async (step: (typeof STEPS)[number], body: { skip?: boolean; data?: unknown }) => {
    setBusy(true); setError("");
    try {
      const r = await fetch("/api/onboarding", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ step, ...body }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setError(j.error ?? "Something went wrong. Try again."); return null; }
      return j as WizardState;
    } catch {
      setError("We could not reach the server. Check your connection and try again.");
      return null;
    } finally { setBusy(false); }
  }, []);

  function applyState(next: WizardState) {
    setSt(next);
    setPackId(next.packId);
    setMode(next.bookingMode);
    setServices(next.services);
  }

  async function next(skip = false) {
    const name = STEPS[view - 1];
    let data: unknown;
    if (!skip) {
      if (name === "region") data = { region, country: region === "INTL" ? country : undefined };
      if (name === "type") data = { packId };
      if (name === "basics") data = { name: basics.name, slug: basics.slug, timezone: basics.timezone, phone: basics.phone, address: basics.address };
      if (name === "mode") data = { bookingMode: mode };
      if (name === "services") data = { services };
      if (name === "hours") data = { hours };
      if (name === "plan") data = { plan };
    }
    const res = await send(name, skip ? { skip: true } : { data });
    if (!res) return;
    applyState(res);
    // After choosing the type, the booking mode default follows the pack (clinic = tokens).
    setView(view + 1);
  }

  async function finish() {
    setBusy(true); setError("");
    const r = await fetch("/api/onboarding/complete", { method: "POST" });
    if (!r.ok) { setBusy(false); setError("Could not finish. Try again."); return; }
    await update(); // pick up the businessId in the session token
    router.push("/dashboard");
    router.refresh();
  }

  const siteUrl = typeof window === "undefined" ? "" : st.rootDomain ? `https://${st.slug}.${st.rootDomain}` : `${window.location.origin}/${st.slug}`;
  const bookingUrl = siteUrl ? `${siteUrl}/book-now` : "";
  async function copy(text: string) {
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* clipboard blocked */ }
  }
  async function share() {
    if (navigator.share) { try { await navigator.share({ title: st.name, url: bookingUrl }); return; } catch { return; } }
    copy(bookingUrl);
  }

  const pricing = getRegionPricing(st.region);
  const money = (n: number) => formatMoney(n, pricing);
  const canNext = view === 3 ? slugState.status !== "bad" && basics.name.trim().length > 0 : view === 5 ? services.length > 0 && services.every((s) => s.name.trim()) : true;
  const skippable = SKIPPABLE.has(STEPS[view - 1]);
  const total = STEPS.length;

  return (
    <div className="min-h-dvh bg-[#0f0f1a] flex items-start sm:items-center justify-center px-4 safe-pt-4 safe-pb-4 py-6">
      <div className="w-full max-w-lg">
        <div className="flex justify-center mb-6"><Logo width={110} className="brightness-0 invert" /></div>
        <div className="bg-white rounded-3xl p-5 sm:p-8 shadow-2xl">
          <div className="mb-5">
            <div className="flex items-center justify-between text-xs text-[#6b6b80] mb-2">
              <span>Step {view} of {total}</span>
              {view > 1 && view < total && (
                <button type="button" onClick={() => { setError(""); setView(view - 1); }} className="inline-flex items-center gap-1 min-h-11 px-2 -mr-2 hover:text-[#0f0f1a]">
                  <ChevronLeft size={14} aria-hidden /> Back
                </button>
              )}
            </div>
            <div role="progressbar" aria-valuemin={1} aria-valuemax={total} aria-valuenow={view} aria-label="Setup progress" className="h-1.5 rounded-full bg-[#f0ede8] overflow-hidden">
              <div className="h-full bg-[#0284c7] transition-all" style={{ width: `${(view / total) * 100}%` }} />
            </div>
          </div>

          <h1 className="font-syne font-bold text-2xl text-[#0f0f1a] mb-1">{view === 1 && ownerName ? `Welcome, ${ownerName.split(" ")[0]}! ${TITLES[0]}` : TITLES[view - 1]}</h1>

          {view === 1 && (
            <div className="mt-4 space-y-4">
              <p className="text-sm text-[#6b6b80]">We use this for your currency and prices. You can change it any time.</p>
              <div role="radiogroup" aria-label="Region" className="grid grid-cols-2 gap-2">
                {([["IN", "India", "Prices in ₹ INR"], ["INTL", "International", "Prices in your currency"]] as const).map(([v, label, sub]) => (
                  <button key={v} type="button" role="radio" aria-checked={region === v} onClick={() => setRegion(v)}
                    className={`min-h-16 text-left rounded-xl border-2 p-3 transition-colors ${region === v ? "border-[#0284c7] bg-sky-50/60" : "border-[#e8e6e0] hover:border-[#c9c6bd]"}`}>
                    <span className="block text-sm font-semibold text-[#0f0f1a]">{label}</span>
                    <span className="block text-xs text-[#6b6b80]">{sub}</span>
                  </button>
                ))}
              </div>
              {region === "INTL" && (
                <div>
                  <label htmlFor="ob-country" className="text-sm font-medium text-[#0f0f1a] block mb-1.5">Country</label>
                  <select id="ob-country" value={country} onChange={(e) => setCountry(e.target.value)} className={`${inputClass} bg-white`}>
                    {REGIONS.filter((r) => r.code !== "IN").map((r) => <option key={r.code} value={r.code}>{r.name} ({r.currency})</option>)}
                  </select>
                  <p className="text-xs text-[#6b6b80] mt-1">Currency: {currencyForRegion(country)}</p>
                </div>
              )}
            </div>
          )}

          {view === 2 && (
            <div className="mt-4">
              <PackPicker value={packId} onChange={setPackId} legend="Pick the closest match. Wording and your starter setup follow." name="ob-pack" />
              <p className="text-xs text-[#6b6b80] mt-3">Customers become &ldquo;{pack.terms.client.plural.toLowerCase()}&rdquo; and bookings become &ldquo;{pack.terms.appointment.plural.toLowerCase()}&rdquo; across your dashboard.</p>
            </div>
          )}

          {view === 3 && (
            <div className="mt-4 space-y-4">
              <div>
                <label htmlFor="ob-name" className="text-sm font-medium text-[#0f0f1a] block mb-1.5">Business name</label>
                <input id="ob-name" value={basics.name} onChange={(e) => setBasics({ ...basics, name: e.target.value })} maxLength={120} autoComplete="organization" className={inputClass} />
              </div>
              <div>
                <label htmlFor="ob-slug" className="text-sm font-medium text-[#0f0f1a] block mb-1.5">Your web address</label>
                <div className="flex items-center gap-2">
                  <input id="ob-slug" value={basics.slug} onChange={(e) => setBasics({ ...basics, slug: e.target.value.toLowerCase().replace(/\s+/g, "-") })} maxLength={40} autoCapitalize="none" spellCheck={false} aria-describedby="ob-slug-msg" className={inputClass} />
                  <span className="text-xs text-[#6b6b80] whitespace-nowrap">.{st.rootDomain ?? "calvy.io"}</span>
                </div>
                <p id="ob-slug-msg" role="status" className={`text-xs mt-1 ${slugState.status === "bad" ? "text-red-600" : slugState.status === "ok" ? "text-green-700" : "text-[#6b6b80]"}`}>{slugState.msg || "Lowercase letters, numbers and hyphens."}</p>
              </div>
              <div>
                <label htmlFor="ob-tz" className="text-sm font-medium text-[#0f0f1a] block mb-1.5">Timezone</label>
                <input id="ob-tz" value={basics.timezone} onChange={(e) => setBasics({ ...basics, timezone: e.target.value })} className={inputClass} />
                <button type="button" onClick={() => setBasics({ ...basics, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone })} className="text-xs text-[#0369a1] mt-1 min-h-8 hover:underline">Use my device timezone</button>
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="ob-phone" className="text-sm font-medium text-[#0f0f1a] block mb-1.5">Phone <span className="text-[#6b6b80] font-normal">(optional)</span></label>
                  <input id="ob-phone" type="tel" value={basics.phone} onChange={(e) => setBasics({ ...basics, phone: e.target.value })} autoComplete="tel" className={inputClass} />
                </div>
                <div>
                  <label htmlFor="ob-address" className="text-sm font-medium text-[#0f0f1a] block mb-1.5">Address <span className="text-[#6b6b80] font-normal">(optional)</span></label>
                  <input id="ob-address" value={basics.address} onChange={(e) => setBasics({ ...basics, address: e.target.value })} autoComplete="street-address" className={inputClass} />
                </div>
              </div>
            </div>
          )}

          {view === 4 && (
            <div className="mt-4 space-y-3" role="radiogroup" aria-label="Booking mode">
              {([
                ["SLOT", "Time slots", "Customers pick an exact time, like 3:30 pm. Best for salons, consultants, classes."],
                ["TOKEN", "Tokens (queue)", "Customers get a number in the queue for a session. Best for clinics with walk-in flow."],
              ] as const).map(([v, label, sub]) => (
                <button key={v} type="button" role="radio" aria-checked={mode === v} onClick={() => setMode(v)}
                  className={`w-full text-left rounded-xl border-2 p-4 transition-colors ${mode === v ? "border-[#0284c7] bg-sky-50/60" : "border-[#e8e6e0] hover:border-[#c9c6bd]"}`}>
                  <span className="block text-sm font-semibold text-[#0f0f1a]">{label}{pack.defaultBookingMode === v && <span className="ml-2 text-[10px] font-bold bg-sky-100 text-sky-700 px-2 py-0.5 rounded-full">Suggested</span>}</span>
                  <span className="block text-xs text-[#6b6b80] mt-0.5">{sub}</span>
                </button>
              ))}
            </div>
          )}

          {view === 5 && (
            <div className="mt-4 space-y-3">
              <p className="text-sm text-[#6b6b80]">Starter {svcN} for your business. Edit, remove or add. Prices are in {st.currency}.</p>
              {services.map((s, i) => (
                <div key={s.id ?? i} className="rounded-xl border border-[#e8e6e0] p-3 space-y-2">
                  <div className="flex gap-2">
                    <input aria-label="Name" value={s.name} onChange={(e) => setServices(services.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} maxLength={80} className={inputClass} placeholder={pack.placeholders.serviceName} />
                    <button type="button" aria-label={`Remove ${s.name || "service"}`} onClick={() => setServices(services.filter((_, j) => j !== i))} className="min-h-11 min-w-11 rounded-xl border border-[#e8e6e0] text-[#6b6b80] hover:text-red-600 flex items-center justify-center"><Trash2 size={16} aria-hidden /></button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="text-xs text-[#6b6b80]">Minutes
                      <input type="number" inputMode="numeric" min={5} max={480} value={s.duration} onChange={(e) => setServices(services.map((x, j) => (j === i ? { ...x, duration: Number(e.target.value) } : x)))} className={`${inputClass} mt-1`} />
                    </label>
                    <label className="text-xs text-[#6b6b80]">Price ({st.currency})
                      <input type="number" inputMode="decimal" min={0} value={s.price} onChange={(e) => setServices(services.map((x, j) => (j === i ? { ...x, price: Number(e.target.value) } : x)))} className={`${inputClass} mt-1`} />
                    </label>
                  </div>
                </div>
              ))}
              {services.length < 3 ? (
                <button type="button" onClick={() => setServices([...services, { name: "", duration: 30, price: 0 }])} className={`${secondaryBtn} gap-1.5`}><Plus size={14} aria-hidden /> Add a service</button>
              ) : (
                <p className="text-xs text-[#6b6b80]">The Free plan includes 3 services. Upgrade later for more.</p>
              )}
            </div>
          )}

          {view === 6 && (
            <div className="mt-4 space-y-3">
              <div className="flex flex-wrap gap-2" role="group" aria-label="Quick presets">
                {HOURS_PRESETS.map((p) => (
                  <button key={p.id} type="button" onClick={() => setHours(p.hours)} className="min-h-11 px-3 rounded-xl border border-[#e8e6e0] text-xs font-medium text-[#3d3d4d] hover:border-[#0284c7]">{p.label}</button>
                ))}
              </div>
              <div className="space-y-2">
                {[1, 2, 3, 4, 5, 6, 0].map((d) => {
                  const h = hours[String(d) as keyof Hours];
                  const set = (patch: Partial<typeof h>) => setHours({ ...hours, [String(d)]: { ...h, ...patch } } as Hours);
                  return (
                    <div key={d} className="flex items-center gap-2">
                      <label className="flex items-center gap-2 w-28 min-h-11 text-sm">
                        <input type="checkbox" checked={h.enabled} onChange={(e) => set({ enabled: e.target.checked })} className="size-4" />
                        {DAYS[d].slice(0, 3)}
                      </label>
                      {h.enabled ? (
                        <>
                          <input aria-label={`${DAYS[d]} opens`} type="time" value={h.start} onChange={(e) => set({ start: e.target.value })} className={inputClass} />
                          <span className="text-[#6b6b80]">–</span>
                          <input aria-label={`${DAYS[d]} closes`} type="time" value={h.end} onChange={(e) => set({ end: e.target.value })} className={inputClass} />
                        </>
                      ) : <span className="text-sm text-[#6b6b80]">Closed</span>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {view === 7 && (
            <div className="mt-4 space-y-3">
              <p className="text-sm text-[#6b6b80]">Every account starts free. {PRICING_NOTE}</p>
              <div role="radiogroup" aria-label="Plan" className="space-y-3">
                {pricing.plans.map((p) => (
                  <button key={p.id} type="button" role="radio" aria-checked={plan === p.id} onClick={() => setPlan(p.id)}
                    className={`w-full text-left rounded-2xl border-2 p-4 transition-colors ${plan === p.id ? "border-[#0284c7] bg-sky-50/50" : "border-[#e8e6e0] hover:border-[#c9c6bd]"}`}>
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="font-syne font-bold text-[#0f0f1a]">{p.name}{p.id === "free" && <span className="ml-2 text-[10px] font-bold bg-green-100 text-green-700 px-2 py-0.5 rounded-full">Selected for you</span>}</span>
                      <span className="font-syne font-bold text-[#0f0f1a]">{money(p.monthly)}<span className="text-xs font-medium text-[#6b6b80]">{p.monthly === 0 ? " forever" : "/mo"}</span></span>
                    </div>
                    <ul className="mt-2 space-y-1">
                      {p.features.slice(0, 6).map((f) => isFeatureHeading(f)
                        ? <li key={f} className="pt-1 text-[11px] font-bold uppercase tracking-wider text-[#0f0f1a]">{f}</li>
                        : <li key={f} className="text-xs text-[#6b6b80] flex gap-1.5"><Check size={12} className="mt-0.5 text-[#0284c7] shrink-0" aria-hidden />{f}</li>)}
                    </ul>
                  </button>
                ))}
              </div>
              {plan !== "free" && <p role="status" className="text-sm text-[#3d3d4d] bg-sky-50 rounded-xl px-4 py-3">Start free, upgrade anytime. You will begin on the Free plan; nothing is charged now.</p>}
              <p className="text-xs text-[#6b6b80]">Prices shown for {st.region === "IN" ? "India" : "International"}.</p>
            </div>
          )}

          {view === 8 && (
            <div className="mt-4 space-y-4">
              <p className="text-sm text-[#6b6b80]">{st.name} is ready to take bookings. Share your link with customers.</p>
              <div className="rounded-2xl border border-[#e8e6e0] overflow-hidden">
                <div className="px-3 py-2 bg-[#f8f7f4] text-xs text-[#6b6b80] truncate">{siteUrl}</div>
                <iframe title={`Preview of ${st.name}`} src={`/${st.slug}`} className="w-full h-64 bg-white pointer-events-none" loading="lazy" />
              </div>
              <div className="rounded-xl bg-[#f8f7f4] px-3 py-3 text-sm break-all" data-testid="booking-link">{bookingUrl}</div>
              <div className="grid grid-cols-3 gap-2">
                <button type="button" onClick={() => copy(bookingUrl)} className={`${secondaryBtn} gap-1.5 !px-2`}><Copy size={14} aria-hidden />{copied ? "Copied" : "Copy"}</button>
                <button type="button" onClick={share} className={`${secondaryBtn} gap-1.5 !px-2`}><Share2 size={14} aria-hidden />Share</button>
                <a href={`/${st.slug}`} target="_blank" rel="noreferrer" className={`${secondaryBtn} gap-1.5 !px-2`}><ExternalLink size={14} aria-hidden />View</a>
              </div>
            </div>
          )}

          <div role="alert">{error && <p className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-3 mt-4">{error}</p>}</div>

          <div className="mt-6 space-y-2">
            {view < total ? (
              <button type="button" onClick={() => next(false)} disabled={busy || !canNext} className={primaryBtn}>{busy ? "Saving…" : view === total - 1 ? "Finish" : "Continue"}</button>
            ) : (
              <button type="button" onClick={finish} disabled={busy} className={primaryBtn}>{busy ? "Opening…" : "Go to dashboard"}</button>
            )}
            {view < total && skippable && (
              <button type="button" onClick={() => next(true)} disabled={busy} className="block w-full min-h-11 text-sm text-[#6b6b80] hover:text-[#0f0f1a]">Skip for now</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
