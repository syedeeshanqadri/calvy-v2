"use client";
// The hero's product mockups, exactly as on the original site (the auto-playing dashboard window with its four screens, the two
// tilted phones and the two floating cards). Only the CONTENT follows the visitor's region: India shows Indian names, a clinic and
// rupee amounts; everyone else shows the original international content in dollars. Illustrative sample content.
import { useState, useEffect, useRef, useCallback } from "react";
import {
  LayoutDashboard, Calendar, FileText, BarChart3,
  ChevronLeft, ChevronRight, DollarSign, TrendingUp, TrendingDown,
  Users, Check, Wallet, Star, Bell, IndianRupee,
} from "lucide-react";
import { useRegion } from "@/components/landing/useRegion";

interface Sample {
  business: string; owner: string; dateShort: string;
  stats: { bookings: string; revenue: string; show: string };
  appts: { name: string; time: string; svc: string; status: "confirmed" | "pending" }[];
  calLabels: string[];
  invoice: { email: string; billed: string; items: { svc: string; price: string }[]; total: string };
  analytics: { revenue: string; expenses: string; profit: string; top: string; lifetime: string };
  services: { n: string; d: string; p: string }[];
  toast: { revenue: string; who: string };
  rupee: boolean;
}

const SAMPLE: Record<"IN" | "INTL", Sample> = {
  IN: {
    business: "Sharma Family Clinic", owner: "Anita", dateShort: "Thursday, Apr 24",
    stats: { bookings: "8", revenue: "₹5,200", show: "94%" },
    appts: [
      { name: "Priya N.", time: "10:00 AM", svc: "General Consultation", status: "confirmed" },
      { name: "Mohammed I.", time: "11:30 AM", svc: "Follow-up Visit", status: "confirmed" },
      { name: "Kavita J.", time: "1:00 PM", svc: "Child Health Check", status: "pending" },
      { name: "Suresh R.", time: "3:30 PM", svc: "General Consultation", status: "confirmed" },
    ],
    calLabels: ["Priya N.", "Walk-in", "Mohammed I.", "Kavita J.", "Child check", "Suresh R.", "Neha G.", "Consult"],
    invoice: { email: "hello@sharmaclinic.in", billed: "Priya Nair", items: [{ svc: "General Consultation", price: "₹500" }, { svc: "Follow-up Visit", price: "₹300" }, { svc: "Child Health Check", price: "₹600" }], total: "₹1,400" },
    analytics: { revenue: "₹84,200", expenses: "₹21,800", profit: "₹62,400", top: "Priya N.", lifetime: "₹12,400 lifetime" },
    services: [{ n: "General Consultation", d: "15 min", p: "₹500" }, { n: "Follow-up Visit", d: "10 min", p: "₹300" }, { n: "Child Health Check", d: "20 min", p: "₹600" }],
    toast: { revenue: "+₹4,200", who: "Priya confirmed" }, rupee: true,
  },
  INTL: {
    business: "Glow Beauty Studio", owner: "Sarah", dateShort: "Thursday, Apr 24",
    stats: { bookings: "8", revenue: "$640", show: "94%" },
    appts: [
      { name: "Sarah R.", time: "10:00 AM", svc: "Haircut & Style", status: "confirmed" },
      { name: "Michael K.", time: "11:30 AM", svc: "Consultation", status: "confirmed" },
      { name: "Ana Lopez", time: "1:00 PM", svc: "Full Session", status: "pending" },
      { name: "James W.", time: "3:30 PM", svc: "Beard Trim", status: "confirmed" },
    ],
    calLabels: ["Sarah R.", "Walk-in", "Michael K.", "Ana L.", "Group class", "James W.", "Nadia P.", "Consult"],
    invoice: { email: "hello@glowbeauty.com", billed: "Sarah Reynolds", items: [{ svc: "Haircut & Style", price: "$45.00" }, { svc: "Beard Trim", price: "$20.00" }, { svc: "Hair Treatment", price: "$35.00" }], total: "$100.00" },
    analytics: { revenue: "$8,420", expenses: "$2,180", profit: "$6,240", top: "Sarah R.", lifetime: "$1,240 lifetime" },
    services: [{ n: "Haircut & Style", d: "45 min", p: "$45" }, { n: "Beard Trim", d: "20 min", p: "$20" }, { n: "Hair Treatment", d: "30 min", p: "$35" }],
    toast: { revenue: "+$1,240", who: "Sarah confirmed" }, rupee: false,
  },
};

