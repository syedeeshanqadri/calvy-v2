"use client";
import { useState } from "react";
import Link from "next/link";
import { Flame, Share2, Copy, Check, Stamp } from "lucide-react";
import { REFERRAL_RULE, STREAK_COPY, shareOrCopy, stampDots } from "@/lib/my/levelUi";

export function SectionHeading({ id, title, hint, action }: { id: string; title: string; hint?: string; action?: React.ReactNode }) {
  return (
    <div className="mb-4 flex items-end justify-between gap-3">
      <div className="min-w-0">
        <h2 id={id} className="font-display text-xl font-bold text-cv-ink sm:text-2xl">{title}</h2>
        {hint && <p className="mt-1 text-sm text-cv-mute">{hint}</p>}
      </div>
      {action}
    </div>
  );
}

export function EmptyState({ title, body, cta }: { title: string; body: string; cta?: { href: string; label: string; external?: boolean } }) {
  return (
    <div className="acct-empty px-6 py-9 text-center" data-testid="empty-state">
      <p className="font-display text-lg font-bold text-cv-ink">{title}</p>
      <p className="mx-auto mt-1 max-w-sm text-sm text-cv-mute">{body}</p>
      {cta && (cta.external
        ? <a href={cta.href} className="mt-4 inline-flex min-h-11 items-center rounded-xl bg-cv-blue px-5 text-sm font-semibold text-white hover:bg-cv-blue-dark">{cta.label}</a>
        : <Link href={cta.href} className="mt-4 inline-flex min-h-11 items-center rounded-xl bg-cv-blue px-5 text-sm font-semibold text-white hover:bg-cv-blue-dark">{cta.label}</Link>)}
    </div>
  );
}

/** Seven dots, filled for each attended visit. */
export function StampsCard({ done, of, available, bookHref }: { done: number; of: number; available: number; bookHref: string | null }) {
  const dots = stampDots(done, of);
  return (
    <section aria-labelledby="stamps-title" className="acct-card p-5" data-testid="stamps-card">
      <h3 id="stamps-title" className="flex items-center gap-2 font-display text-lg font-bold text-cv-ink"><Stamp size={18} aria-hidden />Stamps</h3>
      <ol className="mt-4 grid grid-cols-7 gap-1.5" aria-label={`${Math.min(done, of)} of ${of} stamps`}>
        {dots.map((on, i) => (
          <li key={i} style={{ ["--i" as string]: i }} data-filled={on} className={`${on ? "acct-dot-on bg-cv-marigold border-cv-marigold text-cv-ink" : "border-cv-line bg-white text-transparent"} mx-auto grid aspect-square w-full max-w-9 place-items-center rounded-full border-2`}>
            <Check size={16} strokeWidth={3} aria-hidden />
          </li>
        ))}
      </ol>
      <p className="mt-4 text-sm text-cv-mute">
        {available > 0 ? <strong className="text-cv-ink">A free booking is ready for your next visit.</strong> : done > 0 ? `${Math.min(done, of)} of ${of} attended visits toward a free booking.` : "Your first stamp comes after your first attended visit."}
      </p>
      {done === 0 && bookHref && <a href={bookHref} className="mt-3 inline-flex min-h-11 items-center rounded-xl bg-cv-blue px-4 text-sm font-semibold text-white hover:bg-cv-blue-dark">Book a visit</a>}
    </section>
  );
}

export function StreakCard({ months }: { months: number }) {
  return (
    <section aria-labelledby="streak-title" className="acct-card p-5" data-testid="streak-card">
      <h3 id="streak-title" className="flex items-center gap-2 font-display text-lg font-bold text-cv-ink"><Flame size={18} aria-hidden />Streak</h3>
      <p className="mt-3 font-display text-3xl font-bold text-cv-ink">{months > 0 ? `${months} ${months === 1 ? "month" : "months"}` : "None yet"}</p>
      <p className="mt-1 text-sm text-cv-mute">{STREAK_COPY(months)}</p>
    </section>
  );
}

/** The referral code and link: Share with the browser's share sheet, or Copy when there is none. The rules are one line. */
export function ReferralCard({ code, url }: { code: string | null; url: string | null }) {
  const [state, setState] = useState<"idle" | "shared" | "copied" | "failed">("idle");
  async function go() {
    if (!url) return;
    const r = await shareOrCopy(
      { title: "Book with Calvy", text: "Book your visit here and we both get a free booking confirmation.", url },
      { share: typeof navigator !== "undefined" && "share" in navigator ? (d) => navigator.share(d) : undefined, copy: typeof navigator !== "undefined" && navigator.clipboard ? (s) => navigator.clipboard.writeText(s) : undefined },
    );
    if (r === "shared" || r === "copied" || r === "failed") setState(r);
    window.setTimeout(() => setState("idle"), 2500);
  }
  return (
    <section aria-labelledby="ref-title" className="acct-card flex flex-col p-5" data-testid="referral-card">
      <h3 id="ref-title" className="flex items-center gap-2 font-display text-lg font-bold text-cv-ink"><Share2 size={18} aria-hidden />Refer a friend</h3>
      {code && url ? (
        <>
          <p className="mt-3 text-xs font-semibold uppercase tracking-wider text-cv-mute">Your code</p>
          <p data-testid="referral-code" className="mt-1 w-fit rounded-xl bg-cv-marigold/90 px-4 py-2 font-display text-2xl font-bold tracking-widest text-cv-ink">{code}</p>
          <p className="mt-3 break-all rounded-lg bg-cv-blue-tint/60 px-3 py-2 text-xs text-cv-ink select-all">{url}</p>
          <button type="button" onClick={go} aria-live="polite" className="mt-4 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-cv-blue px-5 text-sm font-semibold text-white hover:bg-cv-blue-dark">
            {state === "copied" ? <><Check size={16} aria-hidden />Link copied</> : state === "shared" ? <><Check size={16} aria-hidden />Shared</> : state === "failed" ? "Copy the link above" : <><Share2 size={16} aria-hidden />Share your link</>}
          </button>
        </>
      ) : (
        <p className="mt-3 text-sm text-cv-mute">Your referral link appears after your first booking.</p>
      )}
      <p className="mt-4 text-xs text-cv-mute">{REFERRAL_RULE}</p>
    </section>
  );
}
