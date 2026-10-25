"use client";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import AuthShell, { primaryBtn } from "@/components/auth/AuthShell";
import PasswordInput from "@/components/auth/PasswordInput";
import { postAuth } from "@/components/auth/authApi";

const INVALID = "This reset link is invalid or has expired.";

function ResetForm() {
  const token = useSearchParams()?.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [state, setState] = useState<"form" | "done" | "invalid">(token ? "form" : "invalid");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password.length < 8) { setError("Password must be at least 8 characters."); return; }
    if (password !== confirm) { setError("Passwords do not match."); return; }
    setLoading(true);
    const r = await postAuth("/api/customer/reset-password", { token, password });
    setLoading(false);
    if (r.ok) setState("done");
    else if (r.kind === "error" && r.message === INVALID) setState("invalid");
    else setError(r.message);
  }

  if (state === "done") {
    return (
      <div role="status">
        <h1 className="font-syne font-bold text-2xl text-[#0f0f1a] mb-2">Password changed</h1>
        <p className="text-[#6b6b80] text-sm mb-6">Sign in with your new password.</p>
        <Link href="/my/login?reset=1" className={primaryBtn}>Continue to sign in</Link>
      </div>
    );
  }
  if (state === "invalid") {
    return (
      <div>
        <h1 className="font-syne font-bold text-2xl text-[#0f0f1a] mb-2">Link not valid</h1>
        <p role="alert" className="text-[#6b6b80] text-sm mb-6">{INVALID} Request a new one and we&apos;ll email it to you.</p>
        <Link href="/my/forgot-password" className={primaryBtn}>Request a new link</Link>
      </div>
    );
  }
  return (
    <>
      <h1 className="font-syne font-bold text-2xl text-[#0f0f1a] mb-1">Choose a new password</h1>
      <p className="text-[#6b6b80] text-sm mb-7">Pick something you don&apos;t use on other sites.</p>
      {error && <p role="alert" className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-3 mb-4">{error}</p>}
      <form onSubmit={handleSubmit} className="space-y-4">
        <PasswordInput id="cr-password" label="New password" value={password} onChange={setPassword} autoComplete="new-password" minLength={8} hint="At least 8 characters." />
        <PasswordInput id="cr-confirm" label="Confirm password" value={confirm} onChange={setConfirm} autoComplete="new-password" />
        <button type="submit" disabled={loading} className={primaryBtn}>{loading ? "Saving…" : "Change password"}</button>
      </form>
    </>
  );
}

export default function CustomerResetPasswordPage() {
  return <AuthShell><Suspense fallback={null}><ResetForm /></Suspense></AuthShell>;
}
