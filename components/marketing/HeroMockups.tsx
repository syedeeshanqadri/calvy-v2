"use client";
// The hero's product mockups, rebuilt from the original hero (the auto-playing dashboard window, the tilted Client view and Owner
// app phones, and the two floating cards) in the marketing design system: solid brand blue, hairline borders, layered shadows,
// no emoji, no gradients, no rainbow colours. All of it is illustrative sample content, and it follows the visitor's region
// (INR and Indian names for India, USD and international names otherwise).
import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Bell, Check, ChevronLeft, ChevronRight, LayoutDashboard, TrendingUp } from "lucide-react";
import { useRegion } from "@/components/landing/useRegion";

interface Sample {
  business: string; owner: string; date: string; dateShort: string;
  stats: { bookings: string; revenue: string; show: string };
  appts: { name: string; time: string; svc: string; status: "confirmed" | "pending" }[];
  cal: { month: string; week: string; blocks: { day: number; top: number; h: number; label: string; tone: 0 | 1 | 2 }[] };
  invoice: { no: string; date: string; billed: string; email: string; items: { svc: string; price: string }[]; total: string };
  analytics: { revenue: string; expenses: string; profit: string; top: string; lifetime: string };
  services: { n: string; d: string; p: string }[];
  toast: { revenue: string; who: string };
}

const SAMPLE: Record<"IN" | "INTL", Sample> = {
  IN: {
    business: "Sharma Family Clinic", owner: "Anita", date: "Thursday, April 24", dateShort: "Thursday, Apr 24",
    stats: { bookings: "8", revenue: "₹5,200", show: "94%" },
    appts: [
      { name: "Priya N.", time: "10:00 AM", svc: "General Consultation", status: "confirmed" },
      { name: "Mohammed I.", time: "11:30 AM", svc: "Follow-up Visit", status: "confirmed" },
      { name: "Kavita J.", time: "1:00 PM", svc: "Child Health Check", status: "pending" },
      { name: "Suresh R.", time: "3:30 PM", svc: "General Consultation", status: "confirmed" },
    ],
    cal: { month: "April 2026", week: "Week of 21–26", blocks: [
      { day: 0, top: 8, h: 14, label: "Priya N.", tone: 0 }, { day: 0, top: 30, h: 10, label: "Walk-in", tone: 1 }, { day: 1, top: 18, h: 18, label: "Mohammed I.", tone: 1 },
      { day: 2, top: 6, h: 12, label: "Kavita J.", tone: 2 }, { day: 2, top: 44, h: 14, label: "Child check", tone: 0 }, { day: 3, top: 24, h: 16, label: "Suresh R.", tone: 1 },
      { day: 4, top: 12, h: 12, label: "Neha G.", tone: 0 }, { day: 5, top: 30, h: 16, label: "Consult", tone: 1 } ] },
    invoice: { no: "#INV-2026-0481 · Apr 24, 2026", date: "", billed: "Priya Nair", email: "hello@sharmaclinic.in", items: [{ svc: "General Consultation", price: "₹500" }, { svc: "Follow-up Visit", price: "₹300" }, { svc: "Child Health Check", price: "₹600" }], total: "₹1,400" },
    analytics: { revenue: "₹84,200", expenses: "₹21,800", profit: "₹62,400", top: "Priya N.", lifetime: "₹12,400 lifetime" },
    services: [{ n: "General Consultation", d: "15 min", p: "₹500" }, { n: "Follow-up Visit", d: "10 min", p: "₹300" }, { n: "Child Health Check", d: "20 min", p: "₹600" }],
    toast: { revenue: "+₹4,200", who: "Priya confirmed" },
  },
  INTL: {
    business: "Glow Beauty Studio", owner: "Sarah", date: "Thursday, April 24", dateShort: "Thursday, Apr 24",
    stats: { bookings: "8", revenue: "$640", show: "94%" },
    appts: [
      { name: "Sarah R.", time: "10:00 AM", svc: "Haircut & Style", status: "confirmed" },
      { name: "Michael K.", time: "11:30 AM", svc: "Consultation", status: "confirmed" },
      { name: "Ana Lopez", time: "1:00 PM", svc: "Full Session", status: "pending" },
      { name: "James W.", time: "3:30 PM", svc: "Beard Trim", status: "confirmed" },
    ],
    cal: { month: "April 2026", week: "Week of 21–26", blocks: [
      { day: 0, top: 8, h: 14, label: "Sarah R.", tone: 0 }, { day: 0, top: 30, h: 10, label: "Walk-in", tone: 1 }, { day: 1, top: 18, h: 18, label: "Michael K.", tone: 1 },
      { day: 2, top: 6, h: 12, label: "Ana L.", tone: 2 }, { day: 2, top: 44, h: 14, label: "Group class", tone: 0 }, { day: 3, top: 24, h: 16, label: "James W.", tone: 1 },
      { day: 4, top: 12, h: 12, label: "Nadia P.", tone: 0 }, { day: 5, top: 30, h: 16, label: "Consult", tone: 1 } ] },
    invoice: { no: "#INV-2026-0481 · Apr 24, 2026", date: "", billed: "Sarah Reynolds", email: "hello@glowbeauty.com", items: [{ svc: "Haircut & Style", price: "$45.00" }, { svc: "Beard Trim", price: "$20.00" }, { svc: "Hair Treatment", price: "$35.00" }], total: "$100.00" },
    analytics: { revenue: "$8,420", expenses: "$2,180", profit: "$6,240", top: "Sarah R.", lifetime: "$1,240 lifetime" },
    services: [{ n: "Haircut & Style", d: "45 min", p: "$45" }, { n: "Beard Trim", d: "20 min", p: "$20" }, { n: "Hair Treatment", d: "30 min", p: "$35" }],
    toast: { revenue: "+$1,240", who: "Sarah confirmed" },
  },
};

