"use client";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import AuthShell, { primaryBtn } from "@/components/auth/AuthShell";
import PasswordInput from "@/components/auth/PasswordInput";
import { postAuth } from "@/components/auth/authApi";

const MIN = 8;
const INVALID = "This reset link is invalid or has expired.";

function ResetForm() {
  const token = useSearchParams().get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pwError, setPwError] = useState("");
  const [confirmError, setConfirmError] = useState("");
  const [formError, setFormError] = useState("");
  const [loading, setLoading] = useState(false);
  const [state, setState] = useState<"form" | "done" | "invalid">(token ? "form" : "invalid");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPwError(""); setConfirmError(""); setFormError("");
    if (password.length < MIN) { setPwError("Password must be at least 8 characters."); return; }
    if (password !== confirm) { setConfirmError("Passwords do not match."); return; }
    setLoading(true);
    const r = await postAuth("/api/auth/reset-password", { token, password });
    setLoading(false);
    if (r.ok) { setState("done"); return; }
    if (r.kind === "error" && r.message === INVALID) { setState("invalid"); return; }
    if (r.kind === "error") setPwError(r.message);
    else setFormError(r.message);
  }

  if (state === "done") {
    return (
      <div role="status">
        <h1 className="font-syne font-bold text-2xl text-[#0f0f1a] mb-2">Password changed</h1>
        <p className="text-[#6b6b80] text-sm mb-6">Your password was changed. Sign in with your new password.</p>
        <Link href="/login?reset=1" className={primaryBtn}>Continue to sign in</Link>
      </div>
    );
  }

  if (state === "invalid") {
    return (
      <div>
        <h1 className="font-syne font-bold text-2xl text-[#0f0f1a] mb-2">Link not valid</h1>
        <p role="alert" className="text-[#6b6b80] text-sm mb-6">{INVALID} Request a new one and we&apos;ll email it to you.</p>
        <Link href="/forgot-password" className={primaryBtn}>Request a new link</Link>
      </div>
    );
  }

  return (
    <>
      <h1 className="font-syne font-bold text-2xl text-[#0f0f1a] mb-1">Choose a new password</h1>
      <p className="text-[#6b6b80] text-sm mb-7">Pick something you don&apos;t use on other sites.</p>
      <form onSubmit={handleSubmit} className="space-y-4">
        <PasswordInput
          id="new-password"
          label="New password"
          autoComplete="new-password"
          value={password}
          onChange={v => { setPassword(v); setPwError(""); }}
          hint="At least 8 characters"
          error={pwError}
        />
        <PasswordInput
          id="confirm-password"
          label="Confirm new password"
          autoComplete="new-password"
          value={confirm}
          onChange={v => { setConfirm(v); setConfirmError(""); }}
          error={confirmError}
        />
        {formError && <p role="alert" className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-3">{formError}</p>}
        <button type="submit" disabled={loading} className={primaryBtn}>
          {loading ? "Saving…" : "Change password"}
        </button>
      </form>
    </>
  );
}

export default function ResetPasswordPage() {
  return (
    <AuthShell>
      <Suspense fallback={<p className="text-sm text-[#6b6b80]">Loading…</p>}>
        <ResetForm />
      </Suspense>
    </AuthShell>
  );
}
