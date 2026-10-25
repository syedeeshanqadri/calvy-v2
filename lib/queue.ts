// Token queue rules (pure): Next, Not present, Not coming, walk-ins, ETAs.
// Rules: docs/steps-3-5-design.md "Queue actions". The DB layer (lib/queueDb.ts) applies the plans.
import { addDays, weekdayOf } from "@/lib/time";

export type QueueState = "WAITING" | "SERVING" | "DONE" | "NO_SHOW" | "MOVED";

export interface QueueItem {
  id: string;
  tokenNumber: number;
  /** Order in the open queue (null until the first queue action: the token number is the order). */
  position: number | null;
  state: QueueState | null;
  notPresentCount: number;
  /** Set when this booking is itself a carry-over from an earlier day. */
  carriedFromId: string | null;
}

export const stateOf = (i: Pick<QueueItem, "state">): QueueState => i.state ?? "WAITING";
export const isOpen = (i: Pick<QueueItem, "state">) => stateOf(i) === "WAITING" || stateOf(i) === "SERVING";

/** Open tokens in queue order; the one being served is always first. */
export function openQueue<T extends QueueItem>(items: T[]): T[] {
  return items
    .filter(isOpen)
    .sort((a, b) => {
      const sa = stateOf(a) === "SERVING" ? 0 : 1;
      const sb = stateOf(b) === "SERVING" ? 0 : 1;
      return sa - sb || (a.position ?? a.tokenNumber) - (b.position ?? b.tokenNumber) || a.tokenNumber - b.tokenNumber;
    });
}

/**
 * Moves `id` back by `by` places. With fewer than `by` tokens behind it, it goes to the end.
 * [A,B,C,D] move A back 2 -> [B,C,A,D]; [A,B,C] -> [B,C,A].
 */
export function moveBack(order: string[], id: string, by = 2): string[] {
  const idx = order.indexOf(id);
  if (idx === -1) return order;
  const rest = order.filter((x) => x !== id);
  const behind = order.length - 1 - idx;
  const at = behind < by ? rest.length : idx + by;
  return [...rest.slice(0, at), id, ...rest.slice(at)];
}

/** 1-based place in the open queue (people ahead + 1). */
export function placeInLine(order: string[], id: string): number {
  return order.indexOf(id) + 1;
}

export interface ItemUpdate {
  state?: QueueState;
  notPresentCount?: number;
  /** Time the token started being served (null clears it). */
  servingStartedAt?: Date | null;
}

export interface QueuePlan {
  /** Open queue after the action, head first. */
  order: string[];
  updates: Record<string, ItemUpdate>;
  outcome: "advanced" | "moved_back" | "no_show" | "carry_over" | "closed" | "idle";
  /** The token the action was about, when there is one. */
  subjectId?: string;
}

export class QueueActionError extends Error {}

/** Promote the head of the queue to SERVING when nobody is being served. */
function promoteHead(order: string[], updates: Record<string, ItemUpdate>, now: Date): void {
  const head = order[0];
  if (head) updates[head] = { ...updates[head], state: "SERVING", servingStartedAt: now };
}

/** Next: the current token is DONE, the next waiting token starts being served. */
export function planNext(items: QueueItem[], now: Date): QueuePlan {
  const open = openQueue(items);
  const serving = open.find((i) => stateOf(i) === "SERVING");
  const updates: Record<string, ItemUpdate> = {};
  if (serving) updates[serving.id] = { state: "DONE" };
  const remaining = open.filter((i) => i.id !== serving?.id);
  const next = remaining[0];
  if (next) updates[next.id] = { state: "SERVING", servingStartedAt: now };
  if (!serving && !next) return { order: [], updates, outcome: "idle" };
  return { order: remaining.map((i) => i.id), updates, outcome: "advanced", subjectId: serving?.id };
}

/**
 * Not present: the token being served did not show up. First time it moves back 2 places (to the end
 * with fewer than 2 behind) and the next token is called; the second time it is closed as NO_SHOW.
 */
export function planNotPresent(items: QueueItem[], id: string, now: Date): QueuePlan {
  const open = openQueue(items);
  const item = open.find((i) => i.id === id);
  if (!item || stateOf(item) !== "SERVING") throw new QueueActionError("Only the token being served can be marked not present.");
  const count = item.notPresentCount + 1;
  const updates: Record<string, ItemUpdate> = {};

  if (count >= 2) {
    updates[id] = { state: "NO_SHOW", notPresentCount: count };
    const order = open.filter((i) => i.id !== id).map((i) => i.id);
    promoteHead(order, updates, now);
    return { order, updates, outcome: "no_show", subjectId: id };
  }
  updates[id] = { state: "WAITING", notPresentCount: count, servingStartedAt: null };
  const order = moveBack(open.map((i) => i.id), id, 2);
  // The token that moved back must not stay at the head; call whoever is now first.
  if (order[0] !== id) updates[order[0]] = { state: "SERVING", servingStartedAt: now };
  return { order, updates, outcome: "moved_back", subjectId: id };
}

