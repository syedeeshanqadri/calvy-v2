import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

const db = vi.hoisted(() => ({
  queryRaw: vi.fn(),
  findBusiness: vi.fn(),
  createMany: vi.fn(),
  findMany: vi.fn(),
  findUnique: vi.fn(),
  updateMany: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    $queryRaw: db.queryRaw,
    appointment: { findMany: async () => [] },
    business: { findUnique: db.findBusiness, findMany: async () => [] },
    notificationOutbox: { createMany: db.createMany, findMany: db.findMany, findUnique: db.findUnique, updateMany: db.updateMany },
  },
}));

import { MAX_ATTEMPTS, idempotencyKey, isRetryableStatus, nextAttemptAt, normalizeRecipient } from "@/lib/notifications/policy";
import { decryptSecret, encryptSecret } from "@/lib/notifications/secret";
import { attemptNow, runOutbox } from "@/lib/notifications/process";
import { enqueue } from "@/lib/notifications/enqueue";
import type { Prisma } from "@prisma/client";
import type { Channel } from "@/lib/notifications/channels";

const NOW = new Date("2026-11-02T10:00:00Z");
const row = (over: Record<string, unknown> = {}) => ({
  id: "n1", event: "platform.form", channel: "EMAIL", recipient: "a@b.test", template: "form_notification",
  payload: { title: "T", fields: { a: 1 }, at: "then" }, secret: null, attempts: 1, expiresAt: null, ...over,
});
const channels = (send: Channel) => ({ EMAIL: send, WHATSAPP: send });
const noPause = async () => {};
/** The data of the settle write (the claim and purge writes have a different shape). */
const settled = () => db.updateMany.mock.calls.map(([a]) => a).find((a) => a.where.attempts !== undefined && typeof a.where.attempts === "number")?.data;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  for (const fn of Object.values(db)) fn.mockReset();
  db.queryRaw.mockResolvedValue([]);
  db.updateMany.mockResolvedValue({ count: 0 });
});
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });

describe("policy", () => {
  it("backs off 1m, 5m, 30m, 2h, 6h and then gives up", () => {
    const delays = [1, 2, 3, 4, 5].map((n) => (nextAttemptAt(n, NOW)!.getTime() - NOW.getTime()) / 60_000);
    expect(delays).toEqual([1, 5, 30, 120, 360]);
    expect(nextAttemptAt(MAX_ATTEMPTS, NOW)).toBeNull();
  });
  it("retries network errors, 408, 409, 429 and 5xx; other 4xx are permanent", () => {
    for (const s of [null, undefined, 408, 409, 429, 500, 503]) expect(isRetryableStatus(s)).toBe(true);
    for (const s of [400, 401, 403, 404, 422]) expect(isRetryableStatus(s)).toBe(false);
  });
  it("the key ignores recipient case and separates versions and channels", () => {
    const base = { event: "booking.reminder", subjectId: "a1", recipient: "A@B.test", channel: "EMAIL" as const };
    expect(idempotencyKey(base)).toBe(idempotencyKey({ ...base, recipient: " a@b.TEST " }));
    expect(idempotencyKey({ ...base, version: 1 })).not.toBe(idempotencyKey({ ...base, version: 2 }));
    expect(idempotencyKey({ ...base, recipient: "+91 98765", channel: "WHATSAPP" })).toContain("9198765");
    expect(normalizeRecipient("WHATSAPP", "+91 98-765")).toBe("9198765");
  });
});

describe("secret", () => {
  beforeEach(() => vi.stubEnv("NOTIFY_SECRET_KEY", "test-key"));
  it("round-trips and does not contain the plain value", () => {
    const stored = encryptSecret("https://x.test/reset?token=abc");
    expect(stored).not.toContain("abc");
    expect(decryptSecret(stored)).toBe("https://x.test/reset?token=abc");
  });
  it("rejects a tampered value or a changed key", () => {
    const stored = encryptSecret("v");
    const [iv, tag] = stored.split(".");
    expect(() => decryptSecret(`${iv}.${tag}.AAAA`)).toThrow();
    vi.stubEnv("NOTIFY_SECRET_KEY", "other");
    expect(() => decryptSecret(stored)).toThrow();
  });
  it("refuses to run without a key", () => {
    vi.stubEnv("NOTIFY_SECRET_KEY", "");
    vi.stubEnv("NEXTAUTH_SECRET", ""); // the fallback; CI sets it
    expect(() => encryptSecret("v")).toThrow("NOTIFY_SECRET_KEY");
  });
});

