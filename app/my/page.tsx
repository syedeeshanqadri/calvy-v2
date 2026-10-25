import { redirect } from "next/navigation";
import Link from "next/link";
import { getCustomer } from "@/lib/customerSession";
import { overviewForCustomer } from "@/lib/customerDb";
import { bookingForLabel } from "@/lib/patients";
import { formatDateLabel, formatTimeLabel, safeTimeZone } from "@/lib/time";
import { formatCurrencyAmount } from "@/lib/currency";
import { trackingUrl } from "@/lib/tracking";
import { ProfileCard, VerifyNotice } from "./MyClient";

export const dynamic = "force-dynamic";

const STATUS: Record<string, string> = {
  confirmed: "Confirmed", pending: "Pending", pending_payment: "Awaiting payment", completed: "Completed",
  cancelled: "Cancelled", "no-show": "Missed", expired: "Expired",
};

export default async function MyPage() {
  const me = await getCustomer();
  if (!me) redirect("/my/login");

  // Until the email is verified nothing about any booking is read, let alone shown.
  const overview = await overviewForCustomer(me);
  if (!overview) {
    return (
      <Shell>
        <VerifyNotice email={me.email} />
        <ProfileCard name={me.name} email={me.email} />
      </Shell>
    );
  }

  const { upcoming, past, wallets } = overview;
  type Row = (typeof upcoming)[number];
  const card = (a: Row) => {
    const tz = safeTimeZone(a.business.timezone);
    const track = a.tokenNumber ? trackingUrl(a.business.slug, a.id) : null;
    return (
      <li key={a.id} className="bg-white rounded-2xl border border-[#e8e6e0] p-4 space-y-1">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-semibold">{a.business.name}</p>
            <p className="text-sm text-[#6b6b80]">{a.service.name}</p>
          </div>
          <span className="text-xs font-semibold rounded-full bg-[#f0ede8] px-2.5 py-1 whitespace-nowrap">{STATUS[a.status] ?? a.status}</span>
        </div>
        <p className="text-sm">{formatDateLabel(a.date, tz)} · {a.tokenNumber ? `Token #${a.tokenNumber}, about ${formatTimeLabel(a.estimatedAt ?? a.date, tz)}` : formatTimeLabel(a.date, tz)}</p>
        <p className="text-xs text-[#6b6b80]">For {bookingForLabel(a)}</p>
        {track && <Link href={track} className="inline-block text-sm font-semibold text-[#0369a1] hover:underline pt-1">Track your place in line</Link>}
      </li>
    );
  };

  return (
    <Shell>
      <p className="text-[#6b6b80] text-sm -mt-2">Hi {me.name.split(" ")[0]}. Showing bookings made with <strong>{me.email}</strong>.</p>

      <section aria-labelledby="up">
        <h2 id="up" className="font-syne font-bold text-lg mb-3">Upcoming</h2>
        {upcoming.length === 0 ? <p className="text-sm text-[#6b6b80]">No upcoming bookings.</p> : <ul className="space-y-3">{upcoming.map(card)}</ul>}
      </section>

      <section aria-labelledby="wal">
        <h2 id="wal" className="font-syne font-bold text-lg mb-3">Wallet</h2>
        {wallets.length === 0 ? (
          <p className="text-sm text-[#6b6b80]">No wallet balance. If a paid booking is missed or cancelled at a business, what you paid is saved here for your next visit there.</p>
        ) : (
          <ul className="space-y-2">
            {wallets.map((w) => (
              <li key={w.businessId} className="bg-white rounded-2xl border border-[#e8e6e0] p-4 flex items-center justify-between">
                <Link href={`/${w.businessSlug}/book-now`} className="font-medium hover:underline">{w.businessName}</Link>
                <span className="font-bold">{formatCurrencyAmount(w.balanceMinor / 100, w.currency)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="past">
        <h2 id="past" className="font-syne font-bold text-lg mb-3">Past</h2>
        {past.length === 0 ? <p className="text-sm text-[#6b6b80]">Nothing here yet.</p> : <ul className="space-y-3">{past.map(card)}</ul>}
      </section>

      <ProfileCard name={me.name} email={me.email} />
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-dvh bg-[#f8f7f4] px-4 py-8">
      <div className="mx-auto w-full max-w-xl space-y-8">
        <h1 className="font-syne font-bold text-2xl">My bookings</h1>
        {children}
      </div>
    </main>
  );
}
