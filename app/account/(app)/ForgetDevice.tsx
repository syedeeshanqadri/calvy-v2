"use client";
import { useState } from "react";

/** Clears the "remember this device" cookie, so bookings here need a sign-in again for the member price. */
export function ForgetDevice() {
  const [done, setDone] = useState(false);
  async function forget() {
    try { await fetch("/api/customer/device/forget", { method: "POST" }); } catch { /* best effort */ }
    setDone(true);
  }
  return (
    <p className="text-xs text-[#6b6b80] mt-3">
      After a verified booking this device is remembered for 90 days so your member price needs no sign-in.{" "}
      {done ? <span role="status">Forgotten on this device.</span> : <button type="button" onClick={forget} className="underline">Forget this device</button>}
    </p>
  );
}
