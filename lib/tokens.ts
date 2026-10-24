import { z } from "zod";
import { timeField } from "@/lib/validation/common";
import { addDays, weekdayOf } from "@/lib/time";

/** Session fields the capacity and overlap maths need. Times are minutes since local midnight. */
export interface SessionLike {
  id?: string;
  name: string;
  /** null = business-wide queue; a staff id = that staff member's own queue. */
  staffId: string | null;
  /** 0 = Sunday .. 6 = Saturday. */
  weekdays: number[];
  startMin: number;
  endMin: number;
  minutesPerToken: number;
  isActive: boolean;
}

/** Appointments a session can take in one day: floor((end - start) / minutesPerToken). */
export function sessionCapacity(s: Pick<SessionLike, "startMin" | "endMin" | "minutesPerToken">): number {
  if (s.minutesPerToken <= 0 || s.endMin <= s.startMin) return 0;
  return Math.floor((s.endMin - s.startMin) / s.minutesPerToken);
}

/** Total appointments all active sessions can take on one weekday (each staff queue counts on its own). */
export function dayCapacity(sessions: SessionLike[], weekday: number): number {
  return sessions
    .filter((s) => s.isActive && s.weekdays.includes(weekday))
    .reduce((sum, s) => sum + sessionCapacity(s), 0);
}

/** "10:00" -> 600. */
export function hhmmToMin(v: string): number {
  const [h, m] = v.split(":").map(Number);
  return h * 60 + m;
}

/** 600 -> "10:00". */
export function minToHhmm(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}

/** "Morning 10:00-14:00 @ 15 min = 16 appointments". `unit` is the plural term for the business. */
export function describeSession(s: SessionLike, unit = "appointments"): string {
  const n = sessionCapacity(s);
  return `${s.name} ${minToHhmm(s.startMin)}-${minToHhmm(s.endMin)} @ ${s.minutesPerToken} min = ${n} ${n === 1 ? unit.replace(/s$/, "") : unit}`;
}

/**
 * Two sessions clash when they share a queue (same staffId, or both business-wide), run on a
 * common weekday and their time ranges intersect. Only active sessions clash; touching ranges
 * (one ends when the next starts) are fine.
 */
export function sessionsOverlap(a: SessionLike, b: SessionLike): boolean {
  if (!a.isActive || !b.isActive) return false;
  if (a.staffId !== b.staffId) return false;
  if (!a.weekdays.some((d) => b.weekdays.includes(d))) return false;
  return a.startMin < b.endMin && b.startMin < a.endMin;
}

/** The first existing session (other than `candidate` itself) that `candidate` clashes with. */
export function findOverlap<T extends SessionLike>(candidate: SessionLike, existing: T[]): T | null {
  return existing.find((e) => (!candidate.id || e.id !== candidate.id) && sessionsOverlap(candidate, e)) ?? null;
}

/**
 * A business runs ONE kind of queue: either business-wide sessions (no staff) or per-staff
 * sessions, never both. Returns the error message when `candidate` would mix them, else null.
 * Inactive sessions count, so switching kinds means deleting the old sessions first.
 */
export function queueKindConflict(candidate: SessionLike, existing: SessionLike[]): string | null {
  const others = existing.filter((e) => !candidate.id || e.id !== candidate.id);
  if (candidate.staffId === null && others.some((e) => e.staffId !== null)) {
    return "Sessions are set up per staff member. Delete those first to use one business-wide queue.";
  }
  if (candidate.staffId !== null && others.some((e) => e.staffId === null)) {
    return "Sessions are business-wide. Delete those first to give each staff member their own sessions.";
  }
  return null;
}

export const tokenSessionInputSchema = z
  .object({
    name: z.string().trim().min(1, "Give the session a name").max(60),
    staffId: z.string().trim().min(1).max(64).nullable(),
    weekdays: z.array(z.number().int().min(0).max(6)).min(1, "Pick at least one day").max(7),
    startTime: timeField,
    endTime: timeField,
    minutesPerToken: z.number().int().min(1, "Minutes per appointment must be at least 1").max(240),
    isActive: z.boolean().default(true),
  })
  .refine((v) => hhmmToMin(v.endTime) > hhmmToMin(v.startTime), { message: "End time must be after start time", path: ["endTime"] })
  .refine((v) => hhmmToMin(v.endTime) - hhmmToMin(v.startTime) >= v.minutesPerToken, {
    message: "The session is shorter than one appointment",
    path: ["minutesPerToken"],
  });
