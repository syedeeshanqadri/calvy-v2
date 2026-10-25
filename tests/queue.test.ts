import { describe, it, expect } from "vitest";
import {
  MAX_CALLS, QueueActionError, computeEtas, describeOutcome, moveBack, openQueue, placeInLine, planNext,
  planNotComing, planNotPresent, planWalkIn, positionsFor, type QueueItem,
} from "@/lib/queue";

const now = new Date("2026-10-26T05:00:00Z"); // 10:30 IST
const q = (tokenNumber: number, o: Partial<QueueItem> = {}): QueueItem => ({
  id: `t${tokenNumber}`, tokenNumber, position: null, state: null, notPresentCount: 0, carriedFromId: null, ...o,
});
const queue4 = () => [q(1, { state: "SERVING" }), q(2), q(3), q(4)];

describe("move back 2", () => {
  it("moves two places down", () => {
    expect(moveBack(["a", "b", "c", "d"], "a")).toEqual(["b", "c", "a", "d"]);
    expect(moveBack(["a", "b", "c", "d", "e"], "b")).toEqual(["a", "c", "d", "b", "e"]);
  });
  it("goes to the end with fewer than 2 behind", () => {
    expect(moveBack(["a", "b", "c"], "a")).toEqual(["b", "c", "a"]); // exactly 2 behind = end
    expect(moveBack(["a", "b", "c", "d"], "c")).toEqual(["a", "b", "d", "c"]); // 1 behind
    expect(moveBack(["a", "b"], "b")).toEqual(["a", "b"]); // 0 behind
    expect(moveBack(["a"], "a")).toEqual(["a"]);
  });
});

describe("Next", () => {
  it("current -> DONE, next waiting -> SERVING", () => {
    const p = planNext(queue4(), now);
    expect(p.updates.t1).toEqual({ state: "DONE" });
    expect(p.updates.t2).toEqual({ state: "SERVING", servingStartedAt: now });
    expect(p.order).toEqual(["t2", "t3", "t4"]);
  });
  it("with nobody serving it just calls the first token; with an empty queue it is idle", () => {
    expect(planNext([q(1), q(2)], now).updates.t1).toMatchObject({ state: "SERVING" });
    expect(planNext([q(1, { state: "DONE" })], now).outcome).toBe("idle");
  });
  it("uses explicit positions over token numbers", () => {
    const items = [q(1, { position: 3 }), q(2, { position: 1 }), q(3, { position: 2 })];
    expect(openQueue(items).map((i) => i.id)).toEqual(["t2", "t3", "t1"]);
  });
});

describe("Not present: four calls", () => {
  const big = () => [q(1, { state: "SERVING" }), q(2), q(3), q(4), q(5)];

  it("there are four calls in all", () => expect(MAX_CALLS).toBe(4));

  it("miss 1: back two places and the next token is called", () => {
    const p = planNotPresent(big(), "t1", now);
    expect(p.outcome).toBe("moved_back");
    expect(p.order).toEqual(["t2", "t3", "t1", "t4", "t5"]);
    expect(p.updates.t1).toEqual({ state: "WAITING", notPresentCount: 1, servingStartedAt: null });
    expect(p.updates.t2).toEqual({ state: "SERVING", servingStartedAt: now });
    expect(placeInLine(p.order, "t1")).toBe(3);
  });
  it("miss 2: back two places again", () => {
    const p = planNotPresent([q(1, { state: "SERVING", notPresentCount: 1 }), q(2), q(3), q(4), q(5)], "t1", now);
    expect(p.outcome).toBe("moved_back");
    expect(p.order).toEqual(["t2", "t3", "t1", "t4", "t5"]);
    expect(p.updates.t1).toMatchObject({ notPresentCount: 2 });
  });
  it("miss 3: to the end of the queue, behind everyone booked", () => {
    const p = planNotPresent([q(1, { state: "SERVING", notPresentCount: 2 }), q(2), q(3), q(4), q(5)], "t1", now);
    expect(p.outcome).toBe("moved_back");
    expect(p.order).toEqual(["t2", "t3", "t4", "t5", "t1"]);
    expect(p.updates.t1).toMatchObject({ notPresentCount: 3 });
    expect(p.updates.t2).toMatchObject({ state: "SERVING" });
  });
  it("miss 4: closed as missed, nothing moves to another day, the next token is called", () => {
    const p = planNotPresent([q(1, { state: "SERVING", notPresentCount: 3 }), q(2), q(3)], "t1", now);
    expect(p.outcome).toBe("no_show");
    expect(p.updates.t1).toEqual({ state: "NO_SHOW", notPresentCount: 4 });
    expect(p.updates.t2).toMatchObject({ state: "SERVING" });
    expect(p.order).toEqual(["t2", "t3"]);
  });
  it("alone in the queue: stays put on a miss, nobody to call", () => {
    const p = planNotPresent([q(1, { state: "SERVING" })], "t1", now);
    expect(p.order).toEqual(["t1"]);
    expect(Object.keys(p.updates)).toEqual(["t1"]);
  });
  it("a booking that was moved here from an earlier day gets the same four calls", () => {
    const p = planNotPresent([q(1, { state: "SERVING", carriedFromId: "old" }), q(2), q(3), q(4)], "t1", now);
    expect(p.outcome).toBe("moved_back");
  });
  it("only the token being served can be marked not present", () => {
    expect(() => planNotPresent(queue4(), "t2", now)).toThrow(QueueActionError);
  });
});

