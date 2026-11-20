"use client";
import { useState } from "react";
import { signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { inputClass } from "@/components/auth/AuthShell";
import PasswordInput from "@/components/auth/PasswordInput";
import { postAuth } from "@/components/auth/authApi";

const btn = "min-h-11 inline-flex items-center justify-center rounded-xl px-5 text-sm font-semibold border border-[#e8e6e0] bg-white hover:bg-[#f8f7f4] disabled:opacity-60";

export function VerifyNotice({ email }: { email: string }) {
  const [msg, setMsg] = useState("");
  async function resend() {
    const r = await postAuth("/api/customer/resend-verification", { email });
    setMsg(r.ok ? "If a new link was due, it is on its way. Check your inbox." : r.message);
  }
  return (
    <section role="status" className="rounded-2xl border border-amber-300 bg-amber-50 p-5 space-y-3">
      <h2 className="font-syne font-bold text-lg">Verify your email to see your bookings</h2>
      <p className="text-sm text-amber-900">We sent a link to <strong>{email}</strong>. Your bookings are shown only once this address is verified, so nobody can see them by typing in your email.</p>
      <button type="button" onClick={resend} className={btn}>Send a new link</button>
      {msg && <p className="text-sm">{msg}</p>}
    </section>
  );
}

export function ProfileCard({ name, email }: { name: string; email: string }) {
  const router = useRouter();
  const [newName, setNewName] = useState(name);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setMsg(""); setError(""); setBusy(true);
    try {
      const res = await fetch("/api/customer/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim() || undefined, ...(next ? { currentPassword: current, newPassword: next } : {}) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error ?? "Could not save."); return; }
      setMsg("Saved."); setCurrent(""); setNext("");
      router.refresh();
    } catch {
      setError("We could not reach the server. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="prof" className="acct-card p-5 space-y-4">
      <h3 id="prof" className="font-display text-lg font-bold text-cv-ink">Profile</h3>
      <form onSubmit={save} className="space-y-4">
        <div>
          <label htmlFor="p-email" className="text-sm font-medium block mb-1.5">Email</label>
          <input id="p-email" value={email} readOnly className={`${inputClass} bg-[#f8f7f4]`} />
        </div>
        <div>
          <label htmlFor="p-name" className="text-sm font-medium block mb-1.5">Name</label>
          <input id="p-name" value={newName} maxLength={120} onChange={e => setNewName(e.target.value)} className={inputClass} />
        </div>
        <details>
          <summary className="text-sm font-medium cursor-pointer">Change password</summary>
          <div className="space-y-3 pt-3">
            <PasswordInput id="p-current" label="Current password" value={current} onChange={setCurrent} autoComplete="current-password" required={false} />
            <PasswordInput id="p-new" label="New password" value={next} onChange={setNext} autoComplete="new-password" required={false} minLength={8} hint="At least 8 characters." />
          </div>
        </details>
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        {msg && <p role="status" className="text-sm text-green-700">{msg}</p>}
        <div className="flex flex-wrap gap-3">
          <button type="submit" disabled={busy} className={btn}>{busy ? "Saving…" : "Save"}</button>
          <button type="button" onClick={() => signOut({ callbackUrl: "/account/login" })} className={btn}>Sign out</button>
        </div>
      </form>
    </section>
  );
}

export function DeleteAccountCard({ email, pendingUntil }: { email: string; pendingUntil: string | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [blocking, setBlocking] = useState<{ businessName: string; date: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [until, setUntil] = useState<string | null>(pendingUntil);
  const label = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" });

  async function request(e: React.FormEvent) {
    e.preventDefault();
    setError(""); setBlocking([]); setBusy(true);
    try {
      const res = await fetch("/api/customer/deletion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmEmail: confirm, ...(password ? { password } : {}) }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 409 && data.code === "UPCOMING_BOOKINGS") { setError(data.error); setBlocking(data.bookings ?? []); return; }
      if (!res.ok) { setError(data.error ?? "Could not send the request."); return; }
      setUntil(data.executeAfter ?? null); setOpen(false); router.refresh();
    } catch {
      setError("We could not reach the server. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    setBusy(true);
    try {
      await fetch("/api/customer/deletion", { method: "DELETE" });
      setUntil(null); router.refresh();
    } finally { setBusy(false); }
  }

  return (
    <section aria-labelledby="del" className="acct-card p-5">
      <h3 id="del" className="font-display text-lg font-bold text-cv-ink">Request account deletion</h3>
      {until ? (
        <>
          <p className="text-sm mt-1" role="status">Deletion requested. Your account will be deleted on <strong>{label(until)}</strong>. Until then nothing changes, and we emailed you a link to cancel.</p>
          <button type="button" onClick={cancel} disabled={busy} className="mt-4 min-h-11 px-4 rounded-xl border border-[#e8e6e0] text-sm font-semibold hover:bg-[#f8f7f4] disabled:opacity-60">{busy ? "Cancelling…" : "Cancel the request"}</button>
        </>
      ) : (
        <>
          <p className="text-sm text-[#6b6b80] mt-1">We delete your account 30 days after you ask, and you can cancel any time until then. After that your name, email, phone number and login are removed. Businesses keep their own booking records without your details. You can only ask when you have no upcoming bookings.</p>
          {!open ? (
            <button type="button" onClick={() => setOpen(true)} className="mt-4 min-h-11 px-4 rounded-xl border border-red-200 text-red-700 text-sm font-semibold hover:bg-red-50">Request deletion</button>
          ) : (
            <form onSubmit={request} className="mt-4 space-y-3">
              <div>
                <label htmlFor="del-email" className="text-sm font-medium block mb-1.5">Type your email ({email}) to confirm</label>
                <input id="del-email" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" className={inputClass} />
              </div>
              <PasswordInput id="del-password" label="Password (if you have one)" value={password} onChange={setPassword} autoComplete="current-password" required={false} />
              {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
              {blocking.length > 0 && (
                <ul className="text-sm list-disc pl-5">{blocking.map((b, i) => <li key={i}>{b.businessName}, {label(b.date)}</li>)}</ul>
              )}
              <div className="flex gap-2">
                <button type="submit" disabled={busy || !confirm} className="min-h-11 px-4 rounded-xl bg-red-600 text-white text-sm font-semibold disabled:opacity-60">{busy ? "Sending…" : "Request deletion"}</button>
                <button type="button" onClick={() => { setOpen(false); setError(""); setBlocking([]); }} className="min-h-11 px-4 rounded-xl border border-[#e8e6e0] text-sm font-semibold">Close</button>
              </div>
            </form>
          )}
        </>
      )}
    </section>
  );
}
