import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import { join, relative, sep } from "path";
import { createHmac } from "crypto";
import { hmacSha256Matches } from "@/lib/hmac";

// fix/security-audit: regression guards for the audit fixes.

const db = vi.hoisted(() => ({ user: { findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn() } }));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

describe("webhook signatures are compared in constant time", () => {
  const body = '{"event":"payment.captured"}';
  const secret = "whsec_test";
  const good = createHmac("sha256", secret).update(body).digest("hex");

  it("accepts the right signature and nothing else", () => {
    expect(hmacSha256Matches(body, good, secret)).toBe(true);
    expect(hmacSha256Matches(body, good.toUpperCase(), secret)).toBe(true); // hex is case-insensitive
    expect(hmacSha256Matches(body + " ", good, secret)).toBe(false);
    expect(hmacSha256Matches(body, good, "other")).toBe(false);
  });
  it("rejects missing, short, long and non-hex signatures without throwing", () => {
    for (const sig of ["", "abc", good.slice(0, -2), good + "00", "zz".repeat(32), "../../etc/passwd"]) {
      expect(hmacSha256Matches(body, sig, secret), sig).toBe(false);
    }
    expect(hmacSha256Matches(body, good, "")).toBe(false);
  });
  it("both payment webhooks use it", () => {
    for (const f of ["app/api/razorpay/webhook/route.ts", "app/api/billing/webhook/route.ts"]) {
      const src = readFileSync(f, "utf8");
      expect(src, f).toContain("hmacSha256Matches");
      expect(src, f).not.toMatch(/expected === signature/);
    }
  });
});

describe("IP lookups only take real IP addresses", () => {
  beforeEach(() => vi.restoreAllMocks());
  it("a header-supplied value that is not an IP never reaches the lookup URL", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("IN"));
    const { getCountryFromIp, getCurrencyFromIp } = await import("@/lib/geo");
    for (const bad of ["../../admin", "1.2.3.4/../x", "evil.example.com", "1.2.3.4?x=1", "unknown", "localhost"]) {
      expect(await getCountryFromIp(bad), bad).toBeNull();
      expect(await getCurrencyFromIp(bad), bad).toBe("USD");
    }
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(await getCountryFromIp("203.0.113.7")).toBe("IN");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});

describe("Google sign-in needs a verified email", () => {
  it("an unverified Google address is refused, a verified one is linked", async () => {
    process.env.GOOGLE_CLIENT_ID = "id";
    process.env.GOOGLE_CLIENT_SECRET = "secret";
    vi.resetModules();
    const { authOptions } = await import("@/lib/auth");
    db.user.findUnique.mockResolvedValue({ id: "u1", emailVerified: new Date() });
    const signIn = authOptions.callbacks!.signIn!;
    const user = { id: "g1", email: "victim@example.com", name: "V" };
    const account = { provider: "google", type: "oauth", providerAccountId: "g1" };
    expect(await signIn({ user, account, profile: { email_verified: false } } as never)).toBe(false);
    expect(await signIn({ user, account, profile: {} } as never)).toBe(false);
    expect(await signIn({ user, account, profile: { email_verified: true } } as never)).toBe(true);
  });
});

describe("every API route is protected or on the reviewed public list", () => {
  const PROTECTED = /getServerSession|getCustomer\b|queueContext|requireAdmin|isAdminUser|adminAuth|isCronAuthorized|hmacSha256Matches|verifyWebhook|verifySignature|getToken/;
  /** Public on purpose. Each one validates its input, is rate limited or signed, and returns no private data. */
  const PUBLIC = new Set([
    "auth/[...nextauth]", "auth/forgot-password", "auth/resend-verification", "auth/reset-password", "auth/verify-email",
    "availability", "availability/month", "token-availability", "bookings", "bookings/confirm",
    "customer/forgot-password", "customer/resend-verification", "customer/reset-password", "customer/signup", "customer/verify-email",
    "flags", "geo/rate", "region", "health", "leads", "signup", "track/[code]",
    "payments/status", "payments/mock/complete", "payments/cashfree/webhook", "unsubscribe",
  ]);

  const walk = (dir: string, out: string[] = []) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p, out);
      else if (name === "route.ts") out.push(p);
    }
    return out;
  };

  it("no route without a session, signature or secret check is missing from the public list", () => {
    const open = walk("app/api")
      .filter((f) => !PROTECTED.test(readFileSync(f, "utf8")))
      .map((f) => relative("app/api", f).split(sep).slice(0, -1).join("/"))
      .filter((r) => !PUBLIC.has(r));
    expect(open, "unprotected API routes: review them, then protect or add to PUBLIC").toEqual([]);
  });

  it("the mock payment completer is closed in production and when a real gateway is configured", () => {
    const src = readFileSync("app/api/payments/mock/complete/route.ts", "utf8");
    expect(src).toContain('process.env.NODE_ENV === "production"');
    expect(src).toContain('getPaymentProvider()?.name !== "MOCK"');
  });
});

import { emailSenderWarning } from "@/lib/env";

describe("email sender", () => {
  const env = (o: Record<string, string>) => o as unknown as NodeJS.ProcessEnv;
  it("warns when email is on but the sender is Resend's test address or unset", () => {
    expect(emailSenderWarning(env({ RESEND_API_KEY: "re_live" }))).toContain("EMAIL_FROM");
    expect(emailSenderWarning(env({ RESEND_API_KEY: "re_live", EMAIL_FROM: "Calvy <onboarding@resend.dev>" }))).toContain("EMAIL_FROM");
  });
  it("is quiet with a real sender, or when email is off", () => {
    expect(emailSenderWarning(env({ RESEND_API_KEY: "re_live", EMAIL_FROM: "Calvy <noreply@calvy.io>" }))).toBeNull();
    expect(emailSenderWarning(env({}))).toBeNull();
    expect(emailSenderWarning(env({ RESEND_API_KEY: "re_REPLACE_ME" }))).toBeNull();
  });
});