export type TokenSessionInput = z.infer<typeof tokenSessionInputSchema>;

/** Validated input -> the stored shape (deduped, sorted weekdays; minutes since midnight). */
export function toSessionFields(input: TokenSessionInput): Omit<SessionLike, "id"> {
  return {
    name: input.name,
    staffId: input.staffId,
    weekdays: [...new Set(input.weekdays)].sort((x, y) => x - y),
    startMin: hhmmToMin(input.startTime),
    endMin: hhmmToMin(input.endTime),
    minutesPerToken: input.minutesPerToken,
    isActive: input.isActive,
  };
}

/* ── Booking: numbering, ETA, capacity ───────────────────────────────── */

export interface TokenAssignment {
  /** 1-based token number within (session, date). */
  number: number;
  /** Minutes since local midnight: session start + (n - 1) x minutesPerToken. */
  estimatedMin: number;
}

/**
 * The next token for a session on a day, given the highest number ever issued there. Numbers are
 * never reused (a cancelled token keeps its number), so capacity counts every number issued.
 * Returns null when the session is full.
 */
export function assignToken(
  s: Pick<SessionLike, "startMin" | "endMin" | "minutesPerToken">,
  lastNumber: number,
): TokenAssignment | null {
  const number = lastNumber + 1;
  if (number > sessionCapacity(s)) return null;
  return { number, estimatedMin: s.startMin + (number - 1) * s.minutesPerToken };
}

/** Tokens still available ("~N left"). */
export function tokensLeft(s: Pick<SessionLike, "startMin" | "endMin" | "minutesPerToken">, lastNumber: number): number {
  return Math.max(0, sessionCapacity(s) - lastNumber);
}

/**
 * Storage used by issueToken. `run` must execute `fn` serialised per `key` (an advisory lock
 * inside a DB transaction), so two bookings for one (session, date) never see the same last number.
 */
export interface TokenStore<Tx> {
  run<R>(key: string, fn: (tx: Tx) => Promise<R>): Promise<R>;
  lastNumber(tx: Tx): Promise<number>;
}

export type IssueResult<R> = { ok: true; assignment: TokenAssignment; value: R } | { ok: false };

/** Take the next token for (session, date) and run `write` (the insert) in the same locked transaction. */
export async function issueToken<Tx, R>(
  store: TokenStore<Tx>,
  session: Pick<SessionLike, "startMin" | "endMin" | "minutesPerToken"> & { id: string },
  dateStr: string,
  write: (tx: Tx, assignment: TokenAssignment) => Promise<R>,
): Promise<IssueResult<R>> {
  return store.run(`token:${session.id}:${dateStr}`, async (tx) => {
    const assignment = assignToken(session, await store.lastNumber(tx));
    if (!assignment) return { ok: false as const };
    return { ok: true as const, assignment, value: await write(tx, assignment) };
  });
}

export interface OpenSession { date: string; session: SessionLike & { id: string } }

/**
 * First session with room, scanning `days` days from `startDate` in the same queue as `queueStaffId`.
 * `lastNumbers` maps `${sessionId}|${date}` to the highest issued number. On the start date, sessions
 * that already ended (`nowMin`) and `skipId` are ignored.
 */
export function findNextOpen(args: {
  sessions: (SessionLike & { id: string })[];
  queueStaffId: string | null;
  startDate: string;
  days: number;
  lastNumbers: Record<string, number>;
  nowMin: number | null;
  skipId?: string;
}): OpenSession | null {
  let date = args.startDate;
  for (let i = 0; i < args.days; i++) {
    const weekday = weekdayOf(date);
    const open = args.sessions
      .filter((s) => s.isActive && s.staffId === args.queueStaffId && s.weekdays.includes(weekday))
      .filter((s) => !(i === 0 && (s.id === args.skipId || (args.nowMin !== null && s.endMin <= args.nowMin))))
      .sort((a, b) => a.startMin - b.startMin)
      .find((s) => tokensLeft(s, args.lastNumbers[`${s.id}|${date}`] ?? 0) > 0);
    if (open) return { date, session: open };
    date = addDays(date, 1);
  }
  return null;
}
