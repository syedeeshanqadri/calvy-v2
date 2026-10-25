import { describe, it, expect } from "vitest";
import { buildTrackingView, signTrackingCode, trackingUrl, verifyTrackingCode, type TrackingSource } from "@/lib/tracking";
import type { QueueItem } from "@/lib/queue";

const env = { TRACKING_SECRET: "test-secret-1", NODE_ENV: "test", NEXT_PUBLIC_APP_URL: "https://calvy.io" } as NodeJS.ProcessEnv;
const id = "cmgx1ab2c0000xyz1234";

describe("signed codes", () => {
  it("round-trips an appointment id", () => {
    const code = signTrackingCode(id, env)!;
    expect(code.startsWith(`${id}.`)).toBe(true);
    expect(verifyTrackingCode(code, env)).toBe(id);
  });
  it("is deterministic and different per appointment", () => {
    expect(signTrackingCode(id, env)).toBe(signTrackingCode(id, env));
    expect(signTrackingCode("cmgx1ab2c0000abcd9999", env)).not.toBe(signTrackingCode(id, env));
  });
  it("rejects a tampered signature, id, truncation, wrong key and junk", () => {
    const code = signTrackingCode(id, env)!;
    const [, sig] = code.split(".");
    expect(verifyTrackingCode(`${id}.${sig.slice(0, -1)}x`, env)).toBeNull(); // last char changed
    expect(verifyTrackingCode(`cmgx1ab2c0000xyz9999.${sig}`, env)).toBeNull(); // someone else's id, my signature
    expect(verifyTrackingCode(code.slice(0, -4), env)).toBeNull(); // truncated
    expect(verifyTrackingCode(code, { ...env, TRACKING_SECRET: "other" } as NodeJS.ProcessEnv)).toBeNull(); // rotated key
    for (const junk of ["", ".", "abc", `${id}.`, `.${sig}`, `${id}.${sig}.extra`, "a".repeat(300), "../etc/passwd.x"]) {
      expect(verifyTrackingCode(junk, env)).toBeNull();
    }
  });
  it("falls back to NEXTAUTH_SECRET; production without any secret signs nothing", () => {
    const a = { NEXTAUTH_SECRET: "nextauth", NODE_ENV: "production" } as NodeJS.ProcessEnv;
    expect(verifyTrackingCode(signTrackingCode(id, a)!, a)).toBe(id);
    expect(signTrackingCode(id, { NODE_ENV: "production" } as NodeJS.ProcessEnv)).toBeNull();
    expect(verifyTrackingCode("x.y", { NODE_ENV: "production" } as NodeJS.ProcessEnv)).toBeNull();
  });
  it("builds the public URL under the business slug", () => {
    const url = trackingUrl("city-care-clinic", id, env)!;
    expect(url).toBe(`https://calvy.io/city-care-clinic/q/${signTrackingCode(id, env)}`);
    expect(trackingUrl("x", id, { NODE_ENV: "production" } as NodeJS.ProcessEnv)).toBeNull();
  });
});

const sessionStart = new Date("2026-10-26T04:30:00Z"); // 10:00 IST
const now = new Date("2026-10-26T04:45:00Z");
const q = (tokenNumber: number, o: Partial<QueueItem> = {}): QueueItem => ({
  id: `t${tokenNumber}`, tokenNumber, position: null, state: null, notPresentCount: 0, carriedFromId: null, ...o,
});
const hhmm = (d: Date) => new Date(d.getTime() + 330 * 60_000).toISOString().slice(11, 16);
function view(meToken: number, queue: QueueItem[], me: Partial<TrackingSource["me"]> = {}, extra: Partial<TrackingSource> = {}) {
  const mine = queue.find((i) => i.tokenNumber === meToken)!;
  return buildTrackingView({
    me: { ...mine, status: "confirmed", estimatedAt: null, ...me }, queue, sessionStart, minutesPerToken: 15,
    servingStartedAt: new Date("2026-10-26T04:40:00Z"), now, formatTime: hhmm, movedTo: null, ...extra,
  });
}

describe("tracking view states", () => {
  const live = () => [q(8, { state: "SERVING" }), q(9), q(10), q(12)];

  it("waiting: now serving, place, people ahead, ETA", () => {
    const v = view(12, live());
    expect(v).toMatchObject({ state: "waiting", yourToken: 12, nowServing: 8, ahead: 3, place: 4 });
    // current token started 10:10, 15 min each: #9 at 10:25, #10 at 10:40, #12 at 10:55
    expect(v.etaTime).toBe("10:55");
    expect(v.etaMinutes).toBe(40); // from now (10:15) to 10:55
  });
  it("serving: it is the customer's turn", () => {
    expect(view(8, live())).toMatchObject({ state: "serving", ahead: 0, etaMinutes: 0 });
  });
  it("done, no-show, moved, cancelled, pending payment, expired", () => {
    expect(view(8, [q(8, { state: "DONE" })], { status: "completed" }).state).toBe("done");
    expect(view(8, [q(8, { state: "NO_SHOW", notPresentCount: 4 })], { status: "no-show" })).toMatchObject({ state: "no_show", closedReason: "missed_calls", missedCalls: 4 });
    expect(view(8, [q(8, { state: "CANCELLED" })], { status: "cancelled" }).state).toBe("cancelled");
    expect(view(8, [q(8)], { status: "cancelled", state: null }).state).toBe("cancelled");
    expect(view(8, [q(8)], { status: "pending_payment" }).state).toBe("pending_payment");
    expect(view(8, [q(8)], { status: "expired" }).state).toBe("expired");
    const moved = view(8, [q(8, { state: "MOVED" })], { status: "cancelled" }, { movedTo: { dateLabel: "Tuesday, October 27", token: 5, code: "c.s" } });
    expect(moved).toMatchObject({ state: "moved", movedTo: { token: 5 } });
  });
  it("moved back and carried-over are flagged", () => {
    const v = view(9, [q(8, { state: "SERVING" }), q(9, { notPresentCount: 2, carriedFromId: "old" })]);
    expect(v).toMatchObject({ state: "waiting", movedBack: true, missedCalls: 2, carriedFromEarlier: true });
  });
  it("a closed or moved booking has no place or ETA", () => {
    const v = view(8, [q(8, { state: "NO_SHOW", notPresentCount: 2 }), q(9)], { status: "no-show" });
    expect(v).toMatchObject({ place: 0, ahead: 0, etaMinutes: null, etaTime: null });
  });
  it("nobody being served yet", () => {
    expect(view(1, [q(1), q(2)], {}, { servingStartedAt: null }).nowServing).toBeNull();
  });
});

describe("payload has no personal data", () => {
  it("contains only numbers, labels and flags (no names, contact details or other ids)", () => {
    // The queue rows handed to the builder carry extra fields that must never come out the other side.
    const withPii = [
      { ...q(8, { state: "SERVING" }), name: "Secret Person", phone: "+919800000001", email: "secret@example.com" },
      { ...q(9), name: "Another Person", phone: "+919800000002", email: "other@example.com" },
      { ...q(12), name: "Me", phone: "+919800000003", email: "me@example.com" },
    ] as unknown as QueueItem[];
    const json = JSON.stringify(view(12, withPii));
    for (const secret of ["Secret", "Another", "Person", "+9198", "@example.com", "t8", "t9"]) expect(json).not.toContain(secret);
    expect(Object.keys(JSON.parse(json)).sort()).toEqual([
      "ahead", "carriedFromEarlier", "closedReason", "etaMinutes", "etaTime", "missedCalls", "movedBack", "movedTo", "nowServing", "place", "state", "yourToken",
    ]);
  });
});
