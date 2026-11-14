// Pure "what the screen shows right now" updates for the instant-feedback buttons. The server stays the source of truth: the next
// poll replaces whatever is shown here.
import type { TodayRow } from "@/lib/today";
import type { QueueView } from "@/lib/queueDb";

export type TodayChange = "arrived" | "completed" | "no-show";

export function applyTodayChange(rows: TodayRow[], id: string, change: TodayChange, now = new Date()): TodayRow[] {
  return rows.map((r) => {
    if (r.id !== id) return r;
    if (change === "arrived") return { ...r, arrivedAt: r.arrivedAt ?? now.toISOString() };
    return { ...r, status: change };
  });
}

/** "Done · call next": the person being served is finished and the first waiting token is called. */
export function advanceQueue(view: QueueView): QueueView {
  const serving = view.open.find((r) => r.state === "SERVING");
  const waiting = view.open.filter((r) => r.state !== "SERVING");
  const [next, ...rest] = waiting;
  const open = [...(next ? [{ ...next, state: "SERVING" as const, place: 1 }] : []), ...rest.map((r, i) => ({ ...r, place: i + 2 }))];
  return { ...view, open, closed: serving ? [{ ...serving, state: "DONE" as const, place: 0 }, ...view.closed] : view.closed };
}
