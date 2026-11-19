// Calvy Levels (pure, no database). A level lowers Calvy's own confirmation fee (the Rs 10 that exists only on Basic, India).
//  - Earned from ATTENDED DAYS (one per day per booker), attended referrals and months of activity, inside windows that an admin can edit.
//  - Fast-track: enough attended days in one calendar month lifts a customer one level (at most one boost a month, never above `maxLevel`,
//    which keeps Legend fully earned).
//  - Retention: a level is held for `retentionDays` after the last attended visit, then drops one level per `retentionDays` of inactivity.
//  - Every threshold, window and fee lives in LevelConfigData (Admin -> Rewards), so nothing here needs a deploy to change.
import { z } from "zod";

export const LEVELS = ["STARTER", "REGULAR", "INSIDER", "PRO", "LEGEND"] as const;
export type LevelId = (typeof LEVELS)[number];
export type EarnedLevelId = Exclude<LevelId, "STARTER">;
export const LEVEL_LABEL: Record<LevelId, string> = { STARTER: "Starter", REGULAR: "Regular", INSIDER: "Insider", PRO: "Pro", LEGEND: "Legend" };

export const levelIndex = (l: LevelId): number => LEVELS.indexOf(l);
export const isLevel = (v: unknown): v is LevelId => typeof v === "string" && (LEVELS as readonly string[]).includes(v);
export const levelAt = (i: number): LevelId => LEVELS[Math.max(0, Math.min(LEVELS.length - 1, i))];
export const higherLevel = (a: LevelId, b: LevelId): LevelId => (levelIndex(a) >= levelIndex(b) ? a : b);

/** One way to reach a level: ALL parts must hold (days inside the window, referrals, consecutive active months). A level may offer several ways. */
export interface Alternative { days: number; windowDays: number; referrals: number; months: number }
export interface LevelRule { feeMinor: number; alternatives: Alternative[] }
export interface LevelConfigData {
  /** The fee never goes below this, whatever an admin types for a level. */
  floorMinor: number;
  retentionDays: number;
  fastTrack: { daysInMonth: number; maxLevel: LevelId };
  levels: Record<EarnedLevelId, LevelRule>;
}

export const DEFAULT_LEVEL_CONFIG: LevelConfigData = {
  floorMinor: 600,
  retentionDays: 90,
  fastTrack: { daysInMonth: 10, maxLevel: "PRO" },
  levels: {
    REGULAR: { feeMinor: 900, alternatives: [{ days: 7, windowDays: 90, referrals: 0, months: 0 }, { days: 3, windowDays: 90, referrals: 1, months: 0 }] },
    INSIDER: { feeMinor: 800, alternatives: [{ days: 14, windowDays: 90, referrals: 1, months: 0 }] },
    PRO: { feeMinor: 700, alternatives: [{ days: 21, windowDays: 180, referrals: 2, months: 3 }] },
    LEGEND: { feeMinor: 600, alternatives: [{ days: 36, windowDays: 180, referrals: 3, months: 6 }] },
  },
};

const altSchema = z.object({
  days: z.number().int().min(0).max(1000),
  windowDays: z.number().int().min(1).max(730),
  referrals: z.number().int().min(0).max(100),
  months: z.number().int().min(0).max(36),
}).refine((a) => a.days + a.referrals + a.months > 0, "Each way up needs at least one requirement");
const ruleSchema = z.object({ feeMinor: z.number().int().min(100).max(1_000_000), alternatives: z.array(altSchema).min(1).max(3) });

/** The admin's edit, checked: fees fall as levels rise and never go below the floor; Legend can never be fast-tracked. */
export const levelConfigSchema = z.object({
  floorMinor: z.number().int().min(100).max(1_000_000),
  retentionDays: z.number().int().min(30).max(365),
  fastTrack: z.object({ daysInMonth: z.number().int().min(2).max(31), maxLevel: z.enum(["REGULAR", "INSIDER", "PRO"]) }),
  levels: z.object({ REGULAR: ruleSchema, INSIDER: ruleSchema, PRO: ruleSchema, LEGEND: ruleSchema }),
}).superRefine((c, ctx) => {
  const order: EarnedLevelId[] = ["REGULAR", "INSIDER", "PRO", "LEGEND"];
  for (let i = 0; i < order.length; i++) {
    const fee = c.levels[order[i]].feeMinor;
    if (fee < c.floorMinor) ctx.addIssue({ code: "custom", path: ["levels", order[i], "feeMinor"], message: "Below the fee floor" });
    if (i > 0 && fee > c.levels[order[i - 1]].feeMinor) ctx.addIssue({ code: "custom", path: ["levels", order[i], "feeMinor"], message: "A higher level cannot cost more than a lower one" });
  }
});

/** A stored or typed config, or the defaults when it is missing or no longer valid (a bad row must never stop a booking). */
export function parseLevelConfig(raw: unknown): LevelConfigData {
  const r = levelConfigSchema.safeParse(raw);
  return r.success ? (r.data as LevelConfigData) : DEFAULT_LEVEL_CONFIG;
}

// ── History ──
export interface History {
  /** Attended days ("YYYY-MM-DD", business-local), one per day per booker. */
  days: string[];
  /** Referred friends who attended their first visit (rewarded, or capped for the referrer that month). */
  referralsAttended: number;
}

const DAY_MS = 86_400_000;
const dayNumber = (day: string) => Math.floor(Date.parse(`${day}T00:00:00Z`) / DAY_MS);
const monthOfDay = (day: string) => day.slice(0, 7);

