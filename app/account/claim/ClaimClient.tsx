"use client";
import { useState } from "react";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { inputClass, primaryBtn, secondaryBtn } from "@/components/auth/AuthShell";

/**
 * Step 1 is one button on purpose: opening the page does nothing, so mail scanners and link previews cannot spend the one-time link.
 * Step 2 (after signing in) is optional: set a password, link Google, or just go to the bookings.
 */
export default function ClaimClient({ token }: { token: string }) {
  const [state, setState] = useState<"ask" | "working" | "bad" | "in">("ask");
  const [password, setPassword] = useState("");
  const [pwState, setPwState] = useState<{ busy: boolean; done: boolean; error: string }>({ busy: false, done: false, error: "" });
  const [googleBusy, setGoogleBusy] = useState(false);

  async function claim() {
    setState("working");
    const r = await signIn("customer-claim", { token, redirect: false });
    setState(r?.error || !r?.ok ? "bad" : "in");
  }
  async function savePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwState({ busy: true, done: false, error: "" });
    try {
      const res = await fetch("/api/customer/claim", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) });
      const json = await res.json().catch(() => ({}));
      setPwState(res.ok ? { busy: false, done: true, error: "" } : { busy: false, done: false, error: json.error ?? "Could not save the password." });
    } catch { setPwState({ busy: false, done: false, error: "We could not reach the server. Try again." }); }
  }
  async function linkGoogle() {
    setGoogleBusy(true);
    try {
      const res = await fetch("/api/customer/google", { method: "POST" });
      if (res.ok) { await signIn("google-customer", { callbackUrl: "/account" }); return; }
    } catch { /* fall through */ }
    setGoogleBusy(false);
  }

  if (!token || state === "bad") {
    return (
      <>
        <h1 className="font-syne font-bold text-2xl text-[#0f0f1a] mb-2">This link has expired or was already used</h1>
        <p className="text-sm text-[#6b6b80] mb-6">Your booking is safe. Sign in to see it, or book again and use the link in the new confirmation email.</p>
        <Link href="/account/login" className={primaryBtn}>Go to sign in</Link>
      </>
    );
  }
  if (state === "in") {
    return (
      <div className="text-left space-y-5">
        <div className="text-center">
          <h1 className="font-syne font-bold text-2xl text-[#0f0f1a] mb-1">You&apos;re in</h1>
          <p className="text-sm text-[#6b6b80]">Your email is verified and your bookings are in one place.</p>
        </div>
        <Link href="/account" className={primaryBtn}>See my bookings</Link>
        <div className="border-t border-[#f0ede8] pt-4 space-y-3">
          <p className="text-sm font-semibold text-[#0f0f1a]">Optional: make it faster next time</p>
          {pwState.done ? <p role="status" className="text-sm text-green-700">Password saved. You can sign in with your email and password.</p> : (
            <form onSubmit={savePassword} className="space-y-2">
              <label htmlFor="claim-password" className="text-xs text-[#6b6b80]">Set a password (8+ characters)</label>
              <input id="claim-password" type="password" autoComplete="new-password" minLength={8} required value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass} />
              {pwState.error && <p role="alert" className="text-sm text-red-600">{pwState.error}</p>}
              <button type="submit" disabled={pwState.busy} aria-busy={pwState.busy || undefined} className={secondaryBtn}>{pwState.busy ? "Saving…" : "Save password"}</button>
            </form>
          )}
          <button type="button" onClick={linkGoogle} disabled={googleBusy} aria-busy={googleBusy || undefined} className={secondaryBtn}>{googleBusy ? "Opening Google…" : "Link my Google account"}</button>
        </div>
      </div>
    );
  }
  return (
    <>
      <h1 className="font-syne font-bold text-2xl text-[#0f0f1a] mb-2">Claim your Calvy account</h1>
      <p className="text-sm text-[#6b6b80] mb-6">One tap and you can see and change your bookings. No password needed.</p>
      <button type="button" onClick={claim} disabled={state === "working"} aria-busy={state === "working" || undefined} className={primaryBtn}>{state === "working" ? "Opening your account…" : "Open my bookings"}</button>
    </>
  );
}
