import Link from "next/link";
import { ArrowRight, Bell, CalendarCheck, CalendarClock, CheckCircle2, Gift, Store, Ticket } from "lucide-react";
import { getCustomerData } from "@/lib/customerData";
import { BookingCard } from "@/components/my/BookingCard";
import { PageHeader } from "@/components/my/PageHeader";
import { VerifyNotice } from "./MyClient";
import { LevelUpCelebration } from "./LevelUpCelebration";
import { ForgetDevice } from "./ForgetDevice";

export const dynamic = "force-dynamic";

const LEVEL_TONE: Record<string, string> = {
  STARTER: "bg-gray-100 text-gray-700", REGULAR: "bg-sky-100 text-sky-800", INSIDER: "bg-violet-100 text-violet-800", PRO: "bg-amber-100 text-amber-800", LEGEND: "bg-rose-100 text-rose-800",
};

const TONE: Record<string, string> = {
  info: "bg-sky-50 text-sky-700", good: "bg-green-50 text-green-700", warn: "bg-amber-50 text-amber-700", muted: "bg-gray-100 text-gray-600",
};

export default async function MyOverviewPage() {
  const data = await getCustomerData();
  if (!data) return null; // the layout already sent guests to sign in

  const first = data.me.name.split(" ")[0];
  if (!data.verified) {
    return (
      <>
        <PageHeader title={`Hi ${first}`} subtitle="One more step before you can see your bookings." />
        <VerifyNotice email={data.me.email} />
      </>
    );
  }

  const { upcoming, stats, updates, waivers, reward, level, referral } = data;
  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "calvy.io";
  const next = upcoming[0];
  const waiverTotal = waivers.length === 0 ? "None" : waivers.length === 1 ? waivers[0].businessName : `${waivers.length} businesses`;

  const cards = [
    { label: "Upcoming", value: String(stats.upcoming), icon: CalendarClock, tone: "bg-sky-50 text-sky-600" },
    { label: "Next appointment", value: next ? next.dateLabel : "None booked", icon: CalendarCheck, tone: "bg-violet-50 text-violet-600" },
    { label: "Visits completed", value: String(stats.completed), icon: CheckCircle2, tone: "bg-green-50 text-green-600" },
    { label: "Rebook without the Rs 10 fee", value: waiverTotal, icon: Ticket, tone: "bg-amber-50 text-amber-600" },
    ...(reward ? [{ label: "Free booking reward", value: reward.available > 0 ? (reward.available === 1 ? "1 free booking ready" : `${reward.available} free bookings ready`) : `${reward.done} of ${reward.of} visits`, icon: Gift, tone: "bg-rose-50 text-rose-600" }] : []),
  ];

  return (
    <>
      <PageHeader title={`Hi ${first}`} subtitle={`Bookings made with ${data.me.email}`} />
      {level?.pendingLevelUp && <LevelUpCelebration level={level.pendingLevelUp.label} feeLabel={`Rs ${level.feeMinor / 100}`} perk={level.perk} />}

      <section aria-label="Summary" className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
        {cards.map((c) => (
          <div key={c.label} className="bg-white rounded-2xl border border-[#e8e6e0] p-4">
            <span className={`h-9 w-9 rounded-xl grid place-items-center ${c.tone}`}><c.icon size={18} aria-hidden /></span>
            <p className="mt-3 text-xs font-medium text-[#6b6b80]">{c.label}</p>
            <p className="mt-0.5 text-lg font-bold font-syne truncate">{c.value}</p>
          </div>
        ))}
      </section>

      <div className="mt-8 grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-8">
          <section aria-labelledby="next">
            <div className="flex items-center justify-between mb-3">
              <h2 id="next" className="font-syne font-bold text-lg">{next ? "Next appointment" : "Upcoming"}</h2>
              {upcoming.length > 1 && <Link href="/account/bookings" className="text-sm font-semibold text-sky-700 hover:underline inline-flex items-center gap-1">All bookings <ArrowRight size={14} aria-hidden /></Link>}
            </div>
            {next ? (
              <ul className="space-y-3">
                <BookingCard b={next} highlight />
                {upcoming.slice(1, 3).map((b) => <BookingCard key={b.id} b={b} />)}
              </ul>
            ) : (
              <div className="bg-white rounded-2xl border border-dashed border-[#d8d5cc] p-8 text-center">
                <p className="font-semibold">Nothing coming up</p>
                <p className="text-sm text-[#6b6b80] mt-1">Book your next visit with any business you have used.</p>
                {data.past[0] && <a href={data.past[0].bookAgainHref} className="inline-flex mt-4 min-h-10 items-center rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-sm font-semibold px-5">Book at {data.past[0].businessName}</a>}
              </div>
            )}
          </section>
        </div>

        <aside aria-labelledby="upd" className="space-y-6">
          <section className="bg-white rounded-2xl border border-[#e8e6e0] p-5">
            <h2 id="upd" className="font-syne font-bold text-lg flex items-center gap-2"><Bell size={17} aria-hidden />Updates</h2>
            {updates.length === 0 ? (
              <p className="text-sm text-[#6b6b80] mt-3">You are all caught up.</p>
            ) : (
              <ul className="mt-4 space-y-4">
                {updates.map((u) => (
                  <li key={u.id} className="flex gap-3">
                    <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${TONE[u.tone].split(" ")[0]} ring-2 ring-offset-1 ring-current ${TONE[u.tone].split(" ")[1]}`} aria-hidden />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold leading-snug">{u.title}</p>
                      <p className="text-xs text-[#6b6b80] mt-0.5">{u.detail}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {level && (
            <section aria-labelledby="level" className="bg-white rounded-2xl border border-[#e8e6e0] p-5">
              <h2 id="level" className="font-syne font-bold text-lg flex items-center gap-2"><Gift size={17} aria-hidden />Your Calvy level</h2>
              <p className="text-sm mt-2 flex items-center gap-2 flex-wrap">
                <span data-testid="level-badge" className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold ${LEVEL_TONE[level.level]}`}>{level.label}</span>
                <span>Confirmation fee: <strong>Rs {level.feeMinor / 100}</strong>{level.feeMinor < level.baseFeeMinor ? ` instead of Rs ${level.baseFeeMinor / 100}` : ""}</span>
              </p>
              <div className="mt-3" role="progressbar" aria-label="Progress to your next level" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(level.progressRatio * 100)}>
                <div className="h-2 rounded-full bg-[#eceae3] overflow-hidden"><div className="h-full rounded-full bg-sky-600" style={{ width: `${Math.round(level.progressRatio * 100)}%` }} /></div>
              </div>
              <p className="text-xs text-[#6b6b80] mt-2">{level.progressText}</p>
              {level.streakMonths > 0 && <p className="text-xs mt-2" data-testid="streak">{level.streakMonths}-month streak: you visited in {level.streakMonths} {level.streakMonths === 1 ? "month" : "months"} in a row.</p>}
              {level.perk && <p className="text-sm mt-3">{level.perk}</p>}
              {level.perk && (level.level === "PRO" || level.level === "LEGEND") && <p className="text-xs text-[#6b6b80] mt-1">{level.perkReady ? "This quarter's free confirmation is ready." : "You have used this quarter's free confirmation."}</p>}
              <p className="text-xs text-[#6b6b80] mt-3">Visits count once the business marks them attended. Moving a booking is always free. The lower fee applies at businesses on the Free plan in India.</p>
              <ForgetDevice />
              {referral && (
                <div className="mt-4 border-t border-[#e8e6e0] pt-3">
                  <p className="text-sm font-semibold">Refer a friend</p>
                  <p className="text-xs text-[#6b6b80] mt-1">When your new friend attends their first visit, you both get a free Rs 10 confirmation (up to 5 a month).</p>
                  <p className="mt-2 text-xs break-all rounded-lg bg-[#f6f5f1] px-3 py-2 select-all">https://{referral.slug}.{rootDomain}/book?cref={referral.code}</p>
                </div>
              )}
            </section>
          )}

          <section className="bg-white rounded-2xl border border-[#e8e6e0] p-5">
            <h2 className="font-syne font-bold text-lg flex items-center gap-2"><Store size={17} aria-hidden />Your businesses</h2>
            <p className="text-sm text-[#6b6b80] mt-1">{stats.businesses} {stats.businesses === 1 ? "business" : "businesses"} so far.</p>
            <Link href="/account/bookings" className="inline-flex items-center gap-1 mt-3 text-sm font-semibold text-sky-700 hover:underline">View all bookings <ArrowRight size={14} aria-hidden /></Link>
          </section>
        </aside>
      </div>
    </>
  );
}