/** Attended days in the `windowDays` up to and including `today`. */
export function daysInWindow(days: string[], today: string, windowDays: number): number {
  const end = dayNumber(today);
  const start = end - windowDays + 1;
  return [...new Set(days)].filter((d) => { const n = dayNumber(d); return n >= start && n <= end; }).length;
}

const monthNumber = (m: string) => Number(m.slice(0, 4)) * 12 + (Number(m.slice(5, 7)) - 1);

/**
 * Consecutive calendar months with an attended day, counted back from this month (or last month, so a customer is not "broken" on the 1st
 * before their next visit). 0 when neither month has a visit.
 */
export function streakMonths(days: string[], today: string): number {
  const months = new Set(days.map(monthOfDay));
  let m = monthNumber(monthOfDay(today));
  const has = (n: number) => months.has(`${Math.floor(n / 12)}-${String((n % 12) + 1).padStart(2, "0")}`);
  if (!has(m)) m -= 1;
  let n = 0;
  while (has(m)) { n++; m--; }
  return n;
}

export function meets(a: Alternative, h: History, today: string): boolean {
  return daysInWindow(h.days, today, a.windowDays) >= a.days && h.referralsAttended >= a.referrals && streakMonths(h.days, today) >= a.months;
}

/** The highest level whose requirements are met by any one of its ways up. Starter when none. */
export function earnedLevel(h: History, cfg: LevelConfigData, today: string): LevelId {
  for (const id of [...LEVELS].reverse()) {
    if (id === "STARTER") break;
    if (cfg.levels[id].alternatives.some((a) => meets(a, h, today))) return id;
  }
  return "STARTER";
}

// ── Retention ──
/** The level a customer holds now: kept for `retentionDays` after the last attended visit, then one level lower per further `retentionDays`. */
export function heldLevel(level: LevelId, lastAttendedAt: Date | null, now: Date, retentionDays: number): LevelId {
  if (level === "STARTER" || !lastAttendedAt) return level;
  const idle = Math.floor((now.getTime() - lastAttendedAt.getTime()) / DAY_MS);
  const drops = Math.max(0, Math.ceil(idle / retentionDays) - 1);
  return levelAt(levelIndex(level) - drops);
}

// ── Fast-track ──
/** True when this calendar month has enough attended days to earn a boost. */
export function fastTrackReached(days: string[], today: string, cfg: LevelConfigData): boolean {
  const m = monthOfDay(today);
  return new Set(days.filter((d) => monthOfDay(d) === m)).size >= cfg.fastTrack.daysInMonth;
}

/** One level up, but never past `maxLevel` (Legend is never fast-tracked). Returns the same level when it cannot lift. */
export function boostedLevel(level: LevelId, cfg: LevelConfigData): LevelId {
  const cap = levelIndex(cfg.fastTrack.maxLevel);
  return levelIndex(level) >= cap ? level : levelAt(levelIndex(level) + 1);
}

// ── Fee ──
/** The fee at this level, in minor units: never above the plan's own fee, never below the floor. Starter pays the plan's fee. */
export function levelFee(level: LevelId, baseFeeMinor: number, cfg: LevelConfigData): number {
  if (level === "STARTER" || baseFeeMinor <= 0) return Math.max(0, baseFeeMinor);
  return Math.min(baseFeeMinor, Math.max(cfg.levels[level].feeMinor, cfg.floorMinor));
}

// ── Perks ──
/** Pro and Legend: one free Rs 10 per calendar quarter, which ends with the quarter. */
export const hasQuarterlyPerk = (l: LevelId): boolean => l === "PRO" || l === "LEGEND";
/** Insider and above get one free booking the first time the level is reached (once per person; see TierGrant). */
export const GIFT_LEVEL: LevelId = "INSIDER";
export const earnsGift = (l: LevelId): boolean => levelIndex(l) >= levelIndex(GIFT_LEVEL);

// ── Progress, without the rules ──
export type ProgressBand = "start" | "building" | "close" | "top";
export interface Progress { next: LevelId | null; ratio: number; band: ProgressBand }

/** How far the best way up is, 0 to 1. Shown as a bar and a phrase; the actual thresholds are never shown to the customer. */
export function progressToNext(level: LevelId, h: History, cfg: LevelConfigData, today: string): Progress {
  const idx = levelIndex(level);
  if (idx >= LEVELS.length - 1) return { next: null, ratio: 1, band: "top" };
  const next = levelAt(idx + 1) as EarnedLevelId;
  let best = 0;
  for (const a of cfg.levels[next].alternatives) {
    const parts: number[] = [];
    if (a.days > 0) parts.push(Math.min(1, daysInWindow(h.days, today, a.windowDays) / a.days));
    if (a.referrals > 0) parts.push(Math.min(1, h.referralsAttended / a.referrals));
    if (a.months > 0) parts.push(Math.min(1, streakMonths(h.days, today) / a.months));
    const ratio = parts.length ? parts.reduce((x, y) => x + y, 0) / parts.length : 0;
    best = Math.max(best, ratio);
  }
  const ratio = Math.round(best * 100) / 100;
  return { next, ratio, band: ratio >= 0.8 ? "close" : ratio >= 0.4 ? "building" : "start" };
}

export const BAND_TEXT: Record<ProgressBand, string> = {
  start: "Every visit counts toward your next level.",
  building: "You're making progress toward your next level.",
  close: "You're close to your next level.",
  top: "You're at the top level.",
};
