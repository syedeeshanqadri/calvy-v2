"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import SocialAuthButtons from "@/components/auth/SocialAuthButtons";
import AuthShell, { inputClass, primaryBtn, secondaryBtn, linkClass } from "@/components/auth/AuthShell";
import PasswordInput from "@/components/auth/PasswordInput";
import { postAuth } from "@/components/auth/authApi";
import { PRICING_NOTE, formatMoney, getRegionPricing, isFeatureHeading, yearlySaveBadge } from "@/lib/pricing";
import { useRegion } from "@/components/landing/useRegion";
import { REGIONS } from "@/lib/regions";
import { PackPicker } from "@/components/packs/PackPicker";
import type { PackId } from "@/lib/packs/types";


export default function SignupPage() {
  const [packId, setPackId] = useState<PackId>("OTHER");
  const [form, setForm] = useState({ name: "", businessName: "", email: "", password: "", region: "" });
  const [step, setStep] = useState<1 | 2>(1);
  const [plan, setPlan] = useState<"free" | "professional" | "business">("free");
  const [yearly, setYearly] = useState(true);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [resending, setResending] = useState(false);
  const [resendMsg, setResendMsg] = useState("");
  const [resendError, setResendError] = useState("");
  const detectedRegion = useRegion();

  // Pre-selected from the visitor's detected country until they pick one themselves.
  const region = form.region || (detectedRegion === "IN" ? "IN" : "");

  // Step 2 shows the price list that matches the region chosen in step 1.
  const pricing = getRegionPricing(region === "IN" ? "IN" : "INTL");
  const money = (n: number) => formatMoney(n, pricing);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  async function handleResend() {
    setResendMsg("");
    setResendError("");
    setResending(true);
    const r = await postAuth("/api/auth/resend-verification", { email: form.email.trim() });
    setResending(false);
    if (r.ok) {
      setResendMsg("If that account is not verified yet, we've sent a new link.");
      setCooldown(60);
    } else {
      setResendError(r.message);
    }
  }

  function set(field: string, value: string) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  // Step 1 only validates and moves on; the account is created on the final click in step 2.
  function handleContinue(e: React.FormEvent) {
    e.preventDefault();
    if (!region) { setError("Please select your country or region."); return; }
    setError("");
    setStep(2);
  }

  async function handleSubmit() {
    setError("");
    setLoading(true);

    let res: Response;
    let data: { error?: string } = {};
    try {
      res = await fetch("/api/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, region, plan, packId, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }),
      });
      data = await res.json().catch(() => ({}));
    } catch {
      setLoading(false);
      setError("We could not reach the server. Check your connection and try again.");
      return;
    }
    setLoading(false);

    if (!res.ok) {
      setError(data.error ?? "Something went wrong. Try again.");
      setStep(1); // the problem is almost always in the account details (e.g. email already used)
      return;
    }

    setDone(true);
    setCooldown(60);
  }

  if (done) {
    return (
      <AuthShell className="text-center">
        <div className="w-16 h-16 rounded-2xl bg-sky-50 flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-sky-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        </div>
        <h1 className="font-syne font-bold text-2xl text-[#0f0f1a] mb-2">Check your email</h1>
        <p className="text-[#6b6b80] text-sm mb-1">We sent a verification link to</p>
        <p className="font-semibold text-[#0f0f1a] text-sm mb-6 break-all">{form.email}</p>
        <p className="text-sm text-[#6b6b80] mb-5">Click the link in the email to activate your account. The link expires in 24 hours.</p>
        <p className="text-sm text-[#6b6b80] mb-3">Didn&apos;t get it?</p>
        <button type="button" onClick={handleResend} disabled={resending || cooldown > 0} className={secondaryBtn}>
          {resending ? "Sending…" : cooldown > 0 ? `Resend the email (${cooldown}s)` : "Resend the email"}
        </button>
        <div role="status">
          {resendMsg && <p className="text-sm text-green-700 bg-green-50 rounded-xl px-4 py-3 mt-3">{resendMsg}</p>}
        </div>
        <div role="alert">
          {resendError && <p className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-3 mt-3">{resendError}</p>}
        </div>
        <p className="text-center text-sm text-[#6b6b80] mt-6 pt-5 border-t border-[#f0ede8]">
          Already verified?{" "}
          <Link href="/login" className={linkClass}>Sign in</Link>
        </p>
      </AuthShell>
    );
  }

  if (step === 2) {
    return (
      <AuthShell>
        <h1 className="font-syne font-bold text-2xl text-[#0f0f1a] mb-1">Choose your plan</h1>
        <p className="text-[#6b6b80] text-sm mb-5">Every account starts free. {PRICING_NOTE}</p>
        {pricing.headline && <p className="font-syne font-bold text-sm text-sky-700 mb-4">{pricing.headline}</p>}

        <div className="flex items-center gap-1 bg-[#f8f7f4] rounded-xl p-1 mb-4" role="group" aria-label="Billing period">
          <button type="button" onClick={() => setYearly(false)} aria-pressed={!yearly}
            className={`flex-1 min-h-11 rounded-lg text-sm font-medium transition-all ${!yearly ? "bg-white shadow-sm text-[#0f0f1a]" : "text-[#6b6b80]"}`}>
            Monthly
          </button>
          <button type="button" onClick={() => setYearly(true)} aria-pressed={yearly}
            className={`flex-1 min-h-11 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-1.5 ${yearly ? "bg-white shadow-sm text-[#0f0f1a]" : "text-[#6b6b80]"}`}>
            Yearly
            <span className="text-[10px] font-bold bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full">{yearlySaveBadge(pricing.plans)}</span>
          </button>
        </div>

        <div className="space-y-3" role="radiogroup" aria-label="Plan">
          {pricing.plans.map(p => {
            const selected = plan === p.id;
            const perMonth = yearly ? p.yearlyPerMonth : p.monthly;
            return (
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setPlan(p.id)}
                className={`w-full text-left rounded-2xl border-2 p-4 transition-all ${selected ? "border-[#0284c7] bg-sky-50/50" : "border-[#e8e6e0] hover:border-[#c9c6bd]"}`}
              >
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-syne font-bold text-[#0f0f1a]">
                    {p.name}
                    {p.badge && <span className="ml-2 align-middle text-[10px] font-bold bg-sky-100 text-sky-700 px-2 py-0.5 rounded-full">{p.badge}</span>}
                  </span>
                  <span className="font-syne font-bold text-[#0f0f1a]">
                    {money(perMonth)}<span className="text-xs font-medium text-[#6b6b80]">{p.monthly === 0 ? " forever" : "/mo"}</span>
                  </span>
                </div>
                {p.monthly > 0 && yearly && <p className="text-xs text-green-700 font-medium mt-0.5">billed {money(p.yearlyTotal)} yearly</p>}
                <ul className="mt-2 space-y-1">
                  {p.features.map(f => isFeatureHeading(f) ? (
                    <li key={f} className="pt-1 text-[11px] font-bold uppercase tracking-wider text-[#0f0f1a]">{f}</li>
                  ) : (
                    <li key={f} className="text-xs text-[#6b6b80] flex gap-1.5"><span aria-hidden className="text-[#0284c7]">✓</span>{f}</li>
                  ))}
                </ul>
              </button>
            );
          })}
        </div>

        {plan !== "free" && (
          <p role="status" className="text-sm text-[#3d3d4d] bg-sky-50 rounded-xl px-4 py-3 mt-4">
            You&apos;ll start on the Free plan. Upgrade from Billing after you verify your email.
          </p>
        )}

        <div role="alert">
          {error && <p className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-3 mt-4">{error}</p>}
        </div>

        <button type="button" onClick={handleSubmit} disabled={loading} className={`${primaryBtn} mt-4`}>
          {loading ? "Creating your account…" : "Create my account"}
        </button>
        <button type="button" onClick={() => { setError(""); setStep(1); }} className="block mx-auto mt-4 min-h-11 text-sm text-[#6b6b80] hover:text-[#0f0f1a]">
          ← Back to your details
        </button>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <h1 className="font-syne font-bold text-2xl text-[#0f0f1a] mb-1">Create your account</h1>
      <p className="text-[#6b6b80] text-sm mb-7">Set up your booking page in under 10 minutes.</p>

      <form onSubmit={handleContinue} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor="signup-name" className="text-sm font-medium text-[#0f0f1a] block mb-1.5">Your name</label>
            <input
              id="signup-name"
              type="text"
              required
              autoComplete="name"
              value={form.name}
              onChange={e => set("name", e.target.value)}
              placeholder="Alex Johnson"
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="signup-business" className="text-sm font-medium text-[#0f0f1a] block mb-1.5">Business name</label>
            <input
              id="signup-business"
              type="text"
              required
              autoComplete="organization"
              value={form.businessName}
              onChange={e => set("businessName", e.target.value)}
              placeholder="Business name"
              className={inputClass}
            />
          </div>
        </div>

        <div>
          <label htmlFor="signup-email" className="text-sm font-medium text-[#0f0f1a] block mb-1.5">Email</label>
          <input
            id="signup-email"
            type="email"
            required
            autoComplete="username"
            value={form.email}
            onChange={e => set("email", e.target.value)}
            placeholder="you@business.com"
            className={inputClass}
          />
        </div>

        <PasswordInput
          id="signup-password"
          label="Password"
          autoComplete="new-password"
          value={form.password}
          onChange={v => set("password", v)}
          minLength={8}
          hint="At least 8 characters"
        />

        <div>
          <label htmlFor="signup-region" className="text-sm font-medium text-[#0f0f1a] block mb-1.5">Country / region</label>
          <select
            id="signup-region"
            required
            value={region}
            onChange={e => set("region", e.target.value)}
            className={`${inputClass} bg-white`}
          >
            <option value="" disabled>Select your country…</option>
            {REGIONS.map(r => (
              <option key={r.code} value={r.code}>{r.name}</option>
            ))}
          </select>
        </div>

        <PackPicker value={packId} onChange={setPackId} name="signup-pack" />

        <div role="alert">
          {error && <p className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-3">{error}</p>}
        </div>

        <button type="submit" className={primaryBtn}>
          Continue — choose your plan
        </button>
      </form>

      <SocialAuthButtons callbackUrl="/dashboard" />

      <p className="text-center text-xs text-[#6b6b80] mt-4">
        By signing up you agree to our{" "}
        <Link href="/terms" className="underline">Terms</Link> and{" "}
        <Link href="/privacy" className="underline">Privacy Policy</Link>.
      </p>

      <p className="text-center text-sm text-[#6b6b80] mt-5 pt-5 border-t border-[#f0ede8]">
        Already have an account?{" "}
        <Link href="/login" className={linkClass}>
          Sign in
        </Link>
      </p>
    </AuthShell>
  );
}
