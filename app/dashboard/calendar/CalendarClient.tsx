"use client";
import { useState } from "react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight } from "lucide-react";

const HOURS = Array.from({ length: 13 }, (_, i) => i + 8);
const DAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

interface ApptRow { id: string; clientName: string; serviceName: string; date: string; time: string; duration: number; color: string; status: string; }
interface StaffRow { id: string; name: string; color: string; }

function timeToTop(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return ((h - 8) * 60 + m) * (56 / 60);
}
function durationToHeight(minutes: number): number {
  return minutes * (56 / 60);
}

export function CalendarClient({ appointments, staff }: { appointments: ApptRow[]; staff: StaffRow[] }) {
  const [view, setView] = useState<"week" | "day">("week");
  const [currentDate, setCurrentDate] = useState(new Date());

  const weekStart = new Date(currentDate);
  weekStart.setDate(currentDate.getDate() - currentDate.getDay());
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    return d;
  });

  const navigate = (dir: number) => {
    const d = new Date(currentDate);
    d.setDate(d.getDate() + (view === "week" ? dir * 7 : dir));
    setCurrentDate(d);
  };

  const apptsByDay: Record<string, ApptRow[]> = {};
  appointments.forEach((a) => {
    if (!apptsByDay[a.date]) apptsByDay[a.date] = [];
    apptsByDay[a.date].push(a);
  });

  const today = new Date();

  return (
    <DashboardLayout title="Calendar" subtitle="Manage your schedule visually">
      <Card className="overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#f0ede8] flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate(-1)} className="w-8 h-8 rounded-lg border border-[#e8e6e0] flex items-center justify-center text-[#6b6b80] hover:bg-[#f8f7f4] transition-colors"><ChevronLeft size={16} /></button>
            <button onClick={() => navigate(1)} className="w-8 h-8 rounded-lg border border-[#e8e6e0] flex items-center justify-center text-[#6b6b80] hover:bg-[#f8f7f4] transition-colors"><ChevronRight size={16} /></button>
            <h2 className="font-syne font-bold text-base">
              {view === "week"
                ? `${weekDays[0].getDate()} – ${weekDays[6].getDate()} ${MONTHS[weekDays[6].getMonth()]} ${weekDays[6].getFullYear()}`
                : `${DAYS_SHORT[currentDate.getDay()]}, ${MONTHS[currentDate.getMonth()]} ${currentDate.getDate()}, ${currentDate.getFullYear()}`}
            </h2>
            <button onClick={() => setCurrentDate(new Date())} className="text-xs text-accent font-semibold hover:underline">Today</button>
          </div>
          <div className="flex gap-1 bg-[#f8f7f4] rounded-xl p-1">
            {(["week", "day"] as const).map((v) => (
              <button key={v} onClick={() => setView(v)} className={`px-4 py-1.5 rounded-lg text-sm font-medium capitalize transition-all ${view === v ? "bg-white shadow text-brand-900" : "text-[#6b6b80] hover:text-brand-900"}`}>{v}</button>
            ))}
          </div>
        </div>

        <div className="overflow-auto" style={{ maxHeight: "calc(100vh - 260px)" }}>
          <div className="flex">
            <div className="w-14 flex-shrink-0 border-r border-[#f0ede8] pt-12">
              {HOURS.map((h) => (
                <div key={h} className="h-14 flex items-start justify-end pr-2 pt-0">
                  <span className="text-[11px] text-[#6b6b80] -mt-2">{h === 12 ? "12pm" : h > 12 ? `${h-12}pm` : `${h}am`}</span>
                </div>
              ))}
            </div>
            <div className="flex-1 grid" style={{ gridTemplateColumns: view === "week" ? "repeat(7, 1fr)" : "1fr" }}>
              {(view === "week" ? weekDays : [currentDate]).map((day) => {
                const dateStr = `${day.getFullYear()}-${String(day.getMonth()+1).padStart(2,"0")}-${String(day.getDate()).padStart(2,"0")}`;
                const dayAppts = apptsByDay[dateStr] || [];
                const isToday = day.toDateString() === today.toDateString();
                return (
                  <div key={dateStr} className="border-r border-[#f0ede8] last:border-0">
                    <div className={cn("h-12 flex flex-col items-center justify-center border-b border-[#f0ede8] sticky top-0 bg-white z-10", isToday && "bg-[#fafaf8]")}>
                      <span className="text-[11px] font-semibold text-[#6b6b80] uppercase">{DAYS_SHORT[day.getDay()]}</span>
                      <span className={cn("font-syne font-bold text-base leading-none mt-0.5", isToday ? "text-accent" : "text-brand-900")}>{day.getDate()}</span>
                    </div>
                    <div className="relative" style={{ height: HOURS.length * 56 }}>
                      {HOURS.map((h) => (
                        <div key={h} className="absolute left-0 right-0 border-t border-[#f5f3ef]" style={{ top: (h - 8) * 56 }} />
                      ))}
                      {isToday && (
                        <div className="absolute left-0 right-0 flex items-center z-10" style={{ top: timeToTop(`${today.getHours()}:${today.getMinutes()}`) }}>
                          <div className="w-2 h-2 rounded-full bg-accent -ml-1 flex-shrink-0" />
                          <div className="flex-1 h-px bg-accent" />
                        </div>
                      )}
                      {dayAppts.map((appt) => {
                        const top = timeToTop(appt.time);
                        const height = Math.max(durationToHeight(appt.duration), 28);
                        return (
                          <div key={appt.id} className="absolute left-1 right-1 rounded-lg px-2 py-1 cursor-pointer hover:brightness-95 transition-all z-20 overflow-hidden" style={{ top, height, background: appt.color + "22", borderLeft: `3px solid ${appt.color}` }}>
                            <div className="text-[11px] font-bold leading-tight truncate" style={{ color: appt.color }}>{appt.clientName}</div>
                            {height > 36 && <div className="text-[10px] truncate" style={{ color: appt.color + "bb" }}>{appt.serviceName}</div>}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="px-6 py-3 border-t border-[#f0ede8] flex items-center gap-4 flex-wrap">
          <span className="text-xs font-semibold text-[#6b6b80]">Staff:</span>
          {staff.map((s) => (
            <div key={s.id} className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full" style={{ background: s.color }} />
              <span className="text-xs text-[#6b6b80]">{s.name}</span>
            </div>
          ))}
        </div>
      </Card>
    </DashboardLayout>
  );
}
