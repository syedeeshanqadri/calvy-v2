import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const notify = vi.hoisted(() => vi.fn());
vi.mock("@/lib/notifications/enqueue", () => ({ notify }));
const logger = vi.hoisted(() => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger }));

import { verifyTurnstile, turnstileConfigured, resetTurnstileWarning } from "@/lib/turnstile";

beforeEach(() => { vi.clearAllMocks(); resetTurnstileWarning(); vi.unstubAllEnvs(); vi.stubEnv("TURNSTILE_SITE_KEY", ""); vi.stubEnv("TURNSTILE_SECRET_KEY", ""); });
afterEach(() => vi.unstubAllEnvs());

describe("Turnstile on sign-up", () => {
  it("not configured in development: skipped, no noise", async () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(await verifyTurnstile(undefined, "1.1.1.1")).toEqual({ ok: true, skipped: "no-keys-dev" });
    expect(logger.error).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });
  it("not configured in production: fails OPEN, logs once per boot, and emails team@calvy.io (one per day)", async () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(await verifyTurnstile(undefined, null)).toEqual({ ok: true, skipped: "no-keys-prod" });
    expect(await verifyTurnstile(undefined, null)).toEqual({ ok: true, skipped: "no-keys-prod" });
    expect(logger.error).toHaveBeenCalledTimes(1); // once per boot
    expect(notify).toHaveBeenCalledTimes(2);       // each call queues it; the queue ignores repeats of the same day's key
    const a = notify.mock.calls[0][0];
    expect(a).toMatchObject({ recipient: "team@calvy.io", subjectId: "turnstile-keys-missing", template: "form_notification" });
    expect(a.version).toMatch(/^\d{4}-\d{2}-\d{2}$/); // the day: the idempotency key makes it one email a day
    expect(notify.mock.calls[1][0].version).toBe(a.version);
  });
  it("configured: a missing token is refused, Cloudflare's verdict decides otherwise", async () => {
    vi.stubEnv("TURNSTILE_SITE_KEY", "site"); vi.stubEnv("TURNSTILE_SECRET_KEY", "secret");
    expect(turnstileConfigured()).toBe(true);
    expect(await verifyTurnstile(undefined, null)).toEqual({ ok: false, reason: "missing-token" });
    const yes = vi.fn(async () => new Response(JSON.stringify({ success: true })));
    const no = vi.fn(async () => new Response(JSON.stringify({ success: false })));
    expect(await verifyTurnstile("tok", "1.2.3.4", yes as never)).toEqual({ ok: true });
    expect(await verifyTurnstile("tok", "1.2.3.4", no as never)).toEqual({ ok: false, reason: "failed" });
    const sent = (yes.mock.calls as unknown as [string, { body: URLSearchParams }][])[0][1].body;
    expect(sent.get("secret")).toBe("secret");
    expect(sent.get("response")).toBe("tok");
    expect(sent.get("remoteip")).toBe("1.2.3.4");
  });
  it("Cloudflare unreachable: sign-up is not locked out", async () => {
    vi.stubEnv("TURNSTILE_SITE_KEY", "site"); vi.stubEnv("TURNSTILE_SECRET_KEY", "secret");
    expect(await verifyTurnstile("tok", null, (async () => { throw new Error("down"); }) as never)).toEqual({ ok: true });
  });
});