describe("enqueue", () => {
  const tx = { notificationOutbox: { createMany: db.createMany, findMany: db.findMany } } as unknown as Prisma.TransactionClient;
  const input = { event: "platform.form", audience: "PLATFORM" as const, subjectId: "s1", recipient: "A@B.test", template: "form_notification", payload: { title: "T" } };

  it("writes on the given transaction, skips duplicates and returns the existing ids", async () => {
    db.findMany.mockResolvedValue([{ id: "existing" }]);
    expect(await enqueue(tx, [input])).toEqual(["existing"]);
    const arg = db.createMany.mock.calls[0][0];
    expect(arg.skipDuplicates).toBe(true);
    expect(arg.data[0]).toMatchObject({ recipient: "a@b.test", channel: "EMAIL" });
  });
  it("stores a secret encrypted, never in the payload", async () => {
    vi.stubEnv("NOTIFY_SECRET_KEY", "test-key");
    db.findMany.mockResolvedValue([]);
    await enqueue(tx, [{ ...input, secret: "https://x.test/reset?token=abc" }]);
    const saved = db.createMany.mock.calls[0][0].data[0];
    expect(JSON.stringify(saved)).not.toContain("token=abc");
    expect(decryptSecret(saved.secret)).toContain("token=abc");
  });
  it("a delayed message starts later; nothing to write means no query", async () => {
    db.findMany.mockResolvedValue([]);
    const later = new Date(NOW.getTime() + 7_200_000);
    await enqueue(tx, [{ ...input, notBefore: later }]);
    expect(db.createMany.mock.calls[0][0].data[0].nextAttemptAt).toEqual(later);
    db.createMany.mockClear();
    expect(await enqueue(tx, [])).toEqual([]);
    expect(db.createMany).not.toHaveBeenCalled();
  });
});

