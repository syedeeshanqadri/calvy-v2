"use client";
import { useCallback, useEffect, useState } from "react";

/** Stop asking whether the emailed link was opened after this many tries (5 seconds apart: about 10 minutes). */
const MAX_POLLS = 120;

export interface DiscountResult {
  ok: boolean;
  /** The typed code, when it applies. */
  code?: string;
  /** A valid code that was kept because a better automatic offer was applied. */
  codeKept?: boolean;
  /** The automatic offer applied, if any. */
  offer?: { name: string };
  /** Business discount (offer or business coupon) and the new service total, in minor units. */
  discountMinor?: number;
  totalMinor?: number;
  /** What a Calvy fee coupon took off the Rs 10, and what is to be paid online now. */
  feeDiscountMinor?: number;
  payNowMinor?: number;
  /** A member price exists for this email (masked first name only). Shown to a visitor who is not signed in. */
  memberHint?: { maskedName: string };
  /** The customer's Calvy level and its confirmation fee (verified customers only). */
  level?: { id: string; label: string; feeMinor: number };
  error?: string;
}

/**
 * Offers and "Have a code?". The automatic offer (if the business has one) is looked up as soon as the email is known; one typed code
 * per booking may be added. The server answers both; the booking route decides again when you confirm.
 */
export function DiscountBox({ businessSlug, serviceIds, email, phone, date, time, verifiedTicket, googleHref, linkExpired, onChange, formatMoney }: {
  businessSlug: string; serviceIds: string[]; email: string; phone: string; date?: string; time?: string | null; verifiedTicket?: string;
  /** Where "Continue with Google" goes (null when Google sign-in is not set up). */
  googleHref?: string | null; linkExpired?: boolean;
  onChange: (r: DiscountResult | null) => void; formatMoney: (minor: number) => string;
}) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [applied, setApplied] = useState<string | null>(null);
  const [result, setResult] = useState<DiscountResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [linkState, setLinkState] = useState<"idle" | "sending" | "sent" | "skipped">("idle");
  const emailOk = /^\S+@\S+\.\S+$/.test(email);
  const serviceKey = serviceIds.join(",");

  // Ask the server (no state is touched here); the callers below read the answer.
  const request = useCallback(async (code: string | null): Promise<DiscountResult | null> => {
    try {
      const res = await fetch("/api/coupons/preview", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessSlug, serviceIds: serviceKey.split(",").filter(Boolean), email, ...(code ? { code } : {}), ...(date ? { date } : {}), ...(time ? { time } : {}),
          ...(phone ? { phone } : {}), ...(verifiedTicket ? { verifiedTicket } : {}),
        }),
      });
      const d = (await res.json().catch(() => ({}))) as DiscountResult;
      return res.ok ? d : { ok: false, error: d.error };
    } catch { return null; }
  }, [businessSlug, serviceKey, email, phone, verifiedTicket, date, time]);

  const accept = useCallback((d: DiscountResult | null, code: string | null): boolean => {
    if (d?.ok) { setResult(d); onChange(d); return true; }
    if (code) { setError(d?.error ?? "Could not check the code. Please try again."); setOpen(true); setApplied(null); }
    setResult(null); onChange(null);
    return false;
  }, [onChange]);

  // Look again whenever what is booked, the email or the time changes (a typed code is checked again with it).
  useEffect(() => {
    if (!emailOk) return;
    let cancelled = false;
    void request(applied).then((d) => { if (!cancelled) accept(d, applied); });
    return () => { cancelled = true; };
  }, [emailOk, request, accept, applied]);

  // After the sign-in link is emailed, look again every few seconds: when it is opened in this browser the member price appears by itself.
  useEffect(() => {
    if (linkState !== "sent" || !emailOk) return;
    let polls = 0;
    const timer = setInterval(() => {
      polls += 1;
      if (polls > MAX_POLLS) { setLinkState("skipped"); return; }
      void request(applied).then((d) => { accept(d, applied); if (d?.ok && !d.memberHint) setLinkState("idle"); });
    }, 5000);
    return () => clearInterval(timer);
  }, [linkState, emailOk, request, accept, applied]);

  async function sendLink() {
    setLinkState("sending");
    try {
      await fetch("/api/customer/member-link", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, businessSlug, ...(serviceIds[0] ? { serviceId: serviceIds[0] } : {}) }) });
      setLinkState("sent");
    } catch { setLinkState("idle"); }
  }

  async function apply() {
    if (!input.trim()) return;
    setBusy(true); setError("");
    const ok = accept(await request(input.trim()), input.trim());
    if (ok) setApplied(input.trim());
    setBusy(false);
  }

  const showMemberPrompt = !!result?.memberHint && linkState !== "skipped";
  const googleLink = googleHref ? `${googleHref}${googleHref.includes("?") ? "&" : "?"}service=${encodeURIComponent(serviceIds[0] ?? "")}` : null;
  return (
    <div style={{ marginTop: 12 }}>
      {linkExpired && <p className="bk-note" role="status">That sign-in link was already used or has expired. You can ask for a new one below.</p>}
      {showMemberPrompt && (
        <div className="bk-note" role="region" aria-label="Member price" data-testid="member-prompt">
          <p style={{ margin: 0 }}><strong>Member price available.</strong> Are you {result?.memberHint?.maskedName}? Sign in to pay your member price.</p>
          {linkState === "sent" ? (
            <p style={{ margin: "8px 0 0" }} role="status">We emailed you a link. Open it, and this page updates by itself. <button type="button" onClick={() => setLinkState("skipped")} style={{ background: "none", border: 0, cursor: "pointer", font: "inherit", textDecoration: "underline" }}>Skip and pay the standard fee</button></p>
          ) : (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
              <button type="button" className="bk-btn" style={{ minHeight: 44 }} disabled={linkState === "sending"} onClick={sendLink}>{linkState === "sending" ? "Sending…" : "Email me a sign-in link"}</button>
              {googleLink && <a className="bk-btn" style={{ minHeight: 44, display: "inline-flex", alignItems: "center" }} href={googleLink}>Continue with Google</a>}
              <button type="button" onClick={() => setLinkState("skipped")} style={{ background: "none", border: 0, cursor: "pointer", font: "inherit", textDecoration: "underline" }}>No thanks, pay the standard fee</button>
            </div>
          )}
        </div>
      )}
      {result?.level && <p className="bk-note" role="status" data-testid="level-badge"><span style={{ fontWeight: 700 }}>{result.level.label}</span> level: your confirmation fee is {formatMoney(result.level.feeMinor)}.</p>}
      {result?.offer && <p className="bk-note" role="status">Offer applied: <strong>{result.offer.name}</strong>{result.discountMinor ? ` (−${formatMoney(result.discountMinor)})` : ""}</p>}
      {applied && result?.code ? (
        <p className="bk-note" role="status" style={{ marginTop: 8 }}>
          Code <strong>{result.code}</strong> applied.{" "}
          <button type="button" className="st-muted" style={{ textDecoration: "underline", background: "none", border: 0, cursor: "pointer", font: "inherit" }} onClick={() => { setApplied(null); setInput(""); setError(""); }}>Remove</button>
        </p>
      ) : (
        <>
          {applied && result?.codeKept && <p className="bk-note" role="status" style={{ marginTop: 8 }}>Your code is kept for later: a better offer was applied to this booking.</p>}
          {!open ? (
            <p style={{ marginTop: 8 }}><button type="button" onClick={() => setOpen(true)} style={{ background: "none", border: 0, cursor: "pointer", font: "inherit", textDecoration: "underline" }}>Have a code?</button></p>
          ) : (
            <div style={{ marginTop: 8 }}>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <input value={input} onChange={(e) => setInput(e.target.value)} maxLength={40} placeholder="Code" aria-label="Discount code" style={{ minHeight: 44, padding: "0 12px", textTransform: "uppercase", borderRadius: 10, border: "1px solid var(--bk-line, #ddd)" }} />
                <button type="button" disabled={busy || !input.trim() || !emailOk} onClick={apply} className="bk-btn" style={{ minHeight: 44 }}>{busy ? "Checking…" : "Apply"}</button>
              </div>
              {!emailOk && <p className="st-muted" style={{ fontSize: "0.8125rem", marginTop: 6 }}>Enter your email first, so the code can be checked for you.</p>}
              {error && <p role="alert" style={{ color: "#b42318", fontSize: "0.875rem", marginTop: 6 }}>{error}</p>}
            </div>
          )}
        </>
      )}
    </div>
  );
}
