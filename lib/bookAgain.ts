// "Book another appointment": remember, in this browser tab only, who just booked and what, so the
// next booking starts filled in. Nothing personal goes in the URL, and nothing here reaches the
// server: the dates a person already holds are known from their own bookings made in this tab; the
// server still refuses a real duplicate whatever the browser says.
import { normalizeName } from "@/lib/patients";

export interface BookerDetails { name: string; email: string; phone: string }

/** A booking made in this tab, kept to grey out dates the booker already holds. */
export interface MyBooking {
  /** YYYY-MM-DD in the business's calendar. */
  date: string;
  patient: string;
  /** "Token #5" or the slot time, shown as "You already have <label> on this day". */
  label: string;
  tokenSessionId?: string;
  /** What was booked, so "book another" can start from it. */
  serviceIds?: string[];
  staffId?: string | null;
  /** Set for paid bookings: they count only once the payment is confirmed. */
  orderId?: string;
  confirmed: boolean;
}

export type AgainMode = "same" | "other";

/** What the next booking starts with. "same": myself, another date. "other": someone else, date filled in. */
export interface AgainIntent { mode: AgainMode; serviceIds: string[]; staffId: string | null; date: string }

const bookerKey = (slug: string) => `calvy:booker:${slug}`;
const mineKey = (slug: string) => `calvy:mine:${slug}`;
const againKey = (slug: string) => `calvy:again:${slug}`;
const MAX_KEPT = 50;

function read<T>(key: string): T | null {
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null; // blocked storage or garbage: start empty
  }
}
function write(key: string, value: unknown | null): void {
  try {
    if (value === null) sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private mode or blocked storage: the next booking simply starts empty.
  }
}

export function saveBooker(slug: string, d: BookerDetails): void { write(bookerKey(slug), d); }

export function loadBooker(slug: string): BookerDetails | null {
  const d = read<Partial<BookerDetails>>(bookerKey(slug));
  return d && typeof d.email === "string" ? { name: String(d.name ?? ""), email: d.email, phone: String(d.phone ?? "") } : null;
}

export function saveAgain(slug: string, intent: AgainIntent): void { write(againKey(slug), intent); }

/** The saved intent, once: it is removed so a later visit starts clean. */
export function takeAgain(slug: string): AgainIntent | null {
  const v = read<Partial<AgainIntent>>(againKey(slug));
  write(againKey(slug), null);
  if (!v || (v.mode !== "same" && v.mode !== "other") || !Array.isArray(v.serviceIds)) return null;
  return {
    mode: v.mode,
    serviceIds: v.serviceIds.filter((s): s is string => typeof s === "string"),
    staffId: typeof v.staffId === "string" ? v.staffId : null,
    date: typeof v.date === "string" ? v.date : "",
  };
}

export function loadMyBookings(slug: string): MyBooking[] {
  const v = read<MyBooking[]>(mineKey(slug));
  return Array.isArray(v) ? v.filter((b) => b && typeof b.date === "string" && typeof b.patient === "string") : [];
}

export function addMyBooking(slug: string, b: MyBooking): void {
  write(mineKey(slug), [...loadMyBookings(slug), b].slice(-MAX_KEPT));
}

/** A paid booking whose payment went through now counts. Returns the booking, if it was kept. */
export function confirmMyBooking(slug: string, orderId: string): MyBooking | null {
  const all = loadMyBookings(slug);
  const hit = all.find((b) => b.orderId === orderId) ?? null;
  if (hit && !hit.confirmed) write(mineKey(slug), all.map((b) => (b === hit ? { ...b, confirmed: true } : b)));
  return hit;
}

/** Find a kept booking by its order id (the paid confirmation page shows who it was for). */
export function findMyBooking(slug: string, orderId: string): MyBooking | null {
  return loadMyBookings(slug).find((b) => b.orderId === orderId) ?? null;
}

const isMe = (b: MyBooking, bookerName: string) => !!normalizeName(bookerName) && normalizeName(b.patient) === normalizeName(bookerName);

/** Slot businesses: dates (YYYY-MM-DD) on which the booker already holds a booking for themselves, with its label. */
export function datesBookerHolds(bookings: MyBooking[], bookerName: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const b of bookings) if (b.confirmed && !b.tokenSessionId && isMe(b, bookerName)) out[b.date] = b.label;
  return out;
}

/** Token businesses: sessions on one date in which the booker already holds a token for themselves. */
export function sessionsBookerHolds(bookings: MyBooking[], bookerName: string, date: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const b of bookings) if (b.confirmed && b.tokenSessionId && b.date === date && isMe(b, bookerName)) out[b.tokenSessionId] = b.label;
  return out;
}
