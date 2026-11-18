// Illustrated product screens for the marketing pages. Pure markup (no images to load), server-renderable, and made-up
// example content only: nothing here is a real business or a real number.
import { BellRing, CalendarCheck, Check, Clock, Globe, Lock, Star, Users } from "lucide-react";
import type { ForSample } from "@/lib/forPages";

/** A browser window around a booking page: what a customer sees at yourname.calvy.io. */
export function BookingMock({ sample, serviceLabel, personLabel }: { sample: ForSample; serviceLabel: string; personLabel: string }) {
  return (
    <div className="rounded-2xl bg-white shadow-2xl shadow-sky-950/40 ring-1 ring-black/5 overflow-hidden" aria-hidden>
      <div className="flex items-center gap-2 bg-gray-100 px-4 py-2.5 border-b border-gray-200">
        <span className="w-2.5 h-2.5 rounded-full bg-red-300" /><span className="w-2.5 h-2.5 rounded-full bg-amber-300" /><span className="w-2.5 h-2.5 rounded-full bg-green-300" />
        <div className="ml-3 flex-1 flex items-center gap-1.5 rounded-md bg-white px-3 py-1 text-[11px] text-gray-500">
          <Lock size={10} /> yourname.calvy.io
        </div>
      </div>
      <div className="bg-gradient-to-br from-sky-600 to-sky-700 px-6 py-5 text-white">
        <p className="text-[11px] font-medium text-sky-200 uppercase tracking-widest">{sample.business}</p>
        <p className="font-syne font-bold text-lg leading-tight mt-1">{sample.tagline}</p>
        <div className="flex items-center gap-1 mt-2 text-[11px] text-sky-100">
          {[0, 1, 2, 3, 4].map((i) => <Star key={i} size={11} className="text-amber-300 fill-amber-300" />)} <span className="ml-1">Rated by customers</span>
        </div>
      </div>
      <div className="p-5 space-y-2.5">
        <p className="text-[11px] font-bold uppercase tracking-widest text-gray-400">Choose a {serviceLabel}</p>
        {sample.services.map((s, i) => (
          <div key={s.name} className={`flex items-center justify-between rounded-xl border px-4 py-3 ${i === 0 ? "border-sky-300 bg-sky-50" : "border-gray-100"}`}>
            <div>
              <p className="text-sm font-semibold text-gray-900">{s.name}</p>
              <p className="text-xs text-gray-500 flex items-center gap-1"><Clock size={11} /> {s.duration}</p>
            </div>
            <span className={`w-5 h-5 rounded-full flex items-center justify-center ${i === 0 ? "bg-sky-600 text-white" : "border border-gray-300"}`}>{i === 0 && <Check size={12} strokeWidth={3} />}</span>
          </div>
        ))}
        <p className="pt-2 text-[11px] font-bold uppercase tracking-widest text-gray-400">With {personLabel} · Today</p>
        <div className="grid grid-cols-4 gap-2">
          {["10:00", "10:30", "11:15", "12:00"].map((t, i) => (
            <span key={t} className={`text-center rounded-lg py-2 text-xs font-semibold ${i === 1 ? "bg-sky-600 text-white" : "border border-gray-200 text-gray-700"}`}>{t}</span>
          ))}
        </div>
        <div className="mt-2 rounded-xl bg-[#0f0f1a] text-white text-center text-sm font-semibold py-3">Confirm booking</div>
      </div>
    </div>
  );
}

/** Floating card: a customer's place in the queue (token businesses) or a confirmation (slot businesses). */
export function StatusCard({ queue, appointmentWord }: { queue: boolean; appointmentWord: string }) {
  return queue ? (
    <div className="rounded-2xl bg-white shadow-xl shadow-sky-950/30 ring-1 ring-black/5 p-4 w-52" aria-hidden>
      <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Your number</p>
      <p className="font-syne font-extrabold text-4xl text-sky-600 leading-none mt-1">#14</p>
      <p className="text-xs text-gray-600 mt-2">3 people ahead of you</p>
      <div className="mt-3 h-1.5 rounded-full bg-gray-100 overflow-hidden"><div className="h-full w-3/4 rounded-full bg-sky-500" /></div>
    </div>
  ) : (
    <div className="rounded-2xl bg-white shadow-xl shadow-sky-950/30 ring-1 ring-black/5 p-4 w-56 flex items-start gap-3" aria-hidden>
      <span className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0"><CalendarCheck size={18} /></span>
      <div>
        <p className="text-sm font-bold text-gray-900">Your {appointmentWord} is confirmed</p>
        <p className="text-xs text-gray-500 mt-0.5">Calendar invite sent to your email</p>
      </div>
    </div>
  );
}

