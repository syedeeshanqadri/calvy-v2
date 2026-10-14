"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import {
  LayoutDashboard, Calendar, FileText, BarChart3,
  ChevronLeft, ChevronRight, DollarSign, TrendingUp, TrendingDown,
  Users, Check, Wallet,
} from "lucide-react";

/* ── Mock screens (CSS-rendered, no images) ─────────────────────────── */

function DashboardScreen() {
  const appts = [
    { name: "Sarah R.", time: "10:00 AM", svc: "Haircut & Style", color: "#0284c7", status: "confirmed" },
    { name: "Michael K.", time: "11:30 AM", svc: "Consultation", color: "#0ea5e9", status: "confirmed" },
    { name: "Ana Lopez", time: "1:00 PM", svc: "Full Session", color: "#ec4899", status: "pending" },
    { name: "James W.", time: "3:30 PM", svc: "Beard Trim", color: "#22c55e", status: "confirmed" },
  ];
  return (
    <div className="p-5 sm:p-6 h-full">
      <div className="bg-gradient-to-r from-sky-600 to-sky-500 rounded-2xl p-5 mb-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-sky-100 text-xs">Thursday, April 24</p>
            <p className="text-white font-syne font-bold text-lg">Good morning, Sarah 👋</p>
          </div>
          <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center">
            <LayoutDashboard size={18} className="text-white" />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {[{ n: "8", l: "Today's bookings" }, { n: "$640", l: "Revenue today" }, { n: "94%", l: "Show-up rate" }].map(s => (
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

function CalendarScreen() {
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const blocks = [
    { day: 0, top: 8, h: 14, label: "Sarah R.", color: "#0284c7" },
    { day: 0, top: 30, h: 10, label: "Walk-in", color: "#22c55e" },
    { day: 1, top: 18, h: 18, label: "Michael K.", color: "#0ea5e9" },
    { day: 2, top: 6, h: 12, label: "Ana L.", color: "#ec4899" },
    { day: 2, top: 44, h: 14, label: "Group class", color: "#8b5cf6" },
    { day: 3, top: 24, h: 16, label: "James W.", color: "#22c55e" },
    { day: 4, top: 12, h: 12, label: "Nadia P.", color: "#f59e0b" },
    { day: 5, top: 30, h: 16, label: "Consult", color: "#0284c7" },
  ];
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

function InvoiceScreen() {
  const items = [
    { svc: "Haircut & Style", price: 45 },
    { svc: "Beard Trim", price: 20 },
    { svc: "Hair Treatment", price: 35 },
  ];
  const total = items.reduce((s, i) => s + i.price, 0);
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
          <p className="font-semibold text-gray-700">Glow Beauty Studio</p>
          <p>hello@glowbeauty.com</p>
        </div>
        <div className="text-right">
          <p className="font-semibold text-gray-700">Billed to</p>
          <p>Sarah Reynolds</p>
        </div>
      </div>
      <div className="space-y-2.5 flex-1">
        {items.map(it => (
          <div key={it.svc} className="flex items-center justify-between text-sm">
            <span className="text-gray-700">{it.svc}</span>
            <span className="font-semibold text-gray-900">${it.price.toFixed(2)}</span>
          </div>
        ))}
      </div>
      <div className="mt-4 pt-4 border-t border-gray-100 space-y-1.5">
        <div className="flex justify-between text-xs text-gray-500"><span>Subtotal</span><span>${total.toFixed(2)}</span></div>
        <div className="flex justify-between text-base font-syne font-bold text-gray-900"><span>Total</span><span>${total.toFixed(2)}</span></div>
      </div>
      <div className="mt-4 flex items-center gap-2 rounded-xl bg-sky-50 border border-sky-100 px-4 py-3">
        <Wallet size={16} className="text-sky-600" />
        <span className="text-xs font-medium text-sky-700">Paid online via Razorpay</span>
        <span className="ml-auto text-[10px] bg-sky-100 text-sky-700 px-2 py-0.5 rounded-full font-semibold">Settled</span>
      </div>
    </div>
  );
}

function AnalyticsScreen() {
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
          { l: "Revenue", v: "$8,420", icon: TrendingUp, color: "text-green-600", bg: "bg-green-50" },
          { l: "Expenses", v: "$2,180", icon: TrendingDown, color: "text-red-500", bg: "bg-red-50" },
          { l: "Profit", v: "$6,240", icon: DollarSign, color: "text-sky-600", bg: "bg-sky-50" },
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
        <span className="text-xs text-gray-600">Top client: <span className="font-semibold text-gray-800">Sarah R.</span> · $1,240 lifetime</span>
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

export function ProductCarousel() {
  const [active, setActive] = useState(0);
  const touchX = useRef<number | null>(null);

  const go = useCallback((i: number) => setActive((i + SLIDES.length) % SLIDES.length), []);

  // Always-on autoplay. Depending on `active` re-arms the timer after every
  // slide change, so manual nav (arrows/dots/swipe) also resets the countdown.
  useEffect(() => {
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
                <Screen />
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
