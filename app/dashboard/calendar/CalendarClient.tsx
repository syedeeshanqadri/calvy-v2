"use client";
import { useTerms } from "@/components/providers/TermsProvider";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import {
  AppointmentDetailModal,
  NewAppointmentModal,
  type ApptDetail,
  type NewAppointmentInitial,
  type ServiceOption,
} from "@/components/dashboard/AppointmentModals";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";

const PX_PER_HOUR = 56;
const PX_PER_MIN = PX_PER_HOUR / 60;
const SLOT_MIN = 30; // a click on an empty area snaps to this
const DAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

interface StaffRow { id: string; name: string; color: string; }

const toMin = (time: string) => { const [h, m] = time.split(":").map(Number); return h * 60 + m; };
const pad = (n: number) => String(n).padStart(2, "0");
const dateKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const hourLabel = (h: number) => (h === 0 ? "12am" : h === 12 ? "12pm" : h > 12 ? `${h - 12}pm` : `${h}am`);

/** Side-by-side lanes for appointments that overlap in time (different staff, group sessions). */
function layoutDay(appts: ApptDetail[]) {
  const items = appts
    .map((a) => ({ a, start: toMin(a.time), end: toMin(a.time) + Math.max(a.duration, 15), lane: 0, lanes: 1 }))
    .sort((x, y) => x.start - y.start || x.end - y.end);
  let cluster: typeof items = [];
  let clusterEnd = -1;
  const close = () => {
    const lanes = Math.max(1, ...cluster.map((c) => c.lane + 1));
    cluster.forEach((c) => (c.lanes = lanes));
    cluster = [];
  };
  for (const it of items) {
    if (cluster.length && it.start >= clusterEnd) close();
    const used = new Set(cluster.filter((c) => c.end > it.start).map((c) => c.lane));
    let lane = 0;
    while (used.has(lane)) lane++;
    it.lane = lane;
    cluster.push(it);
    clusterEnd = Math.max(clusterEnd, it.end);
  }
  close();
  return items;
}

