// Pure helpers for the customer dashboard's level hero, stamps and referral card (no React, no database). Everything the customer reads here is
// worded WITHOUT amounts: the fee is "nominal", never a number. The only place an amount appears is checkout, where the exact charge must be shown.
import { LEVELS, LEVEL_LABEL, levelIndex, type LevelId } from "@/lib/rewards/levels";

export type LadderState = "done" | "current" | "next" | "locked";
export interface LadderStep { id: LevelId; label: string; state: LadderState }

/** The five steps with where the customer is: past levels ticked, the current one highlighted, the rest muted (the next one marked as the goal). */
export function ladderSteps(current: LevelId): LadderStep[] {
  const at = levelIndex(current);
  return LEVELS.map((id, i) => ({ id, label: LEVEL_LABEL[id], state: i < at ? "done" : i === at ? "current" : i === at + 1 ? "next" : "locked" }));
}

/** Plain words for the progress bar. Never a number, never what is left to do. */
export function progressWords(ratio: number, atTop: boolean): string {
  if (atTop) return "You're at the top level";
  const r = Number.isFinite(ratio) ? Math.min(1, Math.max(0, ratio)) : 0;
  if (r < 0.2) return "Just getting started";
  if (r < 0.45) return "Making progress";
  if (r < 0.7) return "Halfway there";
  if (r < 0.9) return "Getting close";
  return "Almost there";
}

/** Bar width in whole percent, kept visible (never a bare sliver, never a full bar before the level is reached). */
export function barPercent(ratio: number, atTop: boolean): number {
  if (atTop) return 100;
  const r = Number.isFinite(ratio) ? Math.min(1, Math.max(0, ratio)) : 0;
  return Math.min(96, Math.max(6, Math.round(r * 100)));
}

/**
 * The fee lines of the level hero. They appear ONLY for someone who has booked at a business that charges Calvy's nominal confirmation fee
 * (India, Free plan). Everyone else sees the level, perks and progress and nothing about a fee. No line ever carries an amount.
 */
export function feeLines(level: LevelId, feeApplies: boolean): string[] {
  if (!feeApplies) return [];
  return level === "STARTER" ? ["Your nominal fee drops as you level up."] : ["Lower nominal fee unlocked.", "Your nominal fee drops as you level up."];
}

/** Seven stamp dots: filled = an attended visit. */
export function stampDots(done: number, of: number): boolean[] {
  const n = Math.max(1, Math.floor(of));
  const d = Math.min(n, Math.max(0, Math.floor(done)));
  return Array.from({ length: n }, (_, i) => i < d);
}

export const STREAK_COPY = (months: number): string =>
  months <= 0 ? "Visit this month to start a streak." : months === 1 ? "1-month streak. Visit next month to keep it going." : `${months}-month streak. Keep it going.`;

/** Share a link with the Web Share API, or copy it when the browser has none. Returns what happened so the card can say so. */
export async function shareOrCopy(
  text: { title: string; text: string; url: string },
  env: { share?: (d: { title: string; text: string; url: string }) => Promise<void>; copy?: (s: string) => Promise<void> },
): Promise<"shared" | "copied" | "failed" | "cancelled"> {
  if (env.share) {
    try { await env.share(text); return "shared"; }
    catch (err) { if (err instanceof Error && err.name === "AbortError") return "cancelled"; /* any other failure: fall back to copying */ }
  }
  if (env.copy) {
    try { await env.copy(text.url); return "copied"; } catch { return "failed"; }
  }
  return "failed";
}

/** One line of rules, without amounts. */
export const REFERRAL_RULE = "When your friend attends their first visit, you both get a free booking confirmation (limited per month).";
