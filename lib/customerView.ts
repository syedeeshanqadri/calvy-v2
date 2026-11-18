// What /account shows (pure): bookings split into upcoming and past, and the businesses where a kept Rs 10 fee is still valid.
import { beforeCancellationCutoff } from "@/lib/holds";

export interface BookingRow {
  id: string;
  date: Date;
  status: string;
  holdExpiresAt?: Date | null;
}

const LIVE = ["confirmed", "pending", "pending_payment"];

/** Upcoming: not yet over and still active (a pending payment only while its hold is live). Newest past first. */
export function splitBookings<T extends BookingRow>(rows: T[], now: Date = new Date()): { upcoming: T[]; past: T[] } {
  const upcoming: T[] = [];
  const past: T[] = [];
  for (const r of rows) {
    const live = LIVE.includes(r.status) && !(r.status === "pending_payment" && !(r.holdExpiresAt && r.holdExpiresAt.getTime() > now.getTime()));
    (live && r.date.getTime() >= now.getTime() ? upcoming : past).push(r);
  }
  upcoming.sort((a, b) => a.date.getTime() - b.date.getTime());
  past.sort((a, b) => b.date.getTime() - a.date.getTime());
  return { upcoming, past };
}

export interface WaiverRow { businessId: string; businessName: string; businessSlug: string }
export interface Waiver { businessId: string; businessName: string; businessSlug: string }

/** One entry per business where the customer still has a valid (unused) kept confirmation fee. */
export function waiversByBusiness(rows: WaiverRow[]): Waiver[] {
  const by = new Map<string, Waiver>();
  for (const r of rows) if (!by.has(r.businessId)) by.set(r.businessId, { businessId: r.businessId, businessName: r.businessName, businessSlug: r.businessSlug });
  return [...by.values()].sort((a, b) => a.businessName.localeCompare(b.businessName));
}

/* ── Self-service changes (cancel, reschedule) ───────────────────────────── */

export type ManageCode = "STATUS" | "PAST" | "TOKEN" | "CUTOFF";
export type ManageCheck = { ok: true } | { ok: false; code: ManageCode; reason: string };

/**
 * May the customer cancel or move this booking themselves? Only a live, future booking, and only before the
 * business's cutoff (cancellationCutoffHours before the start; 0 = until it starts). A queue token qualifies
 * while it is still waiting (not called, served or closed); its start is the estimated turn.
 */
export function manageability(
  a: { status: string; date: Date; tokenNumber?: number | null; queueState?: string | null; business: { cancellationCutoffHours: number; name?: string } },
  now: Date = new Date(),
): ManageCheck {
  if (!["confirmed", "pending"].includes(a.status)) return { ok: false, code: "STATUS", reason: "This booking can no longer be changed." };
  if (a.tokenNumber && a.queueState && a.queueState !== "WAITING") return { ok: false, code: "STATUS", reason: "This token is already being handled at the front desk." };
  if (a.date.getTime() <= now.getTime()) return { ok: false, code: "PAST", reason: "This appointment has already started." };
  const hours = a.business.cancellationCutoffHours ?? 0;
  if (!beforeCancellationCutoff(a.date, hours, now)) {
    return { ok: false, code: "CUTOFF", reason: `Changes close ${hours} hour${hours === 1 ? "" : "s"} before the appointment. Please contact ${a.business.name ?? "the business"}.` };
  }
  return { ok: true };
}

/** A queue token moves to another day at most once (the move itself is checked by manageability first). */
export function tokenMoveBlocker(a: { tokenNumber?: number | null; carriedFromId?: string | null }): string | null {
  if (!a.tokenNumber) return null;
  if (a.carriedFromId) return "This token was already moved once. Please contact the business to change it again.";
  return null;
}

/* ── Overview: numbers and updates ───────────────────────────────────────── */

export interface UpdateItem { id: string; tone: "info" | "good" | "warn" | "muted"; title: string; detail: string; at: Date }

interface UpdateRow { id: string; date: Date; status: string; businessName: string; serviceName: string; isOnline?: boolean }
const DAY = 24 * 3_600_000;

/**
 * A short feed of what changed or is coming, built from the bookings themselves (there is no separate
 * notification store): appointments in the next 24 hours, recent cancellations and completed visits,
 * and a kept confirmation fee. Newest and most urgent first, at most `limit`.
 */
export function buildUpdates(rows: UpdateRow[], waivers: Waiver[], now: Date = new Date(), limit = 6): UpdateItem[] {
  const out: UpdateItem[] = [];
  for (const r of rows) {
    const dt = r.date.getTime() - now.getTime();
    if (["confirmed", "pending"].includes(r.status) && dt >= 0 && dt <= DAY) {
      out.push({ id: `soon-${r.id}`, tone: "info", at: r.date, title: `${r.serviceName} is coming up`, detail: `${r.businessName}${r.isOnline ? " · online" : ""}` });
    } else if (r.status === "cancelled" && Math.abs(dt) <= 30 * DAY) {
      out.push({ id: `cx-${r.id}`, tone: "warn", at: r.date, title: `${r.serviceName} was cancelled`, detail: r.businessName });
    } else if (r.status === "completed" && dt < 0 && dt >= -14 * DAY) {
      out.push({ id: `done-${r.id}`, tone: "good", at: r.date, title: `${r.serviceName} completed`, detail: `Thanks for visiting ${r.businessName}` });
    }
  }
  for (const w of waivers) {
    out.push({ id: `wal-${w.businessId}`, tone: "good", at: now, title: "Your Rs 10 confirmation is still valid", detail: `Rebook once at ${w.businessName} without paying it again` });
  }
  const rank = (u: UpdateItem) => (u.tone === "info" ? 0 : u.tone === "warn" ? 1 : 2);
  return out.sort((a, b) => rank(a) - rank(b) || b.at.getTime() - a.at.getTime()).slice(0, limit);
}

export interface OverviewStats { upcoming: number; completed: number; businesses: number; next: Date | null }

export function buildStats(upcoming: { date: Date }[], past: { status: string; business?: { slug: string } }[], allBusinessSlugs: string[]): OverviewStats {
  return {
    upcoming: upcoming.length,
    completed: past.filter((p) => p.status === "completed").length,
    businesses: new Set(allBusinessSlugs).size,
    next: upcoming[0]?.date ?? null,
  };
}
