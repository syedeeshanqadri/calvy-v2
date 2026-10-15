"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import SocialAuthButtons from "@/components/auth/SocialAuthButtons";
import AuthShell, { inputClass, primaryBtn, secondaryBtn, linkClass } from "@/components/auth/AuthShell";
import PasswordInput from "@/components/auth/PasswordInput";
import { postAuth } from "@/components/auth/authApi";

const REGIONS = [
  { currency: "USD", label: "United States — US Dollar (USD $)" },
  { currency: "EUR", label: "Europe — Euro (EUR €)" },
  { currency: "GBP", label: "United Kingdom — British Pound (GBP £)" },
  { currency: "CAD", label: "Canada — Canadian Dollar (CAD C$)" },
  { currency: "AUD", label: "Australia / NZ — Australian Dollar (AUD A$)" },
  { currency: "AED", label: "UAE — Dirham (AED)" },
  { currency: "SAR", label: "Saudi Arabia — Riyal (SAR)" },
  { currency: "INR", label: "India — Indian Rupee (INR ₹)" },
  { currency: "PKR", label: "Pakistan — Rupee (PKR Rs)" },
  { currency: "BDT", label: "Bangladesh — Taka (BDT ৳)" },
  { currency: "MYR", label: "Malaysia — Ringgit (MYR RM)" },
  { currency: "SGD", label: "Singapore — Dollar (SGD S$)" },
  { currency: "NGN", label: "Nigeria — Naira (NGN ₦)" },
  { currency: "ZAR", label: "South Africa — Rand (ZAR R)" },
];

export default function SignupPage() {
  const [form, setForm] = useState({ name: "", businessName: "", email: "", password: "", currency: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [resending, setResending] = useState(false);
  const [resendMsg, setResendMsg] = useState("");
  const [resendError, setResendError] = useState("");

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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.currency) { setError("Please select your region."); return; }
    setError("");
    setLoading(true);

    let res: Response;
    let data: { error?: string } = {};
    try {
      res = await fetch("/api/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }),
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
        <button type="button" onClick={handleResend} disabled={resending || cooldown > 0} className={secondaryBtn}>
          {resending ? "Sending…" : cooldown > 0 ? `Resend email (${cooldown}s)` : "Resend email"}
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

  return (
    <AuthShell>
      <h1 className="font-syne font-bold text-2xl text-[#0f0f1a] mb-1">Start your free trial</h1>
      <p className="text-[#6b6b80] text-sm mb-7">Set up your booking page in under 10 minutes.</p>

      <form onSubmit={handleSubmit} className="space-y-4">
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
              placeholder="My Salon"
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
          <label htmlFor="signup-region" className="text-sm font-medium text-[#0f0f1a] block mb-1.5">Region & currency</label>
          <select
            id="signup-region"
            required
            value={form.currency}
            onChange={e => set("currency", e.target.value)}
            aria-describedby="signup-region-hint"
            className={`${inputClass} bg-white`}
          >
            <option value="" disabled>Select your region…</option>
            {REGIONS.map(r => (
              <option key={r.currency} value={r.currency}>{r.label}</option>
            ))}
          </select>
          <p id="signup-region-hint" className="text-xs text-[#6b6b80] mt-1.5">All prices and payments will use this currency.</p>
        </div>

        <div role="alert">
          {error && <p className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-3">{error}</p>}
        </div>

        <button type="submit" disabled={loading} className={primaryBtn}>
          {loading ? "Creating your account…" : "Create free account"}
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
