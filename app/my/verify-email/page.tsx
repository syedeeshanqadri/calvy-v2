"use client";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import AuthShell, { primaryBtn } from "@/components/auth/AuthShell";
import PasswordInput from "@/components/auth/PasswordInput";
import { postAuth } from "@/components/auth/authApi";

// The emailed link only brings you here: nothing happens until you press the button AND give the
// password chosen at signup (a mail scanner opening the link verifies nothing).
function VerifyForm() {
  const token = useSearchParams()?.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(""); setLoading(true);
    const r = await postAuth("/api/customer/verify-email", { token, password });
    setLoading(false);
    if (r.ok) setDone(true); else setError(r.message);
  }

  if (done) {
    return (
      <div role="status">
        <h1 className="font-syne font-bold text-2xl text-[#0f0f1a] mb-2">Email verified</h1>
        <p className="text-[#6b6b80] text-sm mb-6">Sign in to see your bookings.</p>
        <Link href="/my/login?verified=1" className={primaryBtn}>Continue to sign in</Link>
      </div>
    );
  }
  if (!token) {
    return (
      <div>
        <h1 className="font-syne font-bold text-2xl text-[#0f0f1a] mb-2">Link not valid</h1>
        <p className="text-[#6b6b80] text-sm mb-6">This verification link is incomplete. Sign in to ask for a new one.</p>
        <Link href="/my/login" className={primaryBtn}>Go to sign in</Link>
      </div>
    );
  }
  return (
    <>
      <h1 className="font-syne font-bold text-2xl text-[#0f0f1a] mb-1">Verify your email</h1>
      <p className="text-[#6b6b80] text-sm mb-7">Enter the password you chose when you created your account.</p>
      {error && <p role="alert" className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-3 mb-4">{error}</p>}
      <form onSubmit={handleSubmit} className="space-y-4">
        <PasswordInput id="cv-password" label="Password" value={password} onChange={setPassword} autoComplete="current-password" />
        <button type="submit" disabled={loading} className={primaryBtn}>{loading ? "Verifying…" : "Verify email"}</button>
      </form>
    </>
  );
}

export default function CustomerVerifyEmailPage() {
  return <AuthShell><Suspense fallback={null}><VerifyForm /></Suspense></AuthShell>;
}
