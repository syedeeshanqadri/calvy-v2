import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "fs";
import { UndoSlot } from "@/lib/undoSlot";
import { advanceQueue, applyTodayChange } from "@/lib/optimistic";
import type { TodayRow } from "@/lib/today";
import type { QueueRow, QueueView } from "@/lib/queueDb";

const access = vi.hoisted(() => ({ accessSession: vi.fn(), loadToday: vi.fn() }));
vi.mock("@/lib/access", () => ({ accessSession: access.accessSession }));
vi.mock("@/lib/today", () => ({ loadToday: access.loadToday }));
import { GET as todayRoute } from "@/app/api/today/route";

describe("UndoSlot: do it on screen now, send it after 5 seconds unless undone", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });
  const make = () => {
    const labels: (string | null)[] = [];
    const slot = new UndoSlot(5000, (l) => labels.push(l));
    const log = { commit: vi.fn(async () => {}), revert: vi.fn() };
    return { slot, labels, log };
  };
  it("sends nothing before the window ends, then sends exactly once", async () => {
    const { slot, labels, log } = make();
    await slot.schedule({ label: "Riya marked completed", ...log });
    expect(labels).toEqual(["Riya marked completed"]);
    await vi.advanceTimersByTimeAsync(4900);
    expect(log.commit).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(200);
    expect(log.commit).toHaveBeenCalledTimes(1);
    expect(labels.at(-1)).toBeNull();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(log.commit).toHaveBeenCalledTimes(1);
  });
  it("Undo puts the screen back and the server is never called", async () => {
    const { slot, log } = make();
    await slot.schedule({ label: "x", ...log });
    expect(slot.undo()).toBe(true);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(log.revert).toHaveBeenCalledTimes(1);
    expect(log.commit).not.toHaveBeenCalled();
    expect(slot.undo()).toBe(false); // nothing left to undo
  });
  it("starting another action sends the first at once, in order", async () => {
    const { slot } = make();
    const order: string[] = [];
    await slot.schedule({ label: "a", revert: vi.fn(), commit: async () => { order.push("a"); } });
    await slot.schedule({ label: "b", revert: vi.fn(), commit: async () => { order.push("b"); } });
    expect(order).toEqual(["a"]);
    await slot.flush();
    expect(order).toEqual(["a", "b"]);
  });
  it("flush (page hidden or closed) sends a pending action immediately", async () => {
    const { slot, log } = make();
    await slot.schedule({ label: "x", ...log });
    await slot.flush();
    expect(log.commit).toHaveBeenCalledTimes(1);
    expect(slot.active).toBeNull();
  });
});

const trow = (over: Partial<TodayRow>): TodayRow => ({ id: "a1", timeLabel: "10:00 AM", name: "Riya K.", service: "Consult", status: "confirmed", isToken: false, tokenNumber: null, queueState: null, tokenSessionId: null, sessionDate: null, arrivedAt: null, phone: null, ...over });
describe("instant changes on the Today list", () => {
  it("arrived stamps the time, completed and no-show change the status, other rows are untouched", () => {
    const rows = [trow({ id: "a1" }), trow({ id: "a2" })];
    const now = new Date("2026-11-14T05:00:00Z");
    expect(applyTodayChange(rows, "a1", "arrived", now)[0].arrivedAt).toBe(now.toISOString());
    expect(applyTodayChange(rows, "a1", "completed")[0].status).toBe("completed");
    expect(applyTodayChange(rows, "a2", "no-show")[1].status).toBe("no-show");
    expect(applyTodayChange(rows, "a1", "completed")[1]).toBe(rows[1]);
  });
});

const qrow = (n: number, state: QueueRow["state"], place = 0): QueueRow => ({ id: `t${n}`, tokenNumber: n, state, clientName: `C${n}`, clientPhone: null, serviceName: "S", source: "ONLINE", etaTime: "10:00", place, notPresentCount: 0, carried: false, isOnline: false, meetingUrl: null });
describe("Done · call next on the queue", () => {
  const view = (open: QueueRow[], closed: QueueRow[] = []): QueueView => ({ session: {} as never, date: "2026-11-14", open, closed });
  it("finishes the serving token, calls the first waiting one, renumbers the places", () => {
    const out = advanceQueue(view([qrow(1, "SERVING", 1), qrow(2, "WAITING", 2), qrow(3, "WAITING", 3)]));
    expect(out.open.map((r) => [r.tokenNumber, r.state, r.place])).toEqual([[2, "SERVING", 1], [3, "WAITING", 2]]);
    expect(out.closed.map((r) => [r.tokenNumber, r.state])).toEqual([[1, "DONE"]]);
  });
  it("nobody waiting: serving is finished and the queue is empty; nobody serving: the first waiting is called", () => {
    expect(advanceQueue(view([qrow(1, "SERVING", 1)])).open).toEqual([]);
    expect(advanceQueue(view([qrow(4, "WAITING", 1)])).open[0]).toMatchObject({ tokenNumber: 4, state: "SERVING" });
  });
  it("does not mutate its input", () => {
    const v = view([qrow(1, "SERVING", 1), qrow(2, "WAITING", 2)]);
    const copy = JSON.stringify(v);
    advanceQueue(v);
    expect(JSON.stringify(v)).toBe(copy);
  });
});

describe("/api/today (polled by the open app)", () => {
  it("401 for a signed-out visitor, the person's own scoped data otherwise, never cached", async () => {
    access.accessSession.mockResolvedValue(null);
    expect((await todayRoute()).status).toBe(401);
    access.accessSession.mockResolvedValue({ access: { isOwner: false, businessId: "b1" } });
    access.loadToday.mockResolvedValue({ rows: [], isTokenBusiness: false, date: "2026-11-14", can: {} });
    const res = await todayRoute();
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(access.loadToday).toHaveBeenCalledWith({ isOwner: false, businessId: "b1" });
  });
});

describe("wiring", () => {
  it("Today and Queue poll only while visible (shared hook), Today uses the JSON route, both show the undo toast", () => {
    const hook = readFileSync("lib/useLivePoll.ts", "utf8");
    expect(hook).toContain('document.visibilityState === "visible"');
    expect(hook).toContain("calvy:refresh");
    const today = readFileSync("components/dashboard/TodayList.tsx", "utf8");
    expect(today).toContain("/api/today");
    expect(today).toContain("useLivePoll");
    expect(today).toContain("<UndoToast");
    const q = readFileSync("app/dashboard/queue/QueueClient.tsx", "utf8");
    expect(q).toContain("useLivePoll");
    expect(q).not.toContain("setInterval");
    expect(q).toContain("advanceQueue");
    expect(readFileSync("app/dashboard/queue/loading.tsx", "utf8")).toContain("Shimmer");
  });
  it("pull-to-refresh is on the dashboard scroll area, touch screens only", () => {
    expect(readFileSync("lib/usePullToRefresh.ts", "utf8")).toContain('(pointer: coarse)');
    expect(readFileSync("components/dashboard/DashboardLayout.tsx", "utf8")).toContain("usePullToRefresh(mainRef");
  });
});