/** Floating card: a reminder going out. */
export function ReminderCard({ appointmentWord }: { appointmentWord: string }) {
  return (
    <div className="rounded-2xl bg-white shadow-xl shadow-sky-950/30 ring-1 ring-black/5 p-4 w-60 flex items-start gap-3" aria-hidden>
      <span className="w-9 h-9 rounded-xl bg-sky-100 text-sky-600 flex items-center justify-center shrink-0"><BellRing size={18} /></span>
      <div>
        <p className="text-sm font-bold text-gray-900">Reminder sent</p>
        <p className="text-xs text-gray-500 mt-0.5">Your {appointmentWord} is tomorrow at 10:30. See you then.</p>
      </div>
    </div>
  );
}

/** The owner's "today" list on a phone. */
export function TodayMock({ sample, clientWord }: { sample: ForSample; clientWord: string }) {
  const rows = [
    { who: "Riya K.", what: sample.services[0].name, state: "Arrived", tone: "bg-emerald-100 text-emerald-700" },
    { who: "Aman S.", what: sample.services[1].name, state: "Next", tone: "bg-sky-100 text-sky-700" },
    { who: "Fatima B.", what: sample.services[2].name, state: "Booked", tone: "bg-gray-100 text-gray-600" },
    { who: "Joseph P.", what: sample.services[0].name, state: "Booked", tone: "bg-gray-100 text-gray-600" },
  ];
  return (
    <div className="mx-auto w-[280px] rounded-[2.2rem] bg-[#0f0f1a] p-2.5 shadow-2xl shadow-sky-900/30" aria-hidden>
      <div className="rounded-[1.8rem] bg-white overflow-hidden">
        <div className="flex justify-center pt-2.5"><span className="w-20 h-4 rounded-full bg-[#0f0f1a]" /></div>
        <div className="px-4 pt-3 pb-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Today</p>
          <p className="font-syne font-bold text-lg text-gray-900">4 {clientWord}s expected</p>
          <div className="mt-3 space-y-2">
            {rows.map((r) => (
              <div key={r.who + r.what} className="flex items-center justify-between rounded-xl border border-gray-100 px-3 py-2.5">
                <div className="min-w-0"><p className="text-sm font-semibold text-gray-900 truncate">{r.who}</p><p className="text-[11px] text-gray-500 truncate">{r.what}</p></div>
                <span className={`text-[10px] font-bold rounded-full px-2.5 py-1 ${r.tone}`}>{r.state}</span>
              </div>
            ))}
          </div>
          <div className="mt-3 rounded-xl bg-sky-600 text-white text-center text-xs font-semibold py-2.5">Call next</div>
        </div>
      </div>
    </div>
  );
}

/** A small abstract "website" graphic for the About page. */
export function SiteMock() {
  return (
    <div className="rounded-2xl bg-white shadow-xl ring-1 ring-black/5 overflow-hidden" aria-hidden>
      <div className="h-24 bg-gradient-to-br from-sky-500 to-indigo-600 relative">
        <Globe className="absolute right-4 top-4 text-white/30" size={44} />
      </div>
      <div className="p-4 space-y-2">
        <div className="h-3 w-2/3 rounded bg-gray-200" /><div className="h-2.5 w-full rounded bg-gray-100" /><div className="h-2.5 w-5/6 rounded bg-gray-100" />
        <div className="flex gap-2 pt-1"><span className="h-7 w-24 rounded-lg bg-sky-600" /><span className="h-7 w-20 rounded-lg border border-gray-200" /></div>
        <div className="flex items-center gap-1 pt-1 text-[11px] text-gray-400"><Users size={12} /> Team · Hours · Reviews</div>
      </div>
    </div>
  );
}
