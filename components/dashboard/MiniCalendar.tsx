"use client";
import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { cn } from "@/lib/utils";

const DAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

export function MiniCalendar({ busyDays }: { busyDays: number[] }) {
  const now = new Date();
  const [date, setDate] = useState(now);
  const year = date.getFullYear();
  const month = date.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayDay = now.getDate();
  const isCurrentMonth = now.getFullYear() === year && now.getMonth() === month;

  const cells: (number | null)[] = [...Array(firstDay).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{MONTHS[month]} {year}</CardTitle>
        <div className="flex gap-1">
          <button onClick={() => setDate(new Date(year, month - 1))} className="w-7 h-7 rounded-lg flex items-center justify-center text-[#6b6b80] hover:bg-[#f8f7f4] transition-colors"><ChevronLeft size={14} /></button>
          <button onClick={() => setDate(new Date(year, month + 1))} className="w-7 h-7 rounded-lg flex items-center justify-center text-[#6b6b80] hover:bg-[#f8f7f4] transition-colors"><ChevronRight size={14} /></button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-7 gap-0.5">
          {DAYS.map((d) => <div key={d} className="text-center text-[10px] font-semibold text-[#6b6b80] py-1">{d}</div>)}
          {cells.map((day, i) => {
            const isToday = isCurrentMonth && day === todayDay;
            const isBusy = day !== null && busyDays.includes(day);
            return (
              <div key={i} className={cn("aspect-square flex flex-col items-center justify-center rounded-lg text-xs relative cursor-pointer transition-all duration-150", day === null && "pointer-events-none", isToday && "bg-[#0f0f1a] text-white font-bold", !isToday && day && "hover:bg-[#f8f7f4] text-brand-800", isBusy && !isToday && "font-medium")}>
                {day}
                {isBusy && <div className={cn("absolute bottom-0.5 w-1 h-1 rounded-full", isToday ? "bg-accent" : "bg-accent/50")} />}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
