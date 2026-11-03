"use client";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import Link from "next/link";
import AuthShell, { primaryBtn } from "@/components/auth/AuthShell";
import PasswordInput from "@/components/auth/PasswordInput";
import { postAuth } from "@/components/auth/authApi";

// The emailed link only brings you here: nothing happens until you press the button AND give the
// password chosen at signup (a mail scanner opening the link verifies nothing).
function VerifyForm() {
  const params = useSearchParams();
  const token = params?.get("token") ?? "";
  return params?.get("setup") === "1" && token ? <SetupForm token={token} /> : <PasswordVerifyForm token={token} />;
}

function PasswordVerifyForm({ token }: { token: string }) {
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

// Account made automatically at booking: the link holder chooses the first password, which also verifies
// the email, and is signed straight in.
function SetupForm({ token }: { token: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password.length < 8) { setError("Password must be at least 8 characters."); return; }
    if (password !== confirm) { setError("The two passwords do not match."); return; }
    setLoading(true);
    try {
      const res = await fetch("/api/customer/verify-email", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, password }) });
      const data = (await res.json().catch(() => ({}))) as { error?: string; setup?: boolean; email?: string };
      if (!res.ok) { setError(data.error ?? "This link is invalid or has expired."); return; }
      if (data.setup && data.email) {
        const r = await signIn("customer", { email: data.email, password, redirect: false });
        if (r?.ok) { router.push("/my"); router.refresh(); return; }
      }
      router.push("/my/login?verified=1");
    } catch {
      setError("We could not reach the server. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <h1 className="font-syne font-bold text-2xl text-[#0f0f1a] mb-1">Set your password</h1>
      <p className="text-[#6b6b80] text-sm mb-7">This verifies your email and opens your account, where you can keep track of all your appointments.</p>
      {error && <p role="alert" className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-3 mb-4">{error}</p>}
      <form onSubmit={handleSubmit} className="space-y-4">
        <PasswordInput id="cs-password" label="New password" value={password} onChange={setPassword} autoComplete="new-password" minLength={8} hint="At least 8 characters." />
        <PasswordInput id="cs-confirm" label="Confirm password" value={confirm} onChange={setConfirm} autoComplete="new-password" minLength={8} />
        <button type="submit" disabled={loading} className={primaryBtn}>{loading ? "Saving…" : "Verify and continue"}</button>
      </form>
      <p className="text-xs text-[#6b6b80] mt-6">Link expired? Use <Link href="/my/forgot-password" className="font-semibold text-sky-700 hover:underline">Forgot password</Link> with the same email.</p>
    </>
  );
}
