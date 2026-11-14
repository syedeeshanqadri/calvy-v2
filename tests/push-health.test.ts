import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";

// A real key pair, so the derived/fingerprint logic is exercised for real.
const FAKE_SECRET_TAIL = "NOTIFY_SECRET_KEY=not-a-real-secret-just-a-placeholder-0000000000="; // same shape as the corruption, fake value
const pair = vi.hoisted(() => {
  const { generateKeyPairSync } = require("crypto") as typeof import("crypto");
  const { privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const jwk = privateKey.export({ format: "jwk" }) as { d: string; x: string; y: string };
  const pub = Buffer.concat([Buffer.from([4]), Buffer.from(jwk.x, "base64url"), Buffer.from(jwk.y, "base64url")]).toString("base64url");
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = pub;
  process.env.VAPID_PRIVATE_KEY = jwk.d;
  // what a real .env file looked like when a missing newline glued the next variable onto the subject (fake values here)
  process.env.VAPID_SUBJECT = "mailto:support@calvy.ioNOTIFY_SECRET_KEY=not-a-real-secret-just-a-placeholder-0000000000=";
  return { pub, priv: jwk.d, sendNotification: vi.fn(), setVapidDetails: vi.fn() };
});
vi.mock("web-push", () => ({ default: { sendNotification: pair.sendNotification, setVapidDetails: pair.setVapidDetails } }));

const gate = vi.hoisted(() => ({ requireAdminApi: vi.fn() }));
vi.mock("@/lib/admin/auth", () => ({ requireAdminApi: gate.requireAdminApi }));
const db = vi.hoisted(() => ({ group: vi.fn(), outbox: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { pushDevice: { groupBy: db.group }, notificationOutbox: { groupBy: db.outbox } } }));

import { SEND_TIMEOUT_MS, VAPID_SUBJECT, deliverPush, isValidVapidSubject, keyFingerprint, subjectFromEnvIsValid, vapidHealth } from "@/lib/push";
import { GET as healthRoute } from "@/app/api/admin/push-health/route";

describe("VAPID subject: Apple answers BadJwtToken for a malformed one, Chrome does not care", () => {
  it("accepts a real mailto: and an https: contact", () => {
    for (const ok of ["mailto:support@calvy.io", "mailto:a.b+c@sub.example.co.in", "https://calvy.io", "https://calvy.io/contact"]) expect(isValidVapidSubject(ok), ok).toBe(true);
  });
  it("rejects the corruption seen in production (another variable glued on), and other malformed values", () => {
    for (const bad of [
      `mailto:support@calvy.io${FAKE_SECRET_TAIL}`,
      "mailto:support@calvy.io NOTIFY=1", "mailto:", "mailto:support", "mailto:support@localhost", "http://calvy.io", "https://", "support@calvy.io", "", '"mailto:support@calvy.io"',
    ]) expect(isValidVapidSubject(bad), bad).toBe(false);
  });
  it("a corrupted env value falls back to a safe default instead of breaking every iPhone", () => {
    expect(subjectFromEnvIsValid()).toBe(false);
    expect(VAPID_SUBJECT).toBe("https://calvy.io");
  });
});

describe("push sends cannot hang a request", () => {
  beforeEach(() => { pair.sendNotification.mockReset(); });
  it("every send has a timeout and no keep-alive agent (one hung send held /api/bookings for 300s)", async () => {
    pair.sendNotification.mockResolvedValue({ statusCode: 201 });
    const out = await deliverPush({ endpoint: "https://web.push.apple.com/x", p256dh: "p", auth: "a" }, { title: "t", body: "b" });
    expect(out).toEqual({ kind: "sent", status: 201 });
    const opts = pair.sendNotification.mock.calls[0][2];
    expect(opts.timeout).toBe(SEND_TIMEOUT_MS);
    expect(SEND_TIMEOUT_MS).toBeLessThanOrEqual(15_000);
    expect(opts.agent?.keepAlive).toBe(false);
  });
  it("a timeout (no status) is retried, not treated as a rejection", async () => {
    pair.sendNotification.mockImplementation(async () => { throw new Error("Socket timeout"); });
    expect((await deliverPush({ endpoint: "https://web.push.apple.com/x", p256dh: "p", auth: "a" }, { title: "t", body: "b" })).kind).toBe("retry");
  });
});

describe("vapidHealth and /api/admin/push-health", () => {
  it("reports fingerprints and yes/no only: the public key, the derived signing key, the pair match and the subject state", () => {
    const h = vapidHealth();
    expect(h).toMatchObject({ configured: true, privateKeyMatchesPublic: true, subjectConfiguredValid: false });
    expect(h.publicKeyFingerprint).toBe(keyFingerprint(pair.pub));
    expect(h.signingKeyFingerprint).toBe(h.publicKeyFingerprint);
    const text = JSON.stringify(h);
    expect(text).not.toContain(pair.pub);
    expect(text).not.toContain(pair.priv);
    expect(text).not.toContain("NOTIFY_SECRET_KEY"); // the corrupted value never reaches the output
  });
  it("is admin-only", async () => {
    gate.requireAdminApi.mockResolvedValue({ ok: false, res: new Response("no", { status: 403 }) });
    expect((await healthRoute()).status).toBe(403);
    expect(db.group).not.toHaveBeenCalled();
  });
  it("counts devices by key fingerprint, flags other-key devices and the bad subject, never prints a key", async () => {
    const fp = keyFingerprint(pair.pub);
    gate.requireAdminApi.mockResolvedValue({ ok: true });
    db.group.mockResolvedValue([{ keyFp: fp, _count: { _all: 2 } }, { keyFp: "AAAAAA…ZZZZZZ", _count: { _all: 1 } }, { keyFp: null, _count: { _all: 3 } }]);
    db.outbox.mockResolvedValue([{ status: "SENT", _count: { _all: 5 } }, { status: "FAILED", _count: { _all: 1 } }]);
    const res = await healthRoute();
    const j = await res.json();
    expect(j.ok).toBe(false);
    expect(j.devicesByKey).toEqual([
      { keyFingerprint: fp, devices: 2, matchesServerKey: true },
      { keyFingerprint: "AAAAAA…ZZZZZZ", devices: 1, matchesServerKey: false },
      { keyFingerprint: "unknown (made before keys were recorded)", devices: 3, matchesServerKey: false },
    ]);
    expect(j.problems.join(" ")).toContain("VAPID_SUBJECT");
    expect(j.problems.join(" ")).toContain("4 registered device(s)");
    expect(j.pushLast24h).toEqual({ SENT: 5, FAILED: 1 });
    expect(res.headers.get("cache-control")).toBe("no-store");
    const text = JSON.stringify(j);
    expect(text).not.toContain(pair.pub);
    expect(text).not.toContain(pair.priv);
  });
});

describe("devices record which key they subscribed with", () => {
  it("the subscribe route stores a fingerprint (never the key)", () => {
    const src = readFileSync("app/api/push/subscribe/route.ts", "utf8");
    expect(src).toContain("keyFingerprint(normalizeKey(applicationServerKey))");
    expect(readFileSync("prisma/schema.prisma", "utf8")).toMatch(/keyFp\s+String\?/);
  });
});
