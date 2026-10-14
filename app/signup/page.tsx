"use client";
import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import SocialAuthButtons from "@/components/auth/SocialAuthButtons";

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

  function set(field: string, value: string) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.currency) { setError("Please select your region."); return; }
    setError("");
    setLoading(true);

    const res = await fetch("/api/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });

    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(data.error ?? "Something went wrong. Try again.");
      return;
    }

    setDone(true);
  }

  if (done) {
    return (
      <div className="min-h-dvh bg-[#0f0f1a] flex items-center justify-center p-4" style={{ paddingTop: "max(1rem, env(safe-area-inset-top))", paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}>
        <div className="w-full max-w-md">
          <div className="flex justify-center mb-10">
            <Image src="/calvy.svg" alt="Calvy" width={120} height={35} className="brightness-0 invert" />
          </div>
          <div className="bg-white rounded-3xl p-8 shadow-2xl text-center">
            <div className="w-16 h-16 rounded-2xl bg-sky-50 flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-sky-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <h2 className="font-syne font-bold text-2xl text-[#0f0f1a] mb-2">Check your email</h2>
            <p className="text-[#6b6b80] text-sm mb-1">We sent a verification link to</p>
            <p className="font-semibold text-[#0f0f1a] text-sm mb-6">{form.email}</p>
            <p className="text-xs text-[#6b6b80]">Click the link in the email to activate your account. The link expires in 24 hours.</p>
            <p className="text-center text-sm text-[#6b6b80] mt-6 pt-5 border-t border-[#f0ede8]">
              Already verified?{" "}
              <Link href="/login" className="text-[#0284c7] font-semibold hover:underline">Sign in</Link>
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-[#0f0f1a] flex items-center justify-center p-4" style={{ paddingTop: "max(1rem, env(safe-area-inset-top))", paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}>
      <div className="w-full max-w-md">
        <div className="flex justify-center mb-10">
          <Image src="/calvy.svg" alt="Calvy" width={120} height={35} className="brightness-0 invert" />
        </div>

        <div className="bg-white rounded-3xl p-8 shadow-2xl">
          <h1 className="font-syne font-bold text-2xl text-[#0f0f1a] mb-1">Start your free trial</h1>
          <p className="text-[#6b6b80] text-sm mb-7">Set up your booking page in under 10 minutes.</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium text-[#0f0f1a] block mb-1.5">Your name</label>
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={e => set("name", e.target.value)}
                  placeholder="Alex Johnson"
                  className="w-full rounded-xl border border-[#e8e6e0] px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#0284c7]/20 focus:border-[#0284c7] transition-all"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-[#0f0f1a] block mb-1.5">Business name</label>
                <input
                  type="text"
                  required
                  value={form.businessName}
                  onChange={e => set("businessName", e.target.value)}
                  placeholder="My Salon"
                  className="w-full rounded-xl border border-[#e8e6e0] px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#0284c7]/20 focus:border-[#0284c7] transition-all"
                />
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-[#0f0f1a] block mb-1.5">Email</label>
              <input
                type="email"
                required
                value={form.email}
                onChange={e => set("email", e.target.value)}
                placeholder="you@business.com"
                className="w-full rounded-xl border border-[#e8e6e0] px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#0284c7]/20 focus:border-[#0284c7] transition-all"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-[#0f0f1a] block mb-1.5">Password</label>
              <input
                type="password"
                required
                minLength={8}
                value={form.password}
                onChange={e => set("password", e.target.value)}
                placeholder="Min. 8 characters"
                className="w-full rounded-xl border border-[#e8e6e0] px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#0284c7]/20 focus:border-[#0284c7] transition-all"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-[#0f0f1a] block mb-1.5">Region & currency</label>
              <select
                required
                value={form.currency}
                onChange={e => set("currency", e.target.value)}
                className="w-full rounded-xl border border-[#e8e6e0] px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#0284c7]/20 focus:border-[#0284c7] transition-all text-[#0f0f1a] bg-white"
              >
                <option value="" disabled>Select your region…</option>
                {REGIONS.map(r => (
                  <option key={r.currency} value={r.currency}>{r.label}</option>
                ))}
              </select>
              <p className="text-xs text-[#6b6b80] mt-1.5">All prices and payments will use this currency.</p>
            </div>

            {error && (
              <p className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-3">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#0284c7] text-white font-semibold rounded-xl py-3 text-sm hover:bg-[#0369a1] transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
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
            <Link href="/login" className="text-[#0284c7] font-semibold hover:underline">
              Sign in
            </Link>
          </p>
        </div>

        <p className="text-center text-white/20 text-xs mt-6">© 2026 Calvy · All rights reserved</p>
      </div>
    </div>
  );
}
