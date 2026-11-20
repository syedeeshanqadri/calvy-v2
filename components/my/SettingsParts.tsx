"use client";
import { useState } from "react";
import { inputClass } from "@/components/auth/AuthShell";
import { BellRing, KeyRound, MonitorSmartphone } from "lucide-react";

const btn = "min-h-11 inline-flex items-center justify-center rounded-xl px-5 text-sm font-semibold border border-cv-line bg-white hover:bg-cv-blue-tint/50 disabled:opacity-60";

/** For an account that has no password yet (made at booking, claimed by link): choose one. Optional: the emailed link always gets them back in. */
export function SetPasswordCard() {
  const [password, setPassword] = useState("");
  const [state, setState] = useState<{ busy: boolean; done: boolean; error: string }>({ busy: false, done: false, error: "" });
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setState({ busy: true, done: false, error: "" });
    try {
      const res = await fetch("/api/customer/claim", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) });
      const json = await res.json().catch(() => ({}));
      setState(res.ok ? { busy: false, done: true, error: "" } : { busy: false, done: false, error: json.error ?? "Could not save the password." });
    } catch { setState({ busy: false, done: false, error: "We could not reach the server. Try again." }); }
  }
  return (
    <section aria-labelledby="setpw" className="acct-card p-5" data-testid="set-password-card">
      <h3 id="setpw" className="flex items-center gap-2 font-display text-lg font-bold text-cv-ink"><KeyRound size={18} aria-hidden />Set a password</h3>
      <p className="mt-1 text-sm text-cv-mute">Optional. Without one, we email you a link whenever you sign in.</p>
      {state.done ? <p role="status" className="mt-3 text-sm text-green-700">Password saved.</p> : (
        <form onSubmit={save} className="mt-3 space-y-3">
          <label htmlFor="set-pw" className="sr-only">New password</label>
          <input id="set-pw" type="password" autoComplete="new-password" minLength={8} required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" className={inputClass} />
          {state.error && <p role="alert" className="text-sm text-red-600">{state.error}</p>}
          <button type="submit" disabled={state.busy} aria-busy={state.busy || undefined} className={btn}>{state.busy ? "Saving…" : "Save password"}</button>
        </form>
      )}
    </section>
  );
}

/** Read-only: booking emails always arrive; optional ones can be stopped per business with the same signed link every optional email carries. No new preferences. */
export function NotificationsCard({ links }: { links: { businessName: string; href: string }[] }) {
  return (
    <section aria-labelledby="notif" className="acct-card p-5" data-testid="notifications-card">
      <h3 id="notif" className="flex items-center gap-2 font-display text-lg font-bold text-cv-ink"><BellRing size={18} aria-hidden />Notifications</h3>
      <p className="mt-2 text-sm text-cv-mute">Booking emails (confirmations, changes, receipts) always arrive, so you never miss a booking. Offers and reminders are optional.</p>
      {links.length === 0
        ? <p className="mt-3 text-sm text-cv-mute">Once you have booked, you can unsubscribe from a business&apos;s offers and reminders here.</p>
        : (
          <ul className="mt-3 space-y-2">
            {links.map((l) => (
              <li key={l.href}>
                <a href={l.href} className="text-sm font-semibold text-cv-blue underline underline-offset-2 hover:text-cv-blue-dark">
                  Unsubscribe from offers &amp; reminders{links.length > 1 ? ` · ${l.businessName}` : ""}
                </a>
              </li>
            ))}
          </ul>
        )}
    </section>
  );
}

export function ThisDeviceCard({ children }: { children: React.ReactNode }) {
  return (
    <section aria-labelledby="dev" className="acct-card p-5">
      <h3 id="dev" className="flex items-center gap-2 font-display text-lg font-bold text-cv-ink"><MonitorSmartphone size={18} aria-hidden />This device</h3>
      {children}
    </section>
  );
}
