"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { inputClass, primaryBtn } from "@/components/auth/AuthShell";

type Setup = { secret: string; otpauth: string };

export default function TwoFactorClient({ enrolled, email }: { enrolled: boolean; email: string }) {
  const router = useRouter();
  const [setup, setSetup] = useState<Setup | null>(null);
  const [code, setCode] = useState("");
  const [recovery, setRecovery] = useState("");
  const [useRecovery, setUseRecovery] = useState(false);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function post(url: string, body?: unknown) {
    setBusy(true); setError("");
    try {
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error ?? "Something went wrong."); return null; }
      return data;
    } catch { setError("We could not reach the server."); return null; }
    finally { setBusy(false); }
  }

  const card = "w-full max-w-md bg-white rounded-3xl p-6 sm:p-8 shadow-2xl";

  if (codes) {
    return (
      <div className={card}>
        <h1 className="font-syne font-bold text-2xl mb-2">Save your recovery codes</h1>
        <p className="text-sm text-[#6b6b80] mb-4">Each code works once if you lose your phone. They are shown only now and stored only as hashes. Save them in a password manager.</p>
        <ul className="grid grid-cols-2 gap-2 font-mono text-sm bg-[#f8f7f4] rounded-xl p-4 mb-5" data-testid="recovery-codes">{codes.map((c) => <li key={c}>{c}</li>)}</ul>
        <button type="button" className={primaryBtn} onClick={() => { router.replace("/admin"); router.refresh(); }}>I have saved them. Open the admin area</button>
      </div>
    );
  }

  if (!enrolled) {
    return (
      <div className={card}>
        <h1 className="font-syne font-bold text-2xl mb-2">Set up two-factor sign-in</h1>
        <p className="text-sm text-[#6b6b80] mb-4">The admin area needs a code from an authenticator app (Google Authenticator, Authy, 1Password…) for {email}.</p>
        {!setup ? (
          <button type="button" className={primaryBtn} disabled={busy} onClick={async () => { const d = await post("/api/admin/2fa/setup"); if (d) setSetup(d); }}>Start setup</button>
        ) : (
          <form className="space-y-4" onSubmit={async (e) => { e.preventDefault(); const d = await post("/api/admin/2fa/confirm", { code }); if (d) setCodes(d.recoveryCodes); }}>
            <p className="text-sm">In your app choose “enter a setup key” and type this key (spaces don’t matter):</p>
            <p className="font-mono text-base bg-[#f8f7f4] rounded-xl p-3 break-all" data-testid="totp-secret">{setup.secret}</p>
            <p className="text-xs text-[#6b6b80] break-all">Or open this link on the phone with the app: {setup.otpauth}</p>
            <div>
              <label htmlFor="totp" className="text-sm font-medium block mb-1.5">6-digit code from the app</label>
              <input id="totp" inputMode="numeric" autoComplete="one-time-code" maxLength={7} value={code} onChange={(e) => setCode(e.target.value)} className={inputClass} />
            </div>
            {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
            <button type="submit" className={primaryBtn} disabled={busy || code.replace(/\s/g, "").length < 6}>Confirm and sign in</button>
          </form>
        )}
        {error && !setup && <p role="alert" className="text-sm text-red-600 mt-3">{error}</p>}
      </div>
    );
  }

  return (
    <div className={card}>
      <h1 className="font-syne font-bold text-2xl mb-2">Admin sign-in</h1>
      <p className="text-sm text-[#6b6b80] mb-4">{useRecovery ? "Enter one of your recovery codes. It works once." : "Enter the 6-digit code from your authenticator app."}</p>
      <form className="space-y-4" onSubmit={async (e) => { e.preventDefault(); const d = await post("/api/admin/2fa/verify", useRecovery ? { recoveryCode: recovery } : { code }); if (d) { router.replace("/admin"); router.refresh(); } }}>
        {useRecovery ? (
          <div><label htmlFor="rc" className="text-sm font-medium block mb-1.5">Recovery code</label><input id="rc" value={recovery} onChange={(e) => setRecovery(e.target.value)} autoComplete="off" className={inputClass} /></div>
        ) : (
          <div><label htmlFor="totp" className="text-sm font-medium block mb-1.5">Authenticator code</label><input id="totp" inputMode="numeric" autoComplete="one-time-code" maxLength={7} value={code} onChange={(e) => setCode(e.target.value)} className={inputClass} /></div>
        )}
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        <button type="submit" className={primaryBtn} disabled={busy}>Sign in</button>
        <button type="button" className="block w-full min-h-11 text-sm text-[#6b6b80] hover:text-[#0f0f1a]" onClick={() => { setUseRecovery(!useRecovery); setError(""); }}>{useRecovery ? "Use my authenticator app" : "Lost your phone? Use a recovery code"}</button>
      </form>
    </div>
  );
}