export function CalendarClient({
  appointments, staff, services,
}: { appointments: ApptDetail[]; staff: StaffRow[]; services: ServiceOption[] }) {
  const router = useRouter();
  const { t } = useTerms();
  const [view, setView] = useState<"week" | "day">("day");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [filterStaff, setFilterStaff] = useState("");
  const [open, setOpen] = useState<ApptDetail | null>(null);
  const [creating, setCreating] = useState<NewAppointmentInitial | null>(null);

  // Phones get the day view; wider screens start on the week.
  useEffect(() => {
    if (window.innerWidth >= 768) setView("week");
  }, []);

  const visible = useMemo(
    () => appointments.filter((a) => !filterStaff || a.staffId === filterStaff),
    [appointments, filterStaff],
  );

  const { startHour, endHour } = useMemo(() => {
    let lo = 8, hi = 20;
    for (const a of visible) {
      lo = Math.min(lo, Math.floor(toMin(a.time) / 60));
      hi = Math.max(hi, Math.ceil((toMin(a.time) + a.duration) / 60));
    }
    return { startHour: Math.max(0, lo), endHour: Math.min(24, hi) };
  }, [visible]);
  const hours = Array.from({ length: endHour - startHour }, (_, i) => startHour + i);

  const weekStart = new Date(currentDate);
  weekStart.setDate(currentDate.getDate() - currentDate.getDay());
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    return d;
  });
  const days = view === "week" ? weekDays : [currentDate];

  const navigate = (dir: number) => {
    const d = new Date(currentDate);
    d.setDate(d.getDate() + (view === "week" ? dir * 7 : dir));
    setCurrentDate(d);
  };

  const apptsByDay: Record<string, ApptDetail[]> = {};
  visible.forEach((a) => (apptsByDay[a.date] ||= []).push(a));

  const today = new Date();
  const todayKey = dateKey(today);

  const refresh = () => router.refresh();

  function clickEmpty(e: React.MouseEvent<HTMLDivElement>, key: string) {
    const rect = e.currentTarget.getBoundingClientRect();
    const minutes = startHour * 60 + Math.floor((e.clientY - rect.top) / PX_PER_MIN / SLOT_MIN) * SLOT_MIN;
    setCreating({ date: key, time: `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`, staffId: filterStaff || undefined });
  }

  return (
    <DashboardLayout title="Calendar" subtitle="Tap an empty time to book, tap a booking to open it">
      <Card className="overflow-hidden">
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 border-b border-[#f0ede8] flex-wrap gap-3">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <button aria-label="Previous" onClick={() => navigate(-1)} className="w-9 h-9 rounded-lg border border-[#e8e6e0] flex items-center justify-center text-[#6b6b80] hover:bg-[#f8f7f4] transition-colors"><ChevronLeft size={16} /></button>
            <button aria-label="Next" onClick={() => navigate(1)} className="w-9 h-9 rounded-lg border border-[#e8e6e0] flex items-center justify-center text-[#6b6b80] hover:bg-[#f8f7f4] transition-colors"><ChevronRight size={16} /></button>
            <h2 className="font-syne font-bold text-sm sm:text-base truncate">
              {view === "week"
                ? `${weekDays[0].getDate()} ${weekDays[0].getMonth() !== weekDays[6].getMonth() ? MONTHS[weekDays[0].getMonth()].slice(0, 3) + " " : ""}– ${weekDays[6].getDate()} ${MONTHS[weekDays[6].getMonth()]} ${weekDays[6].getFullYear()}`
                : `${DAYS_SHORT[currentDate.getDay()]}, ${MONTHS[currentDate.getMonth()]} ${currentDate.getDate()}, ${currentDate.getFullYear()}`}
            </h2>
            <button onClick={() => setCurrentDate(new Date())} className="text-xs text-accent font-semibold hover:underline flex-shrink-0">Today</button>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {staff.length > 0 && (
              <select aria-label={`Filter by staff`} value={filterStaff} onChange={(e) => setFilterStaff(e.target.value)} className="h-9 rounded-xl border border-[#e8e6e0] px-3 text-sm bg-white focus:outline-none focus:border-accent/40">
                <option value="">All staff</option>
                {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            )}
            <div className="flex gap-1 bg-[#f8f7f4] rounded-xl p-1">
              {(["day", "week"] as const).map((v) => (
                <button key={v} onClick={() => setView(v)} aria-pressed={view === v} className={`px-3 sm:px-4 py-1.5 rounded-lg text-sm font-medium capitalize transition-all ${view === v ? "bg-white shadow text-brand-900" : "text-[#6b6b80] hover:text-brand-900"}`}>{v}</button>
              ))}
            </div>
            <Button size="sm" className="gap-1.5" onClick={() => setCreating({ date: dateKey(currentDate), staffId: filterStaff || undefined })}><Plus size={14} /> New</Button>
          </div>
        </div>

        <div className="overflow-auto" style={{ maxHeight: "calc(100vh - 280px)" }}>
          <div
            className={cn("grid", view === "week" && "min-w-[760px]")}
            style={{ gridTemplateColumns: `3rem repeat(${days.length}, minmax(0, 1fr))` }}
          >
            {/* time column: sticky when the week scrolls sideways */}
            <div className="sticky left-0 z-30 bg-white border-r border-[#f0ede8]">
              <div className="h-12 sticky top-0 bg-white z-10 border-b border-[#f0ede8]" />
              {hours.map((h) => (
                <div key={h} className="flex items-start justify-end pr-1.5" style={{ height: PX_PER_HOUR }}>
                  <span className="text-[11px] text-[#6b6b80] -mt-2">{hourLabel(h)}</span>
                </div>
              ))}
            </div>

            {days.map((day) => {
              const key = dateKey(day);
              const isToday = key === todayKey;
              const laid = layoutDay(apptsByDay[key] || []);
              return (
                <div key={key} className="border-r border-[#f0ede8] last:border-0 min-w-0">
                  <div className={cn("h-12 flex flex-col items-center justify-center border-b border-[#f0ede8] sticky top-0 bg-white z-20", isToday && "bg-[#fafaf8]")}>
                    <span className="text-[11px] font-semibold text-[#6b6b80] uppercase">{DAYS_SHORT[day.getDay()]}</span>
                    <span className={cn("font-syne font-bold text-base leading-none mt-0.5", isToday ? "text-accent" : "text-brand-900")}>{day.getDate()}</span>
                  </div>
                  <div
                    className="relative cursor-cell"
                    style={{ height: hours.length * PX_PER_HOUR }}
                    onClick={(e) => clickEmpty(e, key)}
                    role="presentation"
                  >
                    {hours.map((h, i) => (
                      <div key={h} className="absolute left-0 right-0 border-t border-[#f5f3ef] pointer-events-none" style={{ top: i * PX_PER_HOUR }} />
                    ))}
                    {isToday && (
                      <div className="absolute left-0 right-0 flex items-center z-10 pointer-events-none" style={{ top: (today.getHours() * 60 + today.getMinutes() - startHour * 60) * PX_PER_MIN }}>
                        <div className="w-2 h-2 rounded-full bg-accent -ml-1 flex-shrink-0" />
                        <div className="flex-1 h-px bg-accent" />
                      </div>
                    )}
                    {laid.map(({ a, start, lane, lanes }) => {
                      const height = Math.max(a.duration * PX_PER_MIN, 28);
                      const dim = a.status === "cancelled" || a.status === "no-show";
                      return (
                        <button
                          key={a.id}
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setOpen(a); }}
                          aria-label={`${a.clientName}, ${a.serviceName}, ${a.time}`}
                          className={cn("absolute rounded-lg px-1.5 py-1 text-left hover:brightness-95 transition-all z-20 overflow-hidden", dim && "opacity-50")}
                          style={{
                            top: (start - startHour * 60) * PX_PER_MIN,
                            height,
                            left: `calc(${(lane / lanes) * 100}% + 2px)`,
                            width: `calc(${100 / lanes}% - 4px)`,
                            background: a.color + "22",
                            borderLeft: `3px solid ${a.color}`,
                          }}
                        >
                          <div className={cn("text-[11px] font-bold leading-tight truncate", dim && "line-through")} style={{ color: a.color }}>{a.clientName}</div>
                          {height > 36 && <div className="text-[10px] truncate" style={{ color: a.color + "bb" }}>{a.serviceName}</div>}
                          {height > 52 && !filterStaff && a.staffName && a.staffName !== "—" && <div className="text-[10px] truncate text-[#6b6b80]">{a.staffName}</div>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="px-4 sm:px-6 py-3 border-t border-[#f0ede8] flex items-center gap-4 flex-wrap">
          <span className="text-xs font-semibold text-[#6b6b80]">Staff:</span>
          {staff.map((s) => (
            <div key={s.id} className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full" style={{ background: s.color }} />
              <span className="text-xs text-[#6b6b80]">{s.name}</span>
            </div>
          ))}
        </div>
      </Card>

      <AppointmentDetailModal appt={open} onClose={() => setOpen(null)} staff={staff} onChanged={refresh} />
      <NewAppointmentModal isOpen={!!creating} onClose={() => setCreating(null)} services={services} staff={staff} initial={creating ?? undefined} onCreated={refresh} />
    </DashboardLayout>
  );
}
