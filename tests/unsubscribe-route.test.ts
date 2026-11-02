import { readFileSync } from "fs";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  upsert: vi.fn(async (..._a: unknown[]) => ({})),
  rateLimit: vi.fn(async (..._a: unknown[]) => ({ ok: true, retryAfter: 0 })),
}));
vi.mock("@/lib/prisma", () => ({ prisma: { notificationOptOut: { upsert: mocks.upsert } } }));
vi.mock("@/lib/ratelimit", () => ({ rateLimit: mocks.rateLimit, clientIp: () => "1.1.1.1" }));

import { GET, POST } from "@/app/api/unsubscribe/route";
import { unsubscribeLinks } from "@/lib/notifications/prefs";
import { decryptSecret, encryptSecret } from "@/lib/notifications/secret";

const links = () => unsubscribeLinks("biz1", "Riya@Example.com");
const post = (url: string) => POST(new NextRequest(url, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: "List-Unsubscribe=One-Click" }));
const tamper = (url: string, key: string, value: string) => {
  const u = new URL(url);
  u.searchParams.set(key, value);
  return u.toString();
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NOTIFY_SECRET_KEY", "test-key");
});
afterEach(() => vi.unstubAllEnvs());

describe("POST /api/unsubscribe (mail apps' one-click and the confirmation page)", () => {
  it("a valid link records the opt-out for that business and the lowercased address", async () => {
    const res = await post(links().oneClick);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(mocks.upsert).toHaveBeenCalledTimes(1);
    expect(mocks.upsert.mock.calls[0][0]).toMatchObject({
      where: { businessId_recipient: { businessId: "biz1", recipient: "riya@example.com" } },
      create: { businessId: "biz1", recipient: "riya@example.com" },
      update: {},
    });
  });

  it("doing it twice is still fine (the same single row)", async () => {
    expect((await post(links().oneClick)).status).toBe(200);
    expect((await post(links().oneClick)).status).toBe(200);
    expect(mocks.upsert.mock.calls[0][0]).toEqual(mocks.upsert.mock.calls[1][0]);
  });

  it("a link changed in any part is refused and writes nothing", async () => {
    const { oneClick } = links();
    const bad = [
      tamper(oneClick, "s", "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"),
      tamper(oneClick, "b", "biz2"),
      tamper(oneClick, "e", Buffer.from("victim@example.com").toString("base64url")),
      oneClick.replace(/&s=.*$/, ""),
      "http://localhost/api/unsubscribe",
      tamper(oneClick, "e", "x".repeat(500)),
    ];
    for (const url of bad) {
      const res = await post(url);
      expect(res.status, url).toBe(400);
      expect((await res.json()).error).toBe("This link is not valid.");
    }
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("a signature made for another purpose is worthless here", async () => {
    // Same key, same value, different purpose: must not unsubscribe anyone.
    const { oneClick } = links();
    const forged = tamper(oneClick, "s", "deadbeef");
    expect((await post(forged)).status).toBe(400);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("is rate limited per address of the caller, before anything else happens", async () => {
    mocks.rateLimit.mockResolvedValueOnce({ ok: false, retryAfter: 42 });
    const res = await post(links().oneClick);
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("42");
    expect(mocks.rateLimit).toHaveBeenCalledWith("unsubscribe:1.1.1.1", 20, 60_000);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("a deployment with no signing key refuses cleanly instead of failing", async () => {
    const { oneClick } = links();
    vi.stubEnv("NOTIFY_SECRET_KEY", "");
    vi.stubEnv("NEXTAUTH_SECRET", "");
    expect((await post(oneClick)).status).toBe(400);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
});

describe("GET /api/unsubscribe", () => {
  it("never unsubscribes by itself (mail scanners open links): it shows the confirmation page", async () => {
    const { oneClick } = links();
    const res = GET(new NextRequest(oneClick));
    expect(res.status).toBe(307);
    const location = new URL(res.headers.get("location")!);
    expect(location.pathname).toBe("/unsubscribe");
    expect(location.search).toBe(new URL(oneClick).search);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
});

describe("the signing key", () => {
  it("falls back to NEXTAUTH_SECRET so account emails never depend on one more variable", () => {
    vi.stubEnv("NOTIFY_SECRET_KEY", "");
    vi.stubEnv("NEXTAUTH_SECRET", "nextauth-secret");
    expect(decryptSecret(encryptSecret("https://x.test/reset?token=abc"))).toBe("https://x.test/reset?token=abc");
    expect(links().page).toContain("/unsubscribe?b=biz1");
  });

  it("a link signed with one key does not verify under another", async () => {
    const { oneClick } = links();
    vi.stubEnv("NOTIFY_SECRET_KEY", "a-different-key");
    expect((await post(oneClick)).status).toBe(400);
  });
});

describe("Razorpay paths are untouched by the outbox (owner decision)", () => {
  const RAZORPAY_PATHS = [
    "app/api/razorpay/webhook/route.ts",
    "app/api/razorpay/connect/route.ts",
    "app/booking/success/page.tsx",
    "app/api/bookings/confirm/route.ts",
    "lib/razorpay.ts",
  ];
  it.each(RAZORPAY_PATHS)("%s does not use lib/notifications", (file) => {
    expect(readFileSync(file, "utf8")).not.toContain("lib/notifications");
  });
  it("the webhook and the success page still send through the direct sender", () => {
    expect(readFileSync("app/api/razorpay/webhook/route.ts", "utf8")).toContain('from "@/lib/email"');
    expect(readFileSync("app/booking/success/page.tsx", "utf8")).toContain('from "@/lib/email"');
  });
  it("the direct senders they need are still exported", () => {
    const email = readFileSync("lib/email.tsx", "utf8");
    expect(email).toContain("export async function sendBookingConfirmation");
    expect(email).toContain("export async function sendInvoice");
  });
  it("no Razorpay field or import in the outbox code", () => {
    for (const file of ["lib/notifications/events.ts", "lib/notifications/enqueue.ts", "lib/notifications/process.ts", "app/api/appointments/[id]/payment/route.ts"]) {
      expect(readFileSync(file, "utf8"), file).not.toMatch(/razorpay[A-Z]|@\/lib\/razorpay/);
    }
  });
});
