"use client";
import { useState } from "react";

export interface DiscountResult { ok: boolean; code?: string; discountMinor?: number; payNowMinor?: number; error?: string }

/** "Have a code?": one discount code per booking. Asks the server what it would do; the booking route decides again when you confirm. */
export function DiscountBox({ businessSlug, serviceIds, email, phone, verifiedTicket, applied, onChange }: {
  businessSlug: string; serviceIds: string[]; email: string; phone: string; verifiedTicket?: string;
  applied: DiscountResult | null; onChange: (r: DiscountResult | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function apply() {
    if (!code.trim()) return;
    setBusy(true); setError("");
    try {
      const res = await fetch("/api/coupons/preview", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessSlug, serviceIds, code: code.trim(), email, ...(phone ? { phone } : {}), ...(verifiedTicket ? { verifiedTicket } : {}) }),
      });
      const d = (await res.json().catch(() => ({}))) as DiscountResult & { error?: string };
      if (res.ok && d.ok) { onChange(d); return; }
      onChange(null);
      setError(d.error ?? "This code is not valid.");
    } catch { setError("Could not check the code. Please try again."); } finally { setBusy(false); }
  }

  if (applied?.ok) {
    return (
      <p className="bk-note" role="status" style={{ marginTop: 12 }}>
        Code <strong>{applied.code}</strong> applied.{" "}
        <button type="button" className="st-muted" style={{ textDecoration: "underline", background: "none", border: 0, cursor: "pointer", font: "inherit" }} onClick={() => { onChange(null); setCode(""); }}>Remove</button>
      </p>
    );
  }
  if (!open) {
    return <p style={{ marginTop: 12 }}><button type="button" onClick={() => setOpen(true)} style={{ background: "none", border: 0, cursor: "pointer", font: "inherit", textDecoration: "underline" }}>Have a code?</button></p>;
  }
  const emailOk = /^\S+@\S+\.\S+$/.test(email);
  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input value={code} onChange={(e) => setCode(e.target.value)} maxLength={40} placeholder="Code" aria-label="Discount code" style={{ minHeight: 44, padding: "0 12px", textTransform: "uppercase", borderRadius: 10, border: "1px solid var(--bk-line, #ddd)" }} />
        <button type="button" disabled={busy || !code.trim() || !emailOk} onClick={apply} className="bk-btn" style={{ minHeight: 44 }}>{busy ? "Checking…" : "Apply"}</button>
      </div>
      {!emailOk && <p className="st-muted" style={{ fontSize: "0.8125rem", marginTop: 6 }}>Enter your email first, so the code can be checked for you.</p>}
      {error && <p role="alert" style={{ color: "#b42318", fontSize: "0.875rem", marginTop: 6 }}>{error}</p>}
    </div>
  );
}
