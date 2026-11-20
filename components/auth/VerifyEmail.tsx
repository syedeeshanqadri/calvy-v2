"use client";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { MailWarning, X } from "lucide-react";

/** False only when the session says the owner's email is unverified. Older sessions (no flag) and customers count as fine. */
export function useEmailVerified(): boolean {
  const { data } = useSession();
  return data?.user?.emailVerified !== false;
}

async function resend(): Promise<{ ok: boolean; message: string }> {
  try {
    const res = await fetch("/api/account/verify/resend", { method: "POST" });
    const json = await res.json().catch(() => ({}));
    if (res.ok) return { ok: true, message: json.alreadyVerified ? "Your email is already verified. Reload the page." : "We sent a link to your email. Open it to verify." };
    return { ok: false, message: json.error ?? "Could not send the email. Try again." };
  } catch {
    return { ok: false, message: "We could not reach the server. Try again." };
  }
}

function ResendButton({ className }: { className?: string }) {
  const [state, setState] = useState<{ busy: boolean; message: string; ok: boolean }>({ busy: false, message: "", ok: true });
  async function go() { setState({ busy: true, message: "", ok: true }); const r = await resend(); setState({ busy: false, ...r }); }
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button type="button" onClick={go} disabled={state.busy} aria-busy={state.busy || undefined} className={className ?? "text-sm font-semibold underline underline-offset-2"}>{state.busy ? "Sending…" : "Resend verification email"}</button>
      <span role="status" className={`text-xs ${state.ok ? "text-green-700" : "text-red-600"}`}>{state.message}</span>
    </span>
  );
}

/** Inline, in place of a locked control: "Verify your email to continue" with a resend button. Not a redirect. */
export function VerifyEmailInline({ what }: { what?: string }) {
  return (
    <div role="status" data-testid="verify-inline" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      <p className="font-semibold flex items-center gap-2"><MailWarning size={16} aria-hidden />Verify your email to continue</p>
      <p className="mt-1 text-amber-800">{what ? `${what} needs a verified email address.` : "This needs a verified email address."} We emailed you a link when you signed up.</p>
      <div className="mt-2"><ResendButton /></div>
    </div>
  );
}

const DISMISS_KEY = "calvy_verify_banner_dismissed_until";

/** The dashboard banner for an owner who has not verified yet. Dismissible for three days; it comes back until they verify. */
export function VerifyEmailBanner() {
  const verified = useEmailVerified();
  const [hidden, setHidden] = useState(true);
  useEffect(() => {
    try { setHidden(Number(localStorage.getItem(DISMISS_KEY) ?? 0) > Date.now()); } catch { setHidden(false); }
  }, []);
  if (verified || hidden) return null;
  function dismiss() {
    setHidden(true);
    try { localStorage.setItem(DISMISS_KEY, String(Date.now() + 3 * 86_400_000)); } catch { /* storage blocked: it just stays hidden this visit */ }
  }
  return (
    <div role="status" data-testid="verify-banner" className="flex items-start gap-3 border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900">
      <MailWarning size={16} className="mt-0.5 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">
        <span className="font-semibold">Verify your email.</span> <span>It keeps your account safe and unlocks payments, WhatsApp and exports.</span>{" "}
        <ResendButton />
      </div>
      <button type="button" onClick={dismiss} aria-label="Dismiss" className="shrink-0 min-h-11 min-w-11 -my-2 inline-flex items-center justify-center text-amber-700 hover:text-amber-900"><X size={16} aria-hidden /></button>
    </div>
  );
}

/** Shows the inline "Verify your email to continue" only while the owner is unverified; renders nothing otherwise. Put it above a locked control. */
export function VerifyGateNotice({ what }: { what?: string }) {
  return useEmailVerified() ? null : <VerifyEmailInline what={what} />;
}

/** Renders its children for a verified owner and the inline notice for an unverified one (used where a download link would just fail). */
export function VerifiedOnly({ what, children }: { what?: string; children: React.ReactNode }) {
  return useEmailVerified() ? <>{children}</> : <VerifyEmailInline what={what} />;
}
