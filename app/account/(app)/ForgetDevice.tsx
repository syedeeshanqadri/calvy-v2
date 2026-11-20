"use client";
import { useState } from "react";

/** Clears the "remember this device" cookie, so bookings here need a sign-in again for the member price. */
export function ForgetDevice() {
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  async function forget() {
    if (busy) return;
    setBusy(true);
    try { await fetch("/api/customer/device/forget", { method: "POST" }); } catch { /* best effort */ }
    setDone(true);
  }
  return (
    <div>
      <p className="mt-2 text-sm text-cv-mute">After a verified booking this device is remembered for 90 days, so your member price needs no sign-in.</p>
      {done
        ? <p role="status" className="mt-3 text-sm text-green-700">Forgotten on this device.</p>
        : <button type="button" onClick={forget} disabled={busy} aria-busy={busy || undefined} className="mt-3 inline-flex min-h-11 items-center rounded-xl border border-cv-line bg-white px-5 text-sm font-semibold text-cv-ink hover:bg-cv-blue-tint/50">Forget this device</button>}
    </div>
  );
}