describe("runOutbox", () => {
  const once = (r: unknown) => db.queryRaw.mockResolvedValueOnce([r]).mockResolvedValue([]);

  it("marks a delivered row SENT, passes the row id as the idempotency key and clears the secret", async () => {
    once(row());
    const send = vi.fn<Channel>(async () => ({ kind: "sent", providerId: "re_1" }));
    const res = await runOutbox(channels(send), noPause);
    expect(res).toMatchObject({ claimed: 1, sent: 1, failed: 0 });
    expect(send.mock.calls[0][0].subject).toBe("T");
    expect(send.mock.calls[0][1]).toBe("a@b.test");
    expect(send.mock.calls[0][2]).toBe("n1");
    expect(settled()).toMatchObject({ status: "SENT", providerId: "re_1", secret: null, lockedUntil: null });
  });
  it("a retryable failure goes back to PENDING with the backoff and keeps the secret", async () => {
    once(row({ attempts: 2 }));
    const res = await runOutbox(channels(async () => ({ kind: "retry", error: "429" })), noPause);
    expect(res.retried).toBe(1);
    const data = settled();
    expect(data).toMatchObject({ status: "PENDING", error: "429" });
    expect(data.nextAttemptAt).toEqual(new Date(NOW.getTime() + 300_000));
    expect(data).not.toHaveProperty("secret");
  });
  it("the last allowed attempt fails for good", async () => {
    once(row({ attempts: MAX_ATTEMPTS }));
    const res = await runOutbox(channels(async () => ({ kind: "retry", error: "down" })), noPause);
    expect(res.failed).toBe(1);
    expect(settled()).toMatchObject({ status: "FAILED", error: "down", secret: null });
  });
  it("a permanent failure does not retry, even on the first attempt", async () => {
    once(row());
    const res = await runOutbox(channels(async () => ({ kind: "permanent", error: "bad address" })), noPause);
    expect(res.failed).toBe(1);
    expect(settled().status).toBe("FAILED");
  });
  it("an unconfigured channel is SKIPPED", async () => {
    once(row());
    const res = await runOutbox(channels(async () => ({ kind: "skipped", error: "email not configured" })), noPause);
    expect(res.skipped).toBe(1);
    expect(settled().status).toBe("SKIPPED");
  });
  it("an expired row is SKIPPED without sending", async () => {
    once(row({ expiresAt: new Date(NOW.getTime() - 1) }));
    const send = vi.fn<Channel>();
    const res = await runOutbox(channels(send), noPause);
    expect(res.skipped).toBe(1);
    expect(send).not.toHaveBeenCalled();
  });
  it("an unknown template or a channel that throws is retried, and the run carries on", async () => {
    db.queryRaw.mockResolvedValueOnce([row({ id: "bad", template: "nope" }), row({ id: "boom" }), row({ id: "ok" })]).mockResolvedValue([]);
    const send = vi.fn<Channel>().mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce({ kind: "sent" });
    const res = await runOutbox(channels(send), noPause);
    expect(res).toMatchObject({ claimed: 3, retried: 2, sent: 1 });
  });
  const bookingRow = { businessId: "b1", template: "reminder", payload: { clientName: "Riya K", businessName: "Sunrise", serviceName: "Checkup", date: "Mon, 2 Nov", time: "10:00 AM" } };
  it("a business's message renders with its logo colour and pack wording, read at send time", async () => {
    once(row(bookingRow));
    db.findBusiness.mockResolvedValue({ name: "Sunrise", logoUrl: null, primaryColor: "#0f766e", address: null, phone: null, packId: "LAWYER", termsOverride: null });
    const send = vi.fn<Channel>(async () => ({ kind: "sent" }));
    await runOutbox(channels(send), noPause);
    expect(db.findBusiness.mock.calls[0][0].where).toEqual({ id: "b1" });
    expect(send.mock.calls[0][0].html).toContain("#0f766e");
    expect(send.mock.calls[0][0].text).toContain("your meeting at Sunrise");
  });
  it("a failed brand lookup is retried, not sent unbranded", async () => {
    once(row(bookingRow));
    db.findBusiness.mockRejectedValue(new Error("db"));
    const send = vi.fn<Channel>();
    expect((await runOutbox(channels(send), noPause)).retried).toBe(1);
    expect(send).not.toHaveBeenCalled();
  });
  it("an auth template gets the decrypted link from the secret column", async () => {
    vi.stubEnv("NOTIFY_SECRET_KEY", "test-key");
    once(row({ template: "password_reset", payload: { name: "Riya K" }, secret: encryptSecret("https://x.test/reset?token=abc") }));
    const send = vi.fn<Channel>(async () => ({ kind: "sent" }));
    await runOutbox(channels(send), noPause);
    expect(send.mock.calls[0][0].html).toContain("token=abc");
    expect(send.mock.calls[0][0].text).toContain("token=abc");
  });
  it("a row whose secret cannot be decrypted is retried, not sent", async () => {
    vi.stubEnv("NOTIFY_SECRET_KEY", "test-key");
    once(row({ secret: "not-valid" }));
    const send = vi.fn<Channel>();
    const res = await runOutbox(channels(send), noPause);
    expect(res.retried).toBe(1);
    expect(send).not.toHaveBeenCalled();
  });
  it("settling is keyed on the attempt, so a run whose lock lapsed cannot overwrite a newer one", async () => {
    once(row({ attempts: 3 }));
    await runOutbox(channels(async () => ({ kind: "sent" })), noPause);
    const write = db.updateMany.mock.calls.map(([a]) => a).find((a) => a.data.status === "SENT");
    expect(write.where).toEqual({ id: "n1", status: "SENDING", attempts: 3 });
  });
  it("stops at 25 rows a run and paces every send", async () => {
    db.queryRaw.mockImplementation(async (_q: unknown, ..._v: unknown[]) => Array.from({ length: 5 }, (_, i) => row({ id: `n${i}` })));
    const pause = vi.fn(noPause);
    const res = await runOutbox(channels(async () => ({ kind: "sent" })), pause);
    expect(res.claimed).toBe(25);
    expect(db.queryRaw).toHaveBeenCalledTimes(5);
    expect(pause).toHaveBeenCalledTimes(25);
  });
  it("starts no new batch past the time budget", async () => {
    db.queryRaw.mockImplementation(async () => [row()]);
    const pause = vi.fn(async () => { vi.setSystemTime(new Date(Date.now() + 21_000)); });
    const res = await runOutbox(channels(async () => ({ kind: "sent" })), pause);
    expect(res.claimed).toBe(1);
  });
  it("the claim skips locked rows and reclaims lapsed locks", async () => {
    await runOutbox(channels(async () => ({ kind: "sent" })), noPause);
    const sql = db.queryRaw.mock.calls[0][0].join("?");
    expect(sql).toContain("FOR UPDATE SKIP LOCKED");
    expect(sql).toContain(`"lockedUntil" <`);
  });
  it("closes rows abandoned on their last attempt and clears payloads older than 90 days", async () => {
    db.updateMany.mockImplementation(async (a: { data: Record<string, unknown> }) => ({ count: a.data.status === "FAILED" ? 2 : 3 }));
    const res = await runOutbox(channels(async () => ({ kind: "sent" })), noPause);
    expect(res).toMatchObject({ reclaimedDead: 2, purged: 3 });
    const [abandon, purge] = db.updateMany.mock.calls.map(([a]) => a);
    expect(abandon.where).toMatchObject({ status: "SENDING", attempts: { gte: MAX_ATTEMPTS } });
    expect(abandon.data.secret).toBeNull();
    expect(purge.where.createdAt.lt).toEqual(new Date(NOW.getTime() - 90 * 24 * 3_600_000));
    expect(purge.data).toEqual({ payload: {} });
  });
});

