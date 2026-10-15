import { readFileSync } from "fs";
import path from "path";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));

describe("lazy third-party clients (no import-time crash)", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("RAZORPAY_KEY_ID", "");
    vi.stubEnv("RAZORPAY_KEY_SECRET", "");
  });
  afterEach(() => vi.unstubAllEnvs());

  // lib/email.tsx contains JSX and vitest.config/tsconfig ("jsx": "preserve") cannot
  // transform it, so it is checked structurally: the client must only be built inside getResend().
  it("lib/email.tsx builds Resend only inside a function (not at module scope)", () => {
    const src = readFileSync(path.resolve(__dirname, "../lib/email.tsx"), "utf8");
    const lines = src.split(String.fromCharCode(10));
    const idx = lines.findIndex((l) => l.includes("new Resend("));
    expect(idx).toBeGreaterThan(-1);
    expect(lines[idx]).toMatch(/^\s+/); // indented => inside a function body
    expect(src).toContain("function getResend()");
  });

  it("imports the broadcasts route without keys", async () => {
    const mod = await import("@/app/api/broadcasts/send/route");
    expect(typeof mod.POST).toBe("function");
  });

  it("imports lib/razorpay without keys", async () => {
    const mod = await import("@/lib/razorpay");
    expect(mod.razorpay).toBeDefined();
    expect(typeof mod.createRouteLinkedAccount).toBe("function");
  });

  it("throws a clear error only when razorpay is used without keys", async () => {
    const { razorpay } = await import("@/lib/razorpay");
    expect(() => razorpay.orders).toThrow("Razorpay is not configured");
  });

  it("builds the real client lazily once keys exist", async () => {
    vi.stubEnv("RAZORPAY_KEY_ID", "rzp_test_x");
    vi.stubEnv("RAZORPAY_KEY_SECRET", "secret_x");
    const { razorpay } = await import("@/lib/razorpay");
    expect(razorpay.orders).toBeDefined();
  });
});
