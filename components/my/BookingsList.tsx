"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { CalendarX } from "lucide-react";
import { BookingCard } from "@/components/my/BookingCard";
import { cn } from "@/lib/utils";
import type { BookingView } from "@/lib/customerData";

type Tab = "upcoming" | "past" | "cancelled";

/** Bookings with Upcoming / Past / Cancelled tabs and a business filter. */
export function BookingsList({ upcoming, past }: { upcoming: BookingView[]; past: BookingView[] }) {
  const [tab, setTab] = useState<Tab>("upcoming");
  const [business, setBusiness] = useState("");

  const groups = useMemo(() => ({
    upcoming,
    past: past.filter((b) => !["cancelled", "expired"].includes(b.status)),
    cancelled: past.filter((b) => ["cancelled", "expired"].includes(b.status)),
  }), [upcoming, past]);

  const businesses = useMemo(() => {
    const m = new Map<string, string>();
    for (const b of [...upcoming, ...past]) m.set(b.businessSlug, b.businessName);
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [upcoming, past]);

  const rows = groups[tab].filter((b) => !business || b.businessSlug === business);
  const TABS: { id: Tab; label: string }[] = [
    { id: "upcoming", label: "Upcoming" }, { id: "past", label: "Past" }, { id: "cancelled", label: "Cancelled" },
  ];

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div role="tablist" aria-label="Booking status" className="inline-flex rounded-xl bg-white border border-[#e8e6e0] p-1">
          {TABS.map((t) => (
            <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}
              className={cn("min-h-9 px-4 rounded-lg text-sm font-semibold transition-colors", tab === t.id ? "bg-sky-600 text-white" : "text-[#6b6b80] hover:text-[#0f0f1a]")}>
              {t.label} <span className={cn("ml-1 text-xs", tab === t.id ? "text-sky-100" : "text-[#b0b0c0]")}>{groups[t.id].length}</span>
            </button>
          ))}
        </div>
        {businesses.length > 1 && (
          <div>
            <label htmlFor="biz-filter" className="sr-only">Business</label>
            <select id="biz-filter" value={business} onChange={(e) => setBusiness(e.target.value)}
              className="min-h-10 rounded-xl border border-[#e8e6e0] bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-sky-200">
              <option value="">All businesses</option>
              {businesses.map(([slug, name]) => <option key={slug} value={slug}>{name}</option>)}
            </select>
          </div>
        )}
      </div>

      {rows.length === 0 ? (
        <div className="bg-white rounded-2xl border border-[#e8e6e0] py-14 text-center text-[#6b6b80]">
          <CalendarX size={30} className="mx-auto mb-3 opacity-40" aria-hidden />
          <p className="text-sm">{tab === "upcoming" ? "No upcoming bookings." : tab === "past" ? "No past visits yet." : "Nothing cancelled."}</p>
          {tab === "upcoming" && businesses[0] && <Link href={`/${businesses[0][0]}/book-now`} className="inline-block mt-3 text-sm font-semibold text-sky-700 hover:underline">Book at {businesses[0][1]}</Link>}
        </div>
      ) : (
        <ul className="space-y-3">{rows.map((b) => <BookingCard key={b.id} b={b} />)}</ul>
      )}
    </div>
  );
}