const initials = (n: string) => n.split(" ").map((w) => w[0]).join("").slice(0, 2);
const TONES = ["bg-cv-blue", "bg-[#2A78C8]", "bg-cv-marigold text-cv-ink"] as const; // blue shades, one marigold fill

/* ── Dashboard window slides ─────────────────────────────────────────── */

function Dashboard({ s }: { s: Sample }) {
  return (
    <div className="h-full p-5 sm:p-6">
      <div className="mb-5 rounded-mk-card bg-cv-blue p-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="m-0 text-xs text-white/75">{s.date}</p>
            <p className="m-0 font-display text-lg font-bold text-white">Good morning, {s.owner}</p>
          </div>
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-white/15"><LayoutDashboard size={18} className="text-white" aria-hidden /></span>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {[{ n: s.stats.bookings, l: "Today's bookings" }, { n: s.stats.revenue, l: "Revenue today" }, { n: s.stats.show, l: "Show-up rate" }].map((x) => (
            <div key={x.l} className="rounded-xl bg-white/12 p-3 text-center">
              <div className="font-display text-xl font-bold leading-none text-white">{x.n}</div>
              <div className="mt-1 text-[10px] text-white/75">{x.l}</div>
            </div>
          ))}
        </div>
      </div>
      <p className="m-0 mb-3 text-xs font-bold uppercase tracking-wider text-cv-mute">Today&apos;s schedule</p>
      <div className="space-y-2.5">
        {s.appts.map((a, i) => (
          <div key={a.name} className="flex items-center gap-3 rounded-xl border border-cv-line/70 bg-cv-card p-3">
            <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-[10px] font-bold ${i === 2 ? TONES[2] : "bg-cv-blue text-white"}`}>{initials(a.name)}</span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold text-cv-ink">{a.name}</div>
              <div className="text-xs text-cv-mute">{a.time} · {a.svc}</div>
            </div>
            <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold ${a.status === "confirmed" ? "bg-cv-blue-tint text-cv-blue" : "bg-cv-marigold-tint text-cv-ink"}`}>{a.status}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Calendar({ s }: { s: Sample }) {
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return (
    <div className="h-full p-5 sm:p-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="m-0 font-display text-lg font-bold text-cv-ink">{s.cal.month}</p>
          <p className="m-0 text-xs text-cv-mute">{s.cal.week}</p>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="grid h-7 w-7 place-items-center rounded-lg border border-cv-line"><ChevronLeft size={14} className="text-cv-mute" aria-hidden /></span>
          <span className="grid h-7 w-7 place-items-center rounded-lg border border-cv-line"><ChevronRight size={14} className="text-cv-mute" aria-hidden /></span>
        </div>
      </div>
      <div className="grid grid-cols-6 gap-2">
        {days.map((d, i) => (
          <div key={d} className="text-center">
            <div className="mb-1.5 text-[10px] font-semibold text-cv-mute">{d}</div>
            <div className={`rounded-lg py-1 text-xs font-bold ${i === 3 ? "bg-cv-blue text-white" : "text-cv-ink"}`}>{21 + i}</div>
          </div>
        ))}
      </div>
      <div className="relative mt-3 grid h-[230px] grid-cols-6 gap-px overflow-hidden rounded-xl border border-cv-line/70 bg-cv-paper sm:h-[260px]">
        {days.map((d) => <div key={d} className="border-r border-cv-line/60 last:border-0" />)}
        {s.cal.blocks.map((b, i) => (
          <div key={i} className={`absolute overflow-hidden rounded-lg px-1.5 py-1 text-white ${TONES[b.tone]}`} style={{ left: `calc(${(b.day / 6) * 100}% + 3px)`, width: `calc(${100 / 6}% - 6px)`, top: `${b.top * 4}px`, height: `${b.h * 4}px` }}>
            <div className="truncate text-[9px] font-bold leading-tight">{b.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Invoice({ s }: { s: Sample }) {
  return (
    <div className="flex h-full flex-col p-5 sm:p-6">
      <div className="mb-5 flex items-start justify-between">
        <div>
          <p className="m-0 font-display text-lg font-bold text-cv-ink">Invoice</p>
          <p className="m-0 text-xs text-cv-mute">{s.invoice.no}</p>
        </div>
        <span className="inline-flex items-center gap-1 rounded-full bg-cv-blue-tint px-3 py-1.5 text-xs font-bold text-cv-blue"><Check size={12} aria-hidden /> Paid</span>
      </div>
      <div className="mb-4 flex items-center justify-between border-b border-cv-line pb-4 text-xs text-cv-mute">
        <div><p className="m-0 font-semibold text-cv-ink">{s.business}</p><p className="m-0">{s.invoice.email}</p></div>
        <div className="text-right"><p className="m-0 font-semibold text-cv-ink">Billed to</p><p className="m-0">{s.invoice.billed}</p></div>
      </div>
      <div className="flex-1 space-y-2.5">
        {s.invoice.items.map((it) => (
          <div key={it.svc} className="flex items-center justify-between text-sm"><span className="text-cv-ink">{it.svc}</span><span className="font-semibold text-cv-ink">{it.price}</span></div>
        ))}
      </div>
      <div className="mt-4 space-y-1.5 border-t border-cv-line pt-4">
        <div className="flex justify-between text-xs text-cv-mute"><span>Subtotal</span><span>{s.invoice.total}</span></div>
        <div className="flex justify-between font-display text-base font-bold text-cv-ink"><span>Total</span><span>{s.invoice.total}</span></div>
      </div>
      <div className="mt-4 flex items-center gap-2 rounded-xl border border-cv-line bg-cv-blue-tint px-4 py-3">
        <Check size={16} className="text-cv-blue" aria-hidden />
        <span className="text-xs font-medium text-cv-blue">Paid online</span>
        <span className="ml-auto rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-cv-blue">Settled</span>
      </div>
    </div>
  );
}

function Analytics({ s }: { s: Sample }) {
  const bars = [40, 55, 48, 70, 62, 85, 78, 95];
  return (
    <div className="h-full p-5 sm:p-6">
      <div className="mb-4 flex items-center justify-between">
        <p className="m-0 font-display text-lg font-bold text-cv-ink">Analytics</p>
        <span className="rounded-lg border border-cv-line px-2 py-1 text-[10px] text-cv-mute">Last 8 weeks</span>
      </div>
      <div className="mb-5 grid grid-cols-3 gap-3">
        {[{ l: "Revenue", v: s.analytics.revenue }, { l: "Expenses", v: s.analytics.expenses }, { l: "Profit", v: s.analytics.profit }].map((x) => (
          <div key={x.l} className="rounded-xl border border-cv-line/70 p-3">
            <div className="font-display text-base font-bold leading-none text-cv-ink">{x.v}</div>
            <div className="mt-1 text-[10px] text-cv-mute">{x.l}</div>
          </div>
        ))}
      </div>
      <div className="rounded-xl border border-cv-line/70 p-4">
        <p className="m-0 mb-3 text-[10px] font-bold uppercase tracking-wider text-cv-mute">Revenue trend</p>
        <div className="flex h-[110px] items-end justify-between gap-2">
          {bars.map((b, i) => <div key={i} className="h-full flex-1 self-end"><div className="w-full rounded-t-md bg-cv-blue" style={{ height: `${b}%`, marginTop: `${100 - b}%` }} /></div>)}
        </div>
      </div>
      <div className="mt-4 rounded-xl bg-cv-paper px-4 py-3 text-xs text-cv-mute">Top client: <span className="font-semibold text-cv-ink">{s.analytics.top}</span> · {s.analytics.lifetime}</div>
    </div>
  );
}

const SLIDES = [
  { id: "dashboard", label: "Dashboard", url: "calvy.io/dashboard", Screen: Dashboard },
  { id: "calendar", label: "Calendar", url: "calvy.io/dashboard/calendar", Screen: Calendar },
  { id: "invoice", label: "Invoices", url: "calvy.io/dashboard/payments", Screen: Invoice },
  { id: "analytics", label: "Analytics", url: "calvy.io/dashboard/analytics", Screen: Analytics },
];

/** The auto-playing dashboard window. Decorative: hidden from screen readers, the dots are the real controls. */
function Carousel({ s }: { s: Sample }) {
  const [active, setActive] = useState(0);
  const touchX = useRef<number | null>(null);
  const go = useCallback((i: number) => setActive((i + SLIDES.length) % SLIDES.length), []);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setTimeout(() => setActive((a) => (a + 1) % SLIDES.length), 4500);
    return () => clearTimeout(t);
  }, [active]);
  return (
    <div>
      <div className="relative overflow-hidden rounded-mk-card border border-[rgba(15,23,42,0.08)] bg-white [box-shadow:var(--mk-shadow-card)]"
        onTouchStart={(e) => { touchX.current = e.touches[0].clientX; }}
        onTouchEnd={(e) => { if (touchX.current === null) return; const dx = e.changedTouches[0].clientX - touchX.current; if (Math.abs(dx) > 40) go(active + (dx < 0 ? 1 : -1)); touchX.current = null; }}>
        <div className="flex items-center gap-2 border-b border-cv-line/70 bg-cv-card px-4 py-3">
          <div className="flex gap-1.5" aria-hidden><span className="h-2.5 w-2.5 rounded-full bg-cv-line" /><span className="h-2.5 w-2.5 rounded-full bg-cv-line" /><span className="h-2.5 w-2.5 rounded-full bg-cv-line" /></div>
          <div className="mx-auto flex w-full max-w-[16rem] items-center justify-center gap-2 rounded-lg bg-cv-paper px-4 py-1.5 text-xs text-cv-mute">{SLIDES[active].url}</div>
        </div>
        <div className="relative bg-white" aria-hidden="true">
          <div className="flex transition-transform duration-500 ease-out motion-reduce:transition-none" style={{ transform: `translateX(-${active * 100}%)` }}>
            {SLIDES.map(({ id, Screen }) => <div key={id} className="h-[420px] w-full shrink-0 overflow-hidden sm:h-[470px]"><Screen s={s} /></div>)}
          </div>
        </div>
      </div>
      <div className="mt-1 flex items-center justify-center">
        {SLIDES.map((x, i) => (
          <button key={x.id} aria-label={`Show ${x.label}`} aria-current={i === active} onClick={() => go(i)} className="mk-focus inline-flex h-11 w-11 items-center justify-center">
            <span className={`block h-2 rounded-full transition-all ${i === active ? "w-7 bg-cv-blue" : "w-2 bg-cv-line hover:bg-cv-mute"}`} />
          </button>
        ))}
      </div>
    </div>
  );
}

/* ── Phones ──────────────────────────────────────────────────────────── */

function Phone({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <div>
      <div className="h-[296px] w-[142px] rounded-[30px] border-2 border-cv-ink bg-cv-ink p-[3px] [box-shadow:var(--mk-shadow-card)]">
        <div className="flex h-full flex-col overflow-hidden rounded-[27px] bg-white">
          <div className="flex justify-center pb-1 pt-2.5"><div className="h-3 w-14 rounded-full bg-cv-ink" /></div>
          {children}
        </div>
      </div>
      <p className="m-0 mt-2 text-center text-[11px] font-semibold text-cv-mute">{label}</p>
    </div>
  );
}

function ClientPhone({ s }: { s: Sample }) {
  return (
    <Phone label="Client view">
      <div className="bg-cv-blue px-3 py-2.5 text-center">
        <p className="m-0 text-white/75" style={{ fontSize: 8 }}>{s.business}</p>
        <p className="m-0 font-display font-bold text-white" style={{ fontSize: 12 }}>Book an appointment</p>
      </div>
      <div className="flex-1 space-y-1.5 p-2">
        {s.services.map((x, i) => (
          <div key={x.n} className={`rounded-lg border p-1.5 ${i === 0 ? "border-cv-blue bg-cv-blue-tint" : "border-cv-line"}`}>
            <div className="flex items-center justify-between"><span className="font-semibold text-cv-ink" style={{ fontSize: 9 }}>{x.n}</span><span className="font-bold text-cv-blue" style={{ fontSize: 9 }}>{x.p}</span></div>
            <span className="text-cv-mute" style={{ fontSize: 7.5 }}>{x.d}</span>
          </div>
        ))}
      </div>
      <div className="p-2"><div className="rounded-lg bg-cv-blue py-1.5 text-center font-semibold text-white" style={{ fontSize: 9 }}>Continue</div></div>
    </Phone>
  );
}

function OwnerPhone({ s }: { s: Sample }) {
  return (
    <Phone label="Owner app">
      <div className="px-3 py-2"><p className="m-0 text-cv-mute" style={{ fontSize: 7.5 }}>{s.dateShort}</p><p className="m-0 font-display font-bold text-cv-ink" style={{ fontSize: 12 }}>Today</p></div>
      <div className="grid grid-cols-2 gap-1.5 px-2">
        <div className="rounded-lg bg-cv-blue-tint p-1.5"><div className="font-display font-bold text-cv-blue" style={{ fontSize: 12 }}>{s.stats.revenue}</div><div className="text-cv-mute" style={{ fontSize: 7 }}>Revenue</div></div>
        <div className="rounded-lg bg-cv-blue-tint p-1.5"><div className="font-display font-bold text-cv-blue" style={{ fontSize: 12 }}>{s.stats.bookings}</div><div className="text-cv-mute" style={{ fontSize: 7 }}>Bookings</div></div>
      </div>
      <div className="flex-1 space-y-1 p-2">
        {s.appts.slice(0, 3).map((u) => (
          <div key={u.name} className="flex items-center gap-1.5 rounded-lg bg-cv-paper p-1.5">
            <span className="grid h-4 w-4 shrink-0 place-items-center rounded-full bg-cv-blue font-bold text-white" style={{ fontSize: 6 }}>{initials(u.name)}</span>
            <div className="min-w-0 flex-1"><div className="truncate font-semibold text-cv-ink" style={{ fontSize: 8 }}>{u.name}</div><div className="text-cv-mute" style={{ fontSize: 7 }}>{u.time}</div></div>
            <Check size={9} className="text-cv-blue" aria-hidden />
          </div>
        ))}
      </div>
    </Phone>
  );
}

/* ── Hero composition ────────────────────────────────────────────────── */

const toast = "absolute z-20 flex max-w-[calc(50%-4px)] items-center gap-2 rounded-mk-card border border-[rgba(15,23,42,0.06)] bg-white p-2.5 sm:max-w-none sm:gap-3 sm:p-4 [box-shadow:var(--mk-shadow-card)] mk-float";

export function HeroMockups({ photos }: { photos: { IN: string | null; INTL: string | null } }) {
  const region = useRegion();
  const s = SAMPLE[region === "IN" ? "IN" : "INTL"];
  const photo = photos[region === "IN" ? "IN" : "INTL"];
  return (
    <div className="relative mx-auto w-full max-w-[600px] pb-16 lg:mx-0 lg:max-w-none lg:-mr-4 xl:-mr-16 xl:pb-24">
      <div aria-hidden className="absolute -right-6 -top-10 bottom-4 left-8 rounded-t-[999px] rounded-b-[40px] bg-cv-blue/[0.12] max-lg:hidden" />

      <div className="relative">
        {/* floating cards: the two from the original hero */}
        <div className={`${toast} left-0 top-[-20px] sm:left-[-24px] sm:top-[-28px]`} style={{ ["--mk-delay" as string]: "0s" }}>
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-cv-blue-tint text-cv-blue sm:h-10 sm:w-10"><TrendingUp size={18} aria-hidden /></span>
          <div><div className="font-display text-sm font-bold leading-none text-cv-ink sm:text-base">{s.toast.revenue}</div><div className="mt-1 text-xs text-cv-mute">Revenue today</div></div>
        </div>
        <div className={`${toast} right-0 top-[-20px] sm:right-[-24px] sm:top-[-28px]`} style={{ ["--mk-delay" as string]: "2.2s" }}>
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-cv-blue-tint text-cv-blue sm:h-10 sm:w-10"><Bell size={17} aria-hidden /></span>
          <div><div className="font-display text-sm font-bold leading-none text-cv-ink sm:text-base">Reminder sent</div><div className="mt-1 flex items-center gap-1 text-[11px] text-cv-mute sm:text-xs">{s.toast.who} <Check size={12} className="text-cv-blue" aria-hidden /></div></div>
        </div>

        {photo ? (
          <div className="relative h-[480px] overflow-hidden rounded-mk-img bg-cv-blue sm:h-[560px] lg:h-[640px]"><Image src={photo} alt="" fill priority sizes="(max-width: 1024px) 92vw, 50vw" className="object-cover" /></div>
        ) : (
          <div className="xl:mx-4"><Carousel s={s} /></div>
        )}

        {/* the two phones, tilted, from xl up (as in the original) */}
        {!photo && (
          <>
            <div className="absolute bottom-[-26px] left-[-44px] z-30 hidden origin-bottom xl:block" style={{ transform: "rotate(-5deg)" }}><ClientPhone s={s} /></div>
            <div className="absolute bottom-[-26px] right-[-44px] z-30 hidden origin-bottom xl:block" style={{ transform: "rotate(5deg)" }}><OwnerPhone s={s} /></div>
          </>
        )}
      </div>
    </div>
  );
}
