import type { PrismaClient } from "@prisma/client";
import { loadNextSlots } from "@/lib/availability";
import { addDays, parseYMD } from "@/lib/time";

export interface FreeSlot { date: string; time: string; spots?: number }

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Today", "Tomorrow", otherwise "Wed 28 Oct". Dates are YYYY-MM-DD in the business timezone. */
export function dayLabel(date: string, today: string): string {
  if (date === today) return "Today";
  if (date === addDays(today, 1)) return "Tomorrow";
  const ymd = parseYMD(date);
  if (!ymd) return date;
  const dow = new Date(Date.UTC(ymd.y, ymd.m - 1, ymd.d)).getUTCDay();
  return `${DAYS[dow]} ${ymd.d} ${MONTHS[ymd.m - 1]}`;
}

/** "16:30" to "4:30 PM". Anything that is not HH:MM comes back unchanged. */
export function timeLabel(hhmm: string): string {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm);
  if (!m) return hhmm;
  const h = Number(m[1]);
  return `${h % 12 === 0 ? 12 : h % 12}:${m[2]} ${h >= 12 ? "PM" : "AM"}`;
}

/** Resolves to `fallback` if the work takes longer than `ms`, so a slow lookup never holds up a page. */
export async function withTimeout<T>(work: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const slow = new Promise<T>((resolve) => { timer = setTimeout(() => resolve(fallback), ms); });
  try { return await Promise.race([work, slow]); } finally { if (timer) clearTimeout(timer); }
}

/**
 * The next bookable start times for one service, from the same engine the booking page uses (opening
 * hours, staff, existing bookings, notice and advance rules): up to `perDay` per day, `limit` in all,
 * over the next two weeks. Returns [] when nothing is bookable.
 */
export async function loadNextFreeSlots(
  db: PrismaClient,
  q: { businessId: string; serviceId: string; now?: number; limit?: number; perDay?: number },
): Promise<FreeSlot[]> {
  const r = await loadNextSlots(db, q);
  return r.ok ? r.slots : [];
}