/**
 * Not coming: the customer will not attend. The first time the booking carries over to the next
 * working day; a booking that is already a carry-over is closed (no further carry-over).
 */
export function planNotComing(items: QueueItem[], id: string, now: Date): QueuePlan {
  const open = openQueue(items);
  const item = open.find((i) => i.id === id);
  if (!item) throw new QueueActionError("That token is not in the queue.");
  const wasServing = stateOf(item) === "SERVING";
  const closing = item.carriedFromId !== null;
  const updates: Record<string, ItemUpdate> = { [id]: { state: closing ? "NO_SHOW" : "MOVED" } };
  const order = open.filter((i) => i.id !== id).map((i) => i.id);
  if (wasServing) promoteHead(order, updates, now);
  return { order, updates, outcome: closing ? "closed" : "carry_over", subjectId: id };
}

/** Whether a "Not coming" on this booking carries it over (true) or closes it (false). */
export const canCarryOver = (i: Pick<QueueItem, "carriedFromId">) => i.carriedFromId === null;

/** Walk-in: next token number and the last place in the queue. No fee, no capacity limit (reception decides). */
export function planWalkIn(lastTokenNumber: number, openPositions: number[]): { tokenNumber: number; position: number } {
  return { tokenNumber: lastTokenNumber + 1, position: Math.max(0, ...openPositions) + 1 };
}

/** Open queue positions 1..n in order. */
export function positionsFor(order: string[]): Record<string, number> {
  return Object.fromEntries(order.map((id, i) => [id, i + 1]));
}

/**
 * ETAs for the open queue: max(session start, time the current token started) + k x minutes, where
 * k counts the tokens ahead of it (the token being served counts as one).
 */
export function computeEtas(p: {
  /** Open queue, head first. */
  order: string[];
  servingId: string | null;
  sessionStart: Date;
  servingStartedAt: Date | null;
  minutesPerToken: number;
}): Record<string, Date> {
  const base = Math.max(p.sessionStart.getTime(), p.servingStartedAt?.getTime() ?? p.sessionStart.getTime());
  const out: Record<string, Date> = {};
  let k = p.servingId ? 1 : 0;
  for (const id of p.order) {
    if (id === p.servingId) {
      out[id] = new Date(p.servingStartedAt ?? p.sessionStart);
      continue;
    }
    out[id] = new Date(base + k * p.minutesPerToken * 60_000);
    k++;
  }
  return out;
}

/**
 * The next date after `afterDate` (YYYY-MM-DD) on which the session runs and the business is open.
 * Skips weekdays the session does not run and any closed day; null when none within `maxDays`.
 */
export function nextWorkingDate(weekdays: number[], afterDate: string, isClosed: (date: string) => boolean, maxDays = 60): string | null {
  let date = afterDate;
  for (let i = 0; i < maxDays; i++) {
    date = addDays(date, 1);
    if (weekdays.includes(weekdayOf(date)) && !isClosed(date)) return date;
  }
  return null;
}

export interface OutcomeFacts {
  outcome: QueuePlan["outcome"];
  token?: number;
  name?: string;
  /** Place in line after "Not present" moved the token back (1 = next up). */
  place?: number;
  /** The token now being served after the action. */
  called?: { token: number; name: string };
  /** Where "Not coming" carried the token. */
  movedTo?: { dateLabel: string; token: number };
  /** Whether the customer has an email on file (so one was sent). */
  emailed?: boolean;
}

/** Plain-language result of a queue action, shown on the reception screen. */
export function describeOutcome(f: OutcomeFacts): string {
  const who = f.token !== undefined ? `Token ${f.token}${f.name ? ` (${f.name})` : ""}` : "This token";
  const calling = f.called ? ` Now serving token ${f.called.token} (${f.called.name}).` : "";
  const mail = (sent: string, none: string) => (f.emailed ? ` ${sent}` : ` ${none}`);
  switch (f.outcome) {
    case "advanced":
      return `${who} is done.${calling || " No one else is waiting."}`;
    case "moved_back":
      return `${who} was not here when called, so it moved back to place ${f.place ?? "?"} in line.${calling}${mail("They were emailed their new place.", "No email on file, so tell them yourself.")}`;
    case "no_show":
      return `${who} closed: they did not come after being called twice.${calling}${mail("They were emailed.", "No email on file.")}`;
    case "carry_over":
      return `${who} moved to ${f.movedTo?.dateLabel ?? "the next working day"} as token ${f.movedTo?.token ?? "?"}. A token can be moved only once.${calling}${mail("They were emailed the new day.", "No email on file, so tell them yourself.")}`;
    case "closed":
      return `${who} closed: it was already moved once and they could not come again.${calling}${mail("They were emailed.", "No email on file.")}`;
    default:
      return "No one is waiting.";
  }
}
