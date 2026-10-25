"use client";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Check, Clock, Loader2, X } from "lucide-react";
import { confirmMyBooking, type MyBooking } from "@/lib/bookAgain";
import { AnotherBooking } from "@/components/booking/AnotherBooking";

type View = "pending" | "confirmed" | "failed" | "expired" | "refunded";
interface Booking {
  businessName: string; businessSlug: string; serviceName: string; staffName: string | null;
  date: string; time: string; token: { number: number; sessionName: string; trackUrl: string | null } | null;
}

const POLL_MS = 3000;
const MAX_POLLS = 40; // ~2 minutes, then ask the customer to check their email

function ReturnInner() {
  const orderId = useSearchParams()?.get("order_id") ?? "";
  const [state, setState] = useState<{ view: View; booking: Booking } | null>(null);
  const [error, setError] = useState("");
  const [polls, setPolls] = useState(0);
  // What this browser kept about the booking (who it is for, what was booked), once the payment is confirmed.
  const [mine, setMine] = useState<MyBooking | null>(null);

  useEffect(() => {
    if (!orderId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    let n = 0;
    const tick = async () => {
      try {
        const res = await fetch(`/api/payments/status?order_id=${encodeURIComponent(orderId)}`);
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) { setError(data.error ?? "We couldn't find this booking."); return; }
        setState(data);
        if (data.view === "confirmed") setMine(confirmMyBooking(data.booking.businessSlug, orderId));
        n += 1;
        setPolls(n);
        if (data.view === "pending" && n < MAX_POLLS) timer = setTimeout(tick, POLL_MS);
      } catch {
        if (!cancelled) timer = setTimeout(tick, POLL_MS);
      }
    };
    tick();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [orderId]);

  const b = state?.booking;
  const view = state?.view;
  const stillWaiting = view === "pending" && polls >= MAX_POLLS;

  return (
    <div className="min-h-screen bg-[#f8f7f4] flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl p-8 sm:p-10 max-w-md w-full text-center shadow-xl border border-[#e8e6e0]" aria-live="polite">
        {!orderId || error ? (
          <>
            <Icon tone="red"><X size={28} /></Icon>
            <h1 className="font-syne font-bold text-2xl mb-2">Booking not found</h1>
            <p className="text-[#6b6b80]">{error || "This link is missing its order number."}</p>
          </>
        ) : !state || (view === "pending" && !stillWaiting) ? (
          <>
            <Icon tone="amber"><Loader2 size={28} className="animate-spin" /></Icon>
            <h1 className="font-syne font-bold text-2xl mb-2">Confirming your payment…</h1>
            <p className="text-[#6b6b80]">This usually takes a few seconds. Please keep this page open.</p>
          </>
        ) : view === "confirmed" ? (
          <>
            <Icon tone="green"><Check size={28} /></Icon>
            <h1 className="font-syne font-bold text-2xl mb-2">You&apos;re booked!</h1>
            <p className="text-[#6b6b80] mb-6">Payment received. A confirmation has been sent to your email.</p>
            {b && (
              <div className="bg-[#f8f7f4] rounded-2xl p-5 text-left space-y-2.5 text-sm">
                <Row label="Business" value={b.businessName} />
                {mine && <Row label="For" value={mine.patient} />}
                <Row label="Service" value={b.serviceName} />
                {b.staffName && <Row label="With" value={b.staffName} />}
                <Row label="Date" value={b.date} />
                {b.token ? (
                  <>
                    <Row label="Token" value={`#${b.token.number}`} strong />
                    <Row label="Estimated time" value={b.time} />
                    <Row label="Session" value={b.token.sessionName} />
                    {b.token.trackUrl && (
                      <a href={b.token.trackUrl} className="block text-center bg-[#0f0f1a] text-white font-semibold rounded-xl px-4 py-3 mt-2">Track your place in line</a>
                    )}
                  </>
                ) : (
                  <Row label="Time" value={b.time} />
                )}
              </div>
            )}
            {b && (
              <div className="mt-5 text-left">
                {mine?.serviceIds?.length ? (
                  <AnotherBooking slug={b.businessSlug} bookPath={`/${b.businessSlug}/book-now`} serviceIds={mine.serviceIds} staffId={mine.staffId ?? null} date={mine.date} appointmentWord="appointment" />
                ) : (
                  <Link href={`/${b.businessSlug}/book-now`} className="block rounded-xl border border-[#e8e6e0] px-4 py-3 text-sm font-medium text-center hover:bg-[#f8f7f4]">Book another appointment</Link>
                )}
              </div>
            )}
          </>
        ) : stillWaiting ? (
          <>
            <Icon tone="amber"><Clock size={28} /></Icon>
            <h1 className="font-syne font-bold text-2xl mb-2">Still waiting for the payment</h1>
            <p className="text-[#6b6b80]">If you paid, you will get a confirmation email shortly. If the payment does not go through, any amount taken is refunded automatically.</p>
          </>
        ) : (
          <>
            <Icon tone="red"><X size={28} /></Icon>
            <h1 className="font-syne font-bold text-2xl mb-2">
              {view === "refunded" ? "Payment refunded" : view === "expired" ? "Booking time ran out" : "Payment didn't go through"}
            </h1>
            <p className="text-[#6b6b80] mb-6">
              {view === "refunded"
                ? "Your booking time ran out before the payment completed, so the full amount is being refunded to you."
                : view === "expired"
                  ? "The slot was held for a short time and has been released. Please book again."
                  : "No booking was made. You can try again."}
            </p>
            {b && <a href={`/${b.businessSlug}/book-now`} className="inline-block bg-[#0f0f1a] text-white font-semibold px-6 py-3 rounded-xl text-sm">Book again</a>}
          </>
        )}
      </div>
    </div>
  );
}

function Icon({ tone, children }: { tone: "green" | "amber" | "red"; children: React.ReactNode }) {
  const cls = { green: "bg-green-50 text-green-600", amber: "bg-amber-50 text-amber-600", red: "bg-red-50 text-red-600" }[tone];
  return <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6 ${cls}`}>{children}</div>;
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-[#6b6b80]">{label}</span>
      <span className={strong ? "font-bold text-lg" : "font-medium text-right"}>{value}</span>
    </div>
  );
}

export default function BookingReturnPage() {
  return (
    <Suspense fallback={null}>
      <ReturnInner />
    </Suspense>
  );
}
