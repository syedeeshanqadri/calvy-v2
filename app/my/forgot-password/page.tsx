"use client";
import { useState } from "react";
import Link from "next/link";
import AuthShell, { inputClass, primaryBtn, linkClass } from "@/components/auth/AuthShell";
import { postAuth } from "@/components/auth/authApi";

export default function CustomerForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(""); setLoading(true);
    const r = await postAuth("/api/customer/forgot-password", { email: email.trim() });
    setLoading(false);
    if (r.ok) setSent(true); else setError(r.message);
  }

  return (
    <AuthShell>
      {sent ? (
        <div role="status">
          <h1 className="font-syne font-bold text-2xl text-[#0f0f1a] mb-2">Check your email</h1>
          <p className="text-[#6b6b80] text-sm mb-6">If an account exists for that email, we&apos;ve sent a link to reset your password. It expires in 1 hour.</p>
          <Link href="/my/login" className={primaryBtn}>Back to sign in</Link>
        </div>
      ) : (
        <>
          <h1 className="font-syne font-bold text-2xl text-[#0f0f1a] mb-1">Forgot your password?</h1>
          <p className="text-[#6b6b80] text-sm mb-7">Enter your email and we&apos;ll send you a link to reset it.</p>
          {error && <p role="alert" className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-3 mb-4">{error}</p>}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="cf-email" className="text-sm font-medium text-[#0f0f1a] block mb-1.5">Email</label>
              <input id="cf-email" type="email" required autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} className={inputClass} />
            </div>
            <button type="submit" disabled={loading} className={primaryBtn}>{loading ? "Sending…" : "Send reset link"}</button>
          </form>
          <p className="text-sm text-[#6b6b80] mt-6"><Link href="/my/login" className={linkClass}>Back to sign in</Link></p>
        </>
      )}
    </AuthShell>
  );
}