describe("Not coming = cancelled", () => {
  it("cancels the booking and closes the gap", () => {
    const p = planNotComing(queue4(), "t3", now);
    expect(p.outcome).toBe("cancelled");
    expect(p.updates.t3).toEqual({ state: "CANCELLED" });
    expect(p.order).toEqual(["t1", "t2", "t4"]);
  });
  it("when the serving token cancels, the next one is called", () => {
    const p = planNotComing(queue4(), "t1", now);
    expect(p.updates.t2).toMatchObject({ state: "SERVING" });
  });
  it("a token not in the queue cannot be cancelled here", () => {
    expect(() => planNotComing([q(1, { state: "DONE" })], "t1", now)).toThrow(QueueActionError);
  });
});

describe("walk-in", () => {
  it("gets the next token number and the last place", () => {
    expect(planWalkIn(5, [1, 2, 3])).toEqual({ tokenNumber: 6, position: 4 });
    expect(planWalkIn(0, [])).toEqual({ tokenNumber: 1, position: 1 });
  });
  it("is allowed past the session capacity (reception decides)", () => {
    expect(planWalkIn(16, [9, 10]).tokenNumber).toBe(17);
  });
});

describe("ETAs", () => {
  const sessionStart = new Date("2026-10-26T04:30:00Z"); // 10:00 IST
  const mins = (d: Date) => (d.getTime() - sessionStart.getTime()) / 60_000;
  it("nobody serving yet: session start + k x minutes", () => {
    const e = computeEtas({ order: ["a", "b", "c"], servingId: null, sessionStart, servingStartedAt: null, minutesPerToken: 15 });
    expect([mins(e.a), mins(e.b), mins(e.c)]).toEqual([0, 15, 30]);
  });
  it("runs from when the current token started, never before the session start", () => {
    const started = new Date(sessionStart.getTime() + 25 * 60_000); // current token began 10:25
    const e = computeEtas({ order: ["a", "b", "c"], servingId: "a", sessionStart, servingStartedAt: started, minutesPerToken: 15 });
    expect(mins(e.a)).toBe(25);
    expect([mins(e.b), mins(e.c)]).toEqual([40, 55]);
    const early = computeEtas({ order: ["a", "b"], servingId: "a", sessionStart, servingStartedAt: new Date(sessionStart.getTime() - 600_000), minutesPerToken: 15 });
    expect(mins(early.b)).toBe(15);
  });
  it("after a skip the ETAs follow the new order and the new serving start", () => {
    const at = new Date(sessionStart.getTime() + 20 * 60_000);
    const p = planNotPresent(queue4(), "t1", at);
    const e = computeEtas({ order: p.order, servingId: "t2", sessionStart, servingStartedAt: at, minutesPerToken: 15 });
    expect([mins(e.t2), mins(e.t3), mins(e.t1), mins(e.t4)]).toEqual([20, 35, 50, 65]);
  });
  it("positions are 1..n", () => {
    expect(positionsFor(["x", "y"])).toEqual({ x: 1, y: 2 });
  });
});

describe("plain-language outcomes", () => {
  const called = { token: 4, name: "Aman" };
  it("miss 1 and 2: moved back with the place and the call count", () => {
    const m = describeOutcome({ outcome: "moved_back", token: 3, name: "Riya", misses: 1, place: 3, called, emailed: true });
    expect(m).toContain("Token 3 (Riya) was not here when called (missed call 1 of 4), so it moved to place 3 in line.");
    expect(m).toContain("Now serving token 4 (Aman).");
  });
  it("miss 3: to the end of the line", () => {
    expect(describeOutcome({ outcome: "moved_back", token: 3, name: "Riya", misses: 3, place: 5, emailed: true })).toContain("missed call 3 of 4), so it moved to the end of the line");
  });
  it("miss 4: closed, with the wallet credit", () => {
    expect(describeOutcome({ outcome: "no_show", token: 3, name: "Riya", credit: "Rs 10.00", called, emailed: true })).toBe(
      "Token 3 (Riya) closed: not present after being called 4 times. Rs 10.00 was saved in their wallet for a future booking. Now serving token 4 (Aman). They were emailed how to book another date.",
    );
  });
  it("nothing paid online: says there is no credit", () => {
    expect(describeOutcome({ outcome: "no_show", token: 3, name: "Walk-in", credit: null, emailed: false })).toContain("Nothing was paid online, so there is no credit.");
  });
  it("cancelled", () => {
    expect(describeOutcome({ outcome: "cancelled", token: 3, name: "Riya", credit: "Rs 510.00", emailed: true })).toContain("Token 3 (Riya) cancelled. Rs 510.00 was saved in their wallet");
  });
  it("no email on file says so", () => {
    expect(describeOutcome({ outcome: "moved_back", token: 3, misses: 1, place: 2, emailed: false })).toContain("No email on file");
  });
  it("done and idle", () => {
    expect(describeOutcome({ outcome: "advanced", token: 1, name: "Riya", called })).toBe("Token 1 (Riya) is done. Now serving token 4 (Aman).");
    expect(describeOutcome({ outcome: "advanced", token: 1, name: "Riya" })).toBe("Token 1 (Riya) is done. No one else is waiting.");
    expect(describeOutcome({ outcome: "idle" })).toBe("No one is waiting.");
  });
});
