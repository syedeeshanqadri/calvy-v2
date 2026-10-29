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
    <section aria-labelledby="prof" className="bg-white rounded-2xl border border-[#e8e6e0] p-5 space-y-4">
      <h2 id="prof" className="font-syne font-bold text-lg">Profile</h2>
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
          <button type="button" onClick={() => signOut({ callbackUrl: "/my/login" })} className={btn}>Sign out</button>
        </div>
      </form>
    </section>
  );
}