describe("attemptNow", () => {
  it("does not send a row another worker already claimed, or one not yet due", async () => {
    db.updateMany.mockResolvedValue({ count: 0 });
    const send = vi.fn<Channel>();
    await attemptNow(["n1"], channels(send));
    expect(send).not.toHaveBeenCalled();
    expect(db.updateMany.mock.calls[0][0].where).toEqual({ id: "n1", status: "PENDING", nextAttemptAt: { lte: NOW } });
  });
  it("sends a claimed row and leaves a failure to the scheduler", async () => {
    db.updateMany.mockResolvedValue({ count: 1 });
    db.findUnique.mockResolvedValue(row());
    await attemptNow(["n1"], channels(async () => ({ kind: "retry", error: "down" })));
    expect(settled()).toMatchObject({ status: "PENDING", error: "down" });
  });
  it("never throws, and a bad row does not stop the next", async () => {
    db.updateMany.mockRejectedValueOnce(new Error("db")).mockResolvedValue({ count: 1 });
    db.findUnique.mockResolvedValue(row({ id: "n2" }));
    const send = vi.fn<Channel>(async () => ({ kind: "sent" }));
    await expect(attemptNow(["n1", "n2"], channels(send))).resolves.toBeUndefined();
    expect(send).toHaveBeenCalledTimes(1);
  });
});

describe("GET /api/cron/notifications", () => {
  const call = async (auth?: string) => {
    const { GET } = await import("@/app/api/cron/notifications/route");
    return GET(new NextRequest("http://localhost/api/cron/notifications", { headers: auth ? { authorization: auth } : {} }));
  };
  it("rejects a wrong or missing secret, and production without one, without running", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("CRON_SECRET", "");
    expect((await call("Bearer ")).status).toBe(401);
    vi.stubEnv("CRON_SECRET", "s3cret");
    expect((await call()).status).toBe(401);
    expect((await call("Bearer wrong!")).status).toBe(401);
    expect(db.queryRaw).not.toHaveBeenCalled();
  });
  it("the right secret runs the outbox and reports the counts", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("CRON_SECRET", "s3cret");
    const res = await call("Bearer s3cret");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, expiredHolds: 0, remindersQueued: 0, summariesQueued: 0, claimed: 0, sent: 0, retried: 0, failed: 0, skipped: 0, reclaimedDead: 0, purged: 0 });
  });
});
