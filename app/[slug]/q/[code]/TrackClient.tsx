"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, Clock, Video, X } from "lucide-react";
import { BrandMark } from "@/components/site/Brand";
import { safeThemeColor, readableForeground, themeVars } from "@/lib/theme";
import { t } from "@/lib/terms";
import { formatCurrencyAmount } from "@/lib/currency";
import type { TrackingPage } from "@/lib/trackingDb";

const POLL_MS = 15_000;

/** Public live-queue page. Polls every 15 seconds; shows only this customer's own place. */
export function TrackClient({ code, initial }: { code: string; initial: TrackingPage }) {
  const [page, setPage] = useState<TrackingPage>(initial);
  const [updatedAt, setUpdatedAt] = useState(() => new Date());
  const [problem, setProblem] = useState("");

  useEffect(() => {
    let stopped = false;
    const id = setInterval(async () => {
      try {
        const res = await fetch(`/api/track/${encodeURIComponent(code)}`, { cache: "no-store" });
        if (stopped) return;
        if (res.status === 404) { setProblem("This link is no longer valid."); return; }
        if (!res.ok) { setProblem("Could not refresh. Trying again…"); return; }
        setPage(await res.json());
        setUpdatedAt(new Date());
        setProblem("");
      } catch {
        if (!stopped) setProblem("Could not refresh. Trying again…");
      }
    }, POLL_MS);
    return () => { stopped = true; clearInterval(id); };
  }, [code]);

  const { business, session, staffName, view } = page;
  const color = safeThemeColor(business.primaryColor);
  const fg = readableForeground(color);
  const appt = t(business, "appointment");
  const staffWord = t(business, "staff");
  const where = staffName ?? `your ${staffWord}`;

  return (
    <main className="min-h-screen bg-[#f8f7f4]" style={themeVars(color) as React.CSSProperties}>
      <header style={{ background: color, color: fg }}>
        <div className="max-w-md mx-auto px-4 py-5 flex items-center gap-3">
          <span className="w-11 h-11 rounded-xl bg-white/90 p-1 inline-flex shrink-0">
            <BrandMark name={business.name} logoUrl={business.logoUrl} color={color} fg={fg} size={36} />
          </span>
          <div className="min-w-0">
            <h1 className="font-syne font-bold text-lg truncate">{business.name}</h1>
            <p className="text-xs opacity-80">{session.name} · {session.dateLabel} · {session.startTime}–{session.endTime}</p>
          </div>
        </div>
      </header>

      <div className="max-w-md mx-auto px-4 py-6 space-y-4" aria-live="polite">
        {view.carriedFromEarlier && view.state !== "moved" && (
          <p className="text-xs font-medium text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
            Moved from an earlier day. This is your {appt} now.
          </p>
        )}

        {page.online && ["waiting", "serving"].includes(view.state) && (
          <div className="bg-white rounded-2xl border border-[#e8e6e0] p-4">
            <p className="font-semibold flex items-center gap-2"><Video size={16} aria-hidden />Online consultation</p>
            {page.online.meetingUrl ? (
              <>
                <p className="text-sm text-[#6b6b80] mt-1 mb-3">Join from this link when it is your turn.</p>
                <a href={page.online.meetingUrl} target="_blank" rel="noopener noreferrer" className="block text-center rounded-xl py-3 font-semibold" style={{ background: color, color: fg }}>Join the consultation</a>
              </>
            ) : (
              <p className="text-sm text-[#6b6b80] mt-1">{business.name} will share the joining link with you before your turn.</p>
            )}
          </div>
        )}

        {view.state === "waiting" && (
          <>
            <Card>
              <Label>Now serving</Label>
              <Big>{view.nowServing !== null ? `#${view.nowServing}` : "Not started"}</Big>
            </Card>
            <Card accent={color}>
              <Label>You are</Label>
              <Big>#{view.yourToken}</Big>
              <p className="mt-2 text-[#374151]">
                {view.ahead === 0 ? "You are next." : `${view.ahead} ${view.ahead === 1 ? "person" : "people"} ahead of you.`}
              </p>
              {view.etaMinutes !== null && (
                <p className="mt-1 text-[#374151]">
                  <Clock size={14} className="inline -mt-0.5 mr-1" />
                  {view.etaMinutes <= 1 ? "Any moment now" : `About ${view.etaMinutes} min`}{view.etaTime ? ` · around ${view.etaTime}` : ""}
                </p>
              )}
            </Card>
            {view.movedBack && (
              <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                You were not here when your number was called, so you were moved back (missed {view.missedCalls} of 4 calls). Please stay close. After the fourth missed call this {appt} is closed and what you paid is saved in your wallet.
              </p>
            )}
          </>
        )}

        {view.state === "serving" && (
          <Card accent={color}>
            <Label>It is your turn</Label>
            <Big>#{view.yourToken}</Big>
            <p className="mt-2 text-[#374151]">Please go to {where} now.</p>
          </Card>
        )}

        {view.state === "done" && (
          <Final tone="green" icon={<Check size={26} />} title={`Your ${appt} is complete`}>
            Thank you for visiting {business.name}.
          </Final>
        )}

        {view.state === "no_show" && (
          <Final tone="red" icon={<X size={26} />} title={`You missed your ${appt}`}>
            Your number was called four times and you were not here, so token #{view.yourToken} was closed.
            <WalletNote page={page} appt={appt} color={color} fg={fg} />
          </Final>
        )}

        {view.state === "moved" && (
          <Final tone="amber" icon={<Clock size={26} />} title="Moved to the next working day">
            {view.movedTo
              ? <>Token #{view.yourToken} was moved to <strong>{view.movedTo.dateLabel}</strong> as token <strong>#{view.movedTo.token}</strong>. A token can be moved only once.
                  <a href={`/${business.slug}/q/${view.movedTo.code}`} className="mt-4 block text-center font-semibold rounded-xl px-4 py-3" style={{ background: color, color: fg }}>
                    Track your new token
                  </a></>
              : <>Token #{view.yourToken} was moved to the next working day.</>}
          </Final>
        )}

        {view.state === "cancelled" && (
          <Final tone="red" icon={<X size={26} />} title={`This ${appt} was cancelled`}>
            <WalletNote page={page} appt={appt} color={color} fg={fg} />
          </Final>
        )}
        {view.state === "pending_payment" && <Final tone="amber" icon={<Clock size={26} />} title="Waiting for your payment">Your place is held for a short time while the payment completes.</Final>}
        {view.state === "expired" && <Final tone="red" icon={<X size={26} />} title="This booking expired">The payment was not completed in time, so the place was released.</Final>}

        <p className="text-center text-xs text-[#6b6b80]">
          {problem || `Updates automatically every 15 seconds · last updated ${updatedAt.toLocaleTimeString()}`}
        </p>
      </div>
    </main>
  );
}

/** What happens to the money after a missed or cancelled booking, and where to book again. */
function WalletNote({ page, appt, color, fg }: { page: TrackingPage; appt: string; color: string; fg: string }) {
  const { credit, business } = page;
  return (
    <div className="mt-3 space-y-3">
      {credit ? (
        <p>
          <strong>{formatCurrencyAmount(credit.amountMinor / 100, credit.currency)}</strong> you paid is saved in your wallet at {business.name}. It does not expire and works for a new {appt} on any date.
        </p>
      ) : (
        <p>You can book again on any date.</p>
      )}
      <Link href="/my" className="block text-center font-semibold rounded-xl px-4 py-3" style={{ background: color, color: fg }}>
        {credit ? "Sign in and book another date" : "Book another date"}
      </Link>
    </div>
  );
}

function Card({ children, accent }: { children: React.ReactNode; accent?: string }) {
  return (
    <section className="bg-white rounded-2xl border border-[#e8e6e0] p-5 text-center" style={accent ? { borderColor: accent, borderWidth: 2 } : undefined}>
      {children}
    </section>
  );
}
const Label = ({ children }: { children: React.ReactNode }) => <p className="text-xs font-bold tracking-wider uppercase text-[#6b6b80]">{children}</p>;
const Big = ({ children }: { children: React.ReactNode }) => <p className="font-syne font-bold text-6xl tabular-nums leading-tight">{children}</p>;

function Final({ tone, icon, title, children }: { tone: "green" | "amber" | "red"; icon: React.ReactNode; title: string; children: React.ReactNode }) {
  const cls = { green: "bg-green-50 text-green-600", amber: "bg-amber-50 text-amber-600", red: "bg-red-50 text-red-600" }[tone];
  return (
    <section className="bg-white rounded-2xl border border-[#e8e6e0] p-6 text-center">
      <div className={`w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4 ${cls}`}>{icon}</div>
      <h2 className="font-syne font-bold text-xl mb-2">{title}</h2>
      <div className="text-sm text-[#374151]">{children}</div>
    </section>
  );
}