/* ── Mock screens (CSS-rendered, no images) ─────────────────────────── */

function DashboardScreen({ s }: { s: Sample }) {
  const colors = ["#0284c7", "#0ea5e9", "#ec4899", "#22c55e"];
  const appts = s.appts.map((a, i) => ({ ...a, color: colors[i] }));
  return (
    <div className="p-5 sm:p-6 h-full">
      <div className="bg-gradient-to-r from-sky-600 to-sky-500 rounded-2xl p-5 mb-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-sky-100 text-xs">Thursday, April 24</p>
            <p className="text-white font-syne font-bold text-lg">Good morning, {s.owner}</p>
          </div>
          <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center">
            <LayoutDashboard size={18} className="text-white" />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {[{ n: s.stats.bookings, l: "Today's bookings" }, { n: s.stats.revenue, l: "Revenue today" }, { n: s.stats.show, l: "Show-up rate" }].map(s => (
            <div key={s.l} className="bg-white/15 rounded-xl p-3 text-center">
              <div className="font-syne font-bold text-white text-xl leading-none">{s.n}</div>
              <div className="text-sky-100 text-[10px] mt-1">{s.l}</div>
            </div>
          ))}
        </div>
      </div>
      <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">Today&apos;s schedule</p>
      <div className="space-y-2.5">
        {appts.map(a => (
          <div key={a.name} className="flex items-center gap-3 p-3 rounded-xl bg-gray-50">
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0" style={{ background: a.color }}>
              {a.name.split(" ").map(n => n[0]).join("")}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-gray-800 truncate">{a.name}</div>
              <div className="text-xs text-gray-500">{a.time} · {a.svc}</div>
            </div>
            <span className={`text-[10px] px-2 py-1 rounded-full font-semibold flex-shrink-0 ${a.status === "confirmed" ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>
              {a.status}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function CalendarScreen({ s }: { s: Sample }) {
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const geo = [
    { day: 0, top: 8, h: 14, color: "#0284c7" },
    { day: 0, top: 30, h: 10, color: "#22c55e" },
    { day: 1, top: 18, h: 18, color: "#0ea5e9" },
    { day: 2, top: 6, h: 12, color: "#ec4899" },
    { day: 2, top: 44, h: 14, color: "#8b5cf6" },
    { day: 3, top: 24, h: 16, color: "#22c55e" },
    { day: 4, top: 12, h: 12, color: "#f59e0b" },
    { day: 5, top: 30, h: 16, color: "#0284c7" },
  ];
  const blocks = geo.map((g, i) => ({ ...g, label: s.calLabels[i] }));
  return (
    <div className="p-5 sm:p-6 h-full">
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="font-syne font-bold text-lg text-gray-900">April 2026</p>
          <p className="text-xs text-gray-500">Week of 21–26</p>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-7 h-7 rounded-lg border border-gray-200 flex items-center justify-center"><ChevronLeft size={14} className="text-gray-400" /></div>
          <div className="w-7 h-7 rounded-lg border border-gray-200 flex items-center justify-center"><ChevronRight size={14} className="text-gray-400" /></div>
        </div>
      </div>
      <div className="grid grid-cols-6 gap-2">
        {days.map((d, i) => (
          <div key={d} className="text-center">
            <div className="text-[10px] font-semibold text-gray-400 mb-1.5">{d}</div>
            <div className={`text-xs font-bold rounded-lg py-1 ${i === 3 ? "bg-sky-600 text-white" : "text-gray-700"}`}>{21 + i}</div>
          </div>
        ))}
      </div>
      <div className="relative mt-3 rounded-xl bg-gray-50 border border-gray-100 h-[230px] sm:h-[260px] grid grid-cols-6 gap-px overflow-hidden">
        {days.map((d) => <div key={d} className="border-r border-gray-100/70 last:border-0" />)}
        {blocks.map((b, i) => (
          <div
            key={i}
            className="absolute rounded-lg px-1.5 py-1 text-white overflow-hidden"
            style={{
              left: `calc(${(b.day / 6) * 100}% + 3px)`,
              width: `calc(${(1 / 6) * 100}% - 6px)`,
              top: `${b.top * 4}px`,
              height: `${b.h * 4}px`,
              background: b.color,
            }}
          >
            <div className="text-[9px] font-bold leading-tight truncate">{b.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function InvoiceScreen({ s }: { s: Sample }) {
  const items = s.invoice.items;
  return (
    <div className="p-5 sm:p-6 h-full flex flex-col">
      <div className="flex items-start justify-between mb-5">
        <div>
          <p className="font-syne font-bold text-lg text-gray-900">Invoice</p>
          <p className="text-xs text-gray-500">#INV-2026-0481 · Apr 24, 2026</p>
        </div>
        <span className="inline-flex items-center gap-1 text-xs font-bold text-green-700 bg-green-100 px-3 py-1.5 rounded-full">
          <Check size={12} /> Paid
        </span>
      </div>
      <div className="flex items-center justify-between text-xs text-gray-500 mb-4 pb-4 border-b border-gray-100">
        <div>
          <p className="font-semibold text-gray-700">{s.business}</p>
          <p>{s.invoice.email}</p>
        </div>
        <div className="text-right">
          <p className="font-semibold text-gray-700">Billed to</p>
          <p>{s.invoice.billed}</p>
        </div>
      </div>
      <div className="space-y-2.5 flex-1">
        {items.map(it => (
          <div key={it.svc} className="flex items-center justify-between text-sm">
            <span className="text-gray-700">{it.svc}</span>
            <span className="font-semibold text-gray-900">{it.price}</span>
          </div>
        ))}
      </div>
      <div className="mt-4 pt-4 border-t border-gray-100 space-y-1.5">
        <div className="flex justify-between text-xs text-gray-500"><span>Subtotal</span><span>{s.invoice.total}</span></div>
        <div className="flex justify-between text-base font-syne font-bold text-gray-900"><span>Total</span><span>{s.invoice.total}</span></div>
      </div>
      <div className="mt-4 flex items-center gap-2 rounded-xl bg-sky-50 border border-sky-100 px-4 py-3">
        <Wallet size={16} className="text-sky-600" />
        <span className="text-xs font-medium text-sky-700">Paid online</span>
        <span className="ml-auto text-[10px] bg-sky-100 text-sky-700 px-2 py-0.5 rounded-full font-semibold">Settled</span>
      </div>
    </div>
  );
}

function AnalyticsScreen({ s }: { s: Sample }) {
  const bars = [40, 55, 48, 70, 62, 85, 78, 95];
  const max = Math.max(...bars);
  return (
    <div className="p-5 sm:p-6 h-full">
      <div className="flex items-center justify-between mb-4">
        <p className="font-syne font-bold text-lg text-gray-900">Analytics</p>
        <span className="text-[10px] text-gray-400 border border-gray-200 rounded-lg px-2 py-1">Last 8 weeks</span>
      </div>
      <div className="grid grid-cols-3 gap-3 mb-5">
        {[
          { l: "Revenue", v: s.analytics.revenue, icon: TrendingUp, color: "text-green-600", bg: "bg-green-50" },
          { l: "Expenses", v: s.analytics.expenses, icon: TrendingDown, color: "text-red-500", bg: "bg-red-50" },
          { l: "Profit", v: s.analytics.profit, icon: s.rupee ? IndianRupee : DollarSign, color: "text-sky-600", bg: "bg-sky-50" },
        ].map(s => (
          <div key={s.l} className="rounded-xl border border-gray-100 p-3">
            <div className={`w-7 h-7 rounded-lg ${s.bg} flex items-center justify-center mb-2`}>
              <s.icon size={14} className={s.color} />
            </div>
            <div className="font-syne font-bold text-base text-gray-900 leading-none">{s.v}</div>
            <div className="text-[10px] text-gray-500 mt-1">{s.l}</div>
          </div>
        ))}
      </div>
      <div className="rounded-xl border border-gray-100 p-4">
        <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-3">Revenue trend</p>
        <div className="flex items-end justify-between gap-2 h-[110px]">
          {bars.map((b, i) => (
            <div key={i} className="flex-1 flex flex-col items-center justify-end h-full">
              <div className="w-full rounded-t-md bg-gradient-to-t from-sky-500 to-sky-400" style={{ height: `${(b / max) * 100}%` }} />
            </div>
          ))}
        </div>
      </div>
      <div className="mt-4 flex items-center gap-3 rounded-xl bg-gray-50 px-4 py-3">
        <Users size={16} className="text-gray-400" />
        <span className="text-xs text-gray-600">Top client: <span className="font-semibold text-gray-800">{s.analytics.top}</span> · {s.analytics.lifetime}</span>
      </div>
    </div>
  );
}

/* ── Reusable browser-framed, auto-playing carousel ──────────────────── */

const SLIDES = [
  { id: "dashboard", label: "Dashboard", url: "calvy.io/dashboard", Screen: DashboardScreen },
  { id: "calendar", label: "Calendar", url: "calvy.io/dashboard/calendar", Screen: CalendarScreen },
  { id: "invoice", label: "Invoices", url: "calvy.io/dashboard/payments", Screen: InvoiceScreen },
  { id: "analytics", label: "Analytics", url: "calvy.io/dashboard/analytics", Screen: AnalyticsScreen },
];

const INTERVAL = 4500;

function ProductCarousel({ s }: { s: Sample }) {
  const [active, setActive] = useState(0);
  const touchX = useRef<number | null>(null);

  const go = useCallback((i: number) => setActive((i + SLIDES.length) % SLIDES.length), []);

  // Always-on autoplay. Depending on `active` re-arms the timer after every
  // slide change, so manual nav (arrows/dots/swipe) also resets the countdown.
  useEffect(() => {
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setTimeout(() => setActive(a => (a + 1) % SLIDES.length), INTERVAL);
    return () => clearTimeout(t);
  }, [active]);

  const onTouchStart = (e: React.TouchEvent) => { touchX.current = e.touches[0].clientX; };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchX.current;
    if (Math.abs(dx) > 40) go(active + (dx < 0 ? 1 : -1));
    touchX.current = null;
  };

  return (
    <div>
      <div
        className="relative rounded-3xl bg-gray-100 border border-gray-200 shadow-2xl shadow-sky-100/50 overflow-hidden"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {/* Window chrome */}
        <div className="flex items-center gap-2 px-4 py-3 bg-white border-b border-gray-100">
          <div className="flex gap-1.5">
            <span className="w-3 h-3 rounded-full bg-red-400" />
            <span className="w-3 h-3 rounded-full bg-amber-400" />
            <span className="w-3 h-3 rounded-full bg-green-400" />
          </div>
          <div className="mx-auto flex items-center gap-2 bg-gray-100 rounded-lg px-4 py-1.5 text-xs text-gray-500 max-w-[16rem] w-full justify-center">
            <span className="w-2 h-2 rounded-full bg-green-500" />
            {SLIDES[active].url}
          </div>
        </div>

        {/* Slides track */}
        <div className="relative bg-white">
          <div className="flex transition-transform duration-500 ease-out" style={{ transform: `translateX(-${active * 100}%)` }}>
            {SLIDES.map(({ id, Screen }) => (
              <div key={id} className="w-full flex-shrink-0 h-[420px] sm:h-[460px] overflow-hidden">
                <Screen s={s} />
              </div>
            ))}
          </div>

          <button
            aria-label="Previous"
            onClick={() => go(active - 1)}
            className="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white/90 backdrop-blur border border-gray-200 shadow-md flex items-center justify-center text-gray-600 hover:bg-white transition-colors"
          >
            <ChevronLeft size={18} />
          </button>
          <button
            aria-label="Next"
            onClick={() => go(active + 1)}
            className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white/90 backdrop-blur border border-gray-200 shadow-md flex items-center justify-center text-gray-600 hover:bg-white transition-colors"
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      {/* Dots */}
      <div className="flex items-center justify-center gap-2 mt-5">
        {SLIDES.map((s, i) => (
          <button
            key={s.id}
            aria-label={`Go to ${s.label}`}
            onClick={() => go(i)}
            className={`h-2 rounded-full transition-all ${i === active ? "w-7 bg-sky-600" : "w-2 bg-gray-300 hover:bg-gray-400"}`}
          />
        ))}
      </div>
    </div>
  );
}

/* ── Phones ──────────────────────────────────────────────────────────── */

/* Compact phone frame used to flank the hero carousel. */
function PhoneFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-gray-900 shadow-2xl overflow-hidden" style={{ borderRadius: 30, width: 128, height: 270, padding: 3 }}>
      <div className="bg-white h-full overflow-hidden flex flex-col" style={{ borderRadius: 27 }}>
        <div className="flex justify-center pt-2.5 pb-1">
          <div className="bg-gray-900 rounded-full" style={{ width: 52, height: 12 }} />
        </div>
        {children}
      </div>
    </div>
  );
}

/* Client-facing booking page */
function ClientPhone({ s }: { s: Sample }) {
  const services = s.services;
  return (
    <PhoneFrame>
      <div className="bg-sky-600 px-3 py-2.5 text-center">
        <p className="text-sky-200 font-medium" style={{ fontSize: 7 }}>{s.business}</p>
        <p className="text-white font-syne font-bold" style={{ fontSize: 11 }}>Book an appointment</p>
        <div className="flex items-center justify-center gap-0.5 mt-1">
          {Array(5).fill(0).map((_, i) => <Star key={i} size={6} className="text-amber-300 fill-amber-300" />)}
          <span className="text-sky-100 ml-0.5" style={{ fontSize: 6 }}>4.9</span>
        </div>
      </div>
      <div className="flex-1 p-2 space-y-1.5">
        {services.map((s, i) => (
          <div key={s.n} className={`rounded-lg p-1.5 border ${i === 0 ? "border-sky-300 bg-sky-50" : "border-gray-100"}`}>
            <div className="flex items-center justify-between">
              <span className="font-semibold text-gray-800" style={{ fontSize: 8 }}>{s.n}</span>
              <span className="font-bold text-sky-600" style={{ fontSize: 8 }}>{s.p}</span>
            </div>
            <span className="text-gray-400" style={{ fontSize: 6.5 }}>{s.d}</span>
          </div>
        ))}
      </div>
      <div className="p-2">
        <div className="bg-sky-600 text-white text-center rounded-lg py-1.5 font-semibold" style={{ fontSize: 8 }}>Continue</div>
      </div>
    </PhoneFrame>
  );
}

/* Owner mobile dashboard */
function OwnerPhone({ s }: { s: Sample }) {
  const colors = ["#0284c7", "#0ea5e9", "#ec4899"];
  const upcoming = s.appts.slice(0, 3).map((a, i) => ({ name: a.name, time: a.time, color: colors[i] }));
  return (
    <PhoneFrame>
      <div className="px-3 py-2.5">
        <p className="text-gray-400" style={{ fontSize: 6.5 }}>{s.dateShort}</p>
        <p className="font-syne font-bold text-gray-900" style={{ fontSize: 11 }}>Today</p>
      </div>
      <div className="px-2 grid grid-cols-2 gap-1.5">
        <div className="rounded-lg bg-green-50 p-1.5">
          <div className="font-syne font-bold text-green-700" style={{ fontSize: 11 }}>{s.stats.revenue}</div>
          <div className="text-green-600" style={{ fontSize: 6 }}>Revenue</div>
        </div>
        <div className="rounded-lg bg-sky-50 p-1.5">
          <div className="font-syne font-bold text-sky-700" style={{ fontSize: 11 }}>{s.stats.bookings}</div>
          <div className="text-sky-600" style={{ fontSize: 6 }}>Bookings</div>
        </div>
      </div>
      <div className="flex-1 p-2 space-y-1">
        {upcoming.map(u => (
          <div key={u.name} className="flex items-center gap-1.5 rounded-lg bg-gray-50 p-1.5">
            <div className="w-4 h-4 rounded-full flex items-center justify-center text-white font-bold flex-shrink-0" style={{ background: u.color, fontSize: 6 }}>
              {u.name.split(" ").map(n => n[0]).join("")}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-gray-800 truncate" style={{ fontSize: 7.5 }}>{u.name}</div>
              <div className="text-gray-400" style={{ fontSize: 6 }}>{u.time}</div>
            </div>
            <Check size={9} className="text-green-500" />
          </div>
        ))}
      </div>
    </PhoneFrame>
  );
}

/* ── Hero composition: the original layout, without the arch behind it ── */

export function HeroMockups() {
  const region = useRegion();
  const s = SAMPLE[region === "IN" ? "IN" : "INTL"];
  return (
    <div className="relative min-w-0 mt-6 lg:mt-0">
      {/* Floating accent cards (desktop) */}
      <div className="hidden lg:flex absolute -top-6 -left-5 z-20 bg-white rounded-2xl p-4 shadow-xl border border-gray-100 items-center gap-3" style={{ animation: "float 5s ease-in-out infinite" }}>
        <div className="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center">
          {region === "IN" ? <IndianRupee size={20} className="text-green-600" /> : <DollarSign size={20} className="text-green-600" />}
        </div>
        <div>
          <div className="font-syne font-bold text-base leading-none text-gray-900">{s.toast.revenue}</div>
          <div className="text-xs text-gray-500 mt-0.5">Revenue today</div>
        </div>
      </div>

      <div className="hidden lg:flex absolute -top-6 -right-5 z-20 bg-white rounded-2xl p-4 shadow-xl border border-gray-100 items-center gap-3" style={{ animation: "float 5s ease-in-out infinite 2.5s" }}>
        <div className="w-10 h-10 rounded-xl bg-sky-50 flex items-center justify-center">
          <Bell size={18} className="text-sky-600" />
        </div>
        <div>
          <div className="font-syne font-bold text-base leading-none text-gray-900">Reminder sent</div>
          <div className="text-xs text-gray-500 mt-0.5 flex items-center gap-1">{s.toast.who} <Check size={11} className="text-green-600" strokeWidth={3} /></div>
        </div>
      </div>

      <div className="xl:mx-14">
        <ProductCarousel s={s} />
      </div>

      {/* Client booking phone: bottom-left */}
      <div className="hidden xl:block absolute z-30" style={{ bottom: -10, left: -28, transform: "rotate(-6deg)", transformOrigin: "bottom center" }}>
        <ClientPhone s={s} />
        <div className="mt-2 text-center">
          <span className="inline-block bg-gray-100 text-gray-500 text-[9px] font-semibold px-2.5 py-1 rounded-full">Client view</span>
        </div>
      </div>

      {/* Owner app phone: bottom-right */}
      <div className="hidden xl:block absolute z-30" style={{ bottom: -10, right: -28, transform: "rotate(6deg)", transformOrigin: "bottom center" }}>
        <OwnerPhone s={s} />
        <div className="mt-2 text-center">
          <span className="inline-block bg-gray-100 text-gray-500 text-[9px] font-semibold px-2.5 py-1 rounded-full">Owner app</span>
        </div>
      </div>
    </div>
  );
}
