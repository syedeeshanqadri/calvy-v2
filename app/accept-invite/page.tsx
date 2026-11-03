"use client";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import AuthShell, { primaryBtn } from "@/components/auth/AuthShell";
import PasswordInput from "@/components/auth/PasswordInput";
import { postAuth } from "@/components/auth/authApi";

const MIN = 8;
const INVALID = "This invitation is invalid or has expired.";

function AcceptForm() {
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
    const r = await postAuth("/api/team/accept", { token, password });
    setLoading(false);
    if (r.ok) {
      // The token is spent: take it out of the address bar and history entry.
      window.history.replaceState(null, "", "/accept-invite");
      setState("done");
      return;
    }
    if (r.kind === "error" && r.message === INVALID) { setState("invalid"); return; }
    if (r.kind === "error") setPwError(r.message);
    else setFormError(r.message);
  }

  if (state === "done") {
    return (
      <div role="status">
        <h1 className="font-syne font-bold text-2xl text-[#0f0f1a] mb-2">You&apos;re in</h1>
        <p className="text-[#6b6b80] text-sm mb-6">Your password is set. Sign in to open your dashboard.</p>
        <Link href="/login" className={primaryBtn}>Continue to sign in</Link>
      </div>
    );
  }

  if (state === "invalid") {
    return (
      <div>
        <h1 className="font-syne font-bold text-2xl text-[#0f0f1a] mb-2">Link not valid</h1>
        <p role="alert" className="text-[#6b6b80] text-sm mb-6">{INVALID} Ask the business owner to send you a new invitation.</p>
        <Link href="/login" className={primaryBtn}>Back to sign in</Link>
      </div>
    );
  }

  return (
    <>
      <h1 className="font-syne font-bold text-2xl text-[#0f0f1a] mb-1">Accept your invitation</h1>
      <p className="text-[#6b6b80] text-sm mb-7">Choose a password to join your team.</p>
      <form onSubmit={handleSubmit} className="space-y-4">
        <PasswordInput
          id="new-password"
          label="Password"
          autoComplete="new-password"
          value={password}
          onChange={v => { setPassword(v); setPwError(""); }}
          hint="At least 8 characters"
          error={pwError}
        />
        <PasswordInput
          id="confirm-password"
          label="Confirm password"
          autoComplete="new-password"
          value={confirm}
          onChange={v => { setConfirm(v); setConfirmError(""); }}
          error={confirmError}
        />
        {formError && <p role="alert" className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-3">{formError}</p>}
        <button type="submit" disabled={loading} className={primaryBtn}>
          {loading ? "Saving…" : "Join team"}
        </button>
      </form>
    </>
  );
}

export default function AcceptInvitePage() {
  return (
    <AuthShell>
      <Suspense fallback={<p className="text-sm text-[#6b6b80]">Loading…</p>}>
        <AcceptForm />
      </Suspense>
    </AuthShell>
  );
}
