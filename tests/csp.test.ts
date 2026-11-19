import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";

// The Content-Security-Policy, built per route in next.config.mjs. Production values (isDev is false there), and the tenant-domain rules read from
// NEXT_PUBLIC_ROOT_DOMAIN, never hard-coded.

async function load(env: Record<string, string> = {}) {
  vi.resetModules();
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("NEXT_PUBLIC_ROOT_DOMAIN", "calvy.io");
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
  const mod = await import("../next.config.mjs");
  const rules = (await mod.default.headers!()) as { source: string; headers: { key: string; value: string }[] }[];
  const rule = (source: string) => rules.find((r) => r.source === source)!;
  const cspOf = (source: string) => rule(source).headers.find((h) => h.key === "Content-Security-Policy")!.value;
  const directive = (csp: string, name: string) => (csp.split("; ").find((d) => d.startsWith(`${name} `)) ?? "").split(" ").slice(1);
  return { mod, rules, rule, cspOf, directive };
}
afterEach(() => vi.unstubAllEnvs());

describe("Razorpay Checkout is allowed on the billing page only", () => {
  it("the billing policy adds exactly what Checkout needs", async () => {
    const { cspOf, directive } = await load();
    const csp = cspOf("/dashboard/billing");
    expect(directive(csp, "script-src")).toContain("https://checkout.razorpay.com");
    expect(directive(csp, "frame-src")).toEqual(expect.arrayContaining(["https://api.razorpay.com", "https://checkout.razorpay.com"]));
    expect(directive(csp, "connect-src")).toEqual(expect.arrayContaining(["https://api.razorpay.com", "https://lumberjack.razorpay.com"]));
    expect(directive(csp, "img-src")).toContain("https://cdn.razorpay.com");
  });
  it("no other page gets any Razorpay source (the policy is scoped, not global)", async () => {
    const { rules } = await load();
    for (const r of rules) {
      if (r.source === "/dashboard/billing") continue;
      const csp = r.headers.find((h) => h.key === "Content-Security-Policy")?.value ?? "";
      expect(csp, r.source).not.toContain("razorpay");
    }
  });
  it("the billing policy still has everything the page already needed (Cashfree SDK and frames)", async () => {
    const { cspOf, directive } = await load();
    const csp = cspOf("/dashboard/billing");
    expect(directive(csp, "script-src")).toContain("https://sdk.cashfree.com");
    expect(directive(csp, "frame-src")).toContain("https://*.cashfree.com");
    expect(directive(csp, "connect-src")).toContain("https://*.cashfree.com");
  });
  it("it is a later rule than the private-pages rule, so it wins for /dashboard/billing", async () => {
    const { rules } = await load();
    const order = rules.map((r) => r.source);
    expect(order.indexOf("/dashboard/billing")).toBeGreaterThan(order.indexOf("/dashboard/:path*"));
  });
});

describe("framing", () => {
  it("frame-src allows our own pages ('self') everywhere: the onboarding site preview", async () => {
    const { rules, directive } = await load();
    for (const r of rules) {
      const csp = r.headers.find((h) => h.key === "Content-Security-Policy")?.value;
      if (csp) expect(directive(csp, "frame-src"), r.source).toContain("'self'");
    }
  });
  it("with a real root domain, frame-src also allows the tenant subdomains (read from NEXT_PUBLIC_ROOT_DOMAIN)", async () => {
    const { cspOf, directive } = await load({ NEXT_PUBLIC_ROOT_DOMAIN: "example.org" });
    expect(directive(cspOf("/:path*"), "frame-src")).toEqual(expect.arrayContaining(["https://example.org", "https://*.example.org"]));
    expect(cspOf("/:path*")).not.toContain("calvy.io"); // nothing is hard-coded
  });
  it("a scheme and port in the env value are tolerated", async () => {
    const { cspOf, directive } = await load({ NEXT_PUBLIC_ROOT_DOMAIN: "https://example.org:443/" });
    expect(directive(cspOf("/:path*"), "frame-src")).toContain("https://*.example.org");
  });
  it("hosts without wildcard subdomains (localhost, vercel.app, an IP) add no subdomain sources", async () => {
    for (const domain of ["localhost:3000", "calvy-v2.vercel.app", "127.0.0.1"]) {
      const { cspOf, directive } = await load({ NEXT_PUBLIC_ROOT_DOMAIN: domain });
      expect(directive(cspOf("/:path*"), "frame-src").filter((s) => s.includes("*.") && !s.includes("cashfree"))).toEqual([]);
      expect(directive(cspOf("/:path*"), "frame-ancestors")).toEqual(["'self'"]);
    }
  });
  it("PUBLIC pages (tenant sites) may be framed by our own origin and tenant subdomains, never by third-party sites", async () => {
    const { cspOf, directive } = await load();
    const anc = directive(cspOf("/:path*"), "frame-ancestors");
    expect(anc).toEqual(["'self'", "https://calvy.io", "https://*.calvy.io"]);
    expect(anc).not.toContain("*");
    expect(anc.some((a) => /^https?:\/\/(?!(\*\.)?calvy\.io$)/.test(a))).toBe(false);
  });
  it("PRIVATE pages (dashboard, admin, crm, account, sign-in, onboarding) may only be framed by their own origin, and keep X-Frame-Options", async () => {
    const { rule, cspOf, directive } = await load();
    for (const source of ["/dashboard/:path*", "/admin/:path*", "/crm/:path*", "/account/:path*", "/login", "/signup", "/onboarding/:path*", "/dashboard/billing"]) {
      expect(directive(cspOf(source), "frame-ancestors"), source).toEqual(["'self'"]);
      expect(rule(source).headers.find((h) => h.key === "X-Frame-Options")?.value, source).toBe("SAMEORIGIN");
    }
  });
  it("the global rule has no X-Frame-Options (it would contradict the subdomain preview; frame-ancestors is the control)", async () => {
    const { rule } = await load();
    expect(rule("/:path*").headers.some((h) => h.key === "X-Frame-Options")).toBe(false);
  });
});

describe("audit of every third party the app loads in the browser, and that the policy allows exactly it", () => {
  it("Cashfree: SDK script, checkout frames, API calls, hosted form posts", async () => {
    const { cspOf, directive } = await load();
    const csp = cspOf("/:path*");
    expect(directive(csp, "script-src")).toContain("https://sdk.cashfree.com");
    expect(directive(csp, "frame-src")).toContain("https://*.cashfree.com");
    expect(directive(csp, "connect-src")).toContain("https://*.cashfree.com");
    expect(directive(csp, "form-action")).toContain("https://*.cashfree.com");
  });
  it("Facebook / WhatsApp Embedded Signup: SDK script, frames, calls", async () => {
    const { cspOf, directive } = await load();
    const csp = cspOf("/:path*");
    expect(directive(csp, "script-src")).toContain("https://connect.facebook.net");
    expect(directive(csp, "frame-src")).toEqual(expect.arrayContaining(["https://www.facebook.com", "https://web.facebook.com"]));
    expect(directive(csp, "connect-src")).toEqual(expect.arrayContaining(["https://*.facebook.com", "https://*.facebook.net"]));
  });
  it("Google Maps embed on tenant sites is a frame on www.google.com", async () => {
    const { cspOf, directive } = await load();
    expect(directive(cspOf("/:path*"), "frame-src")).toContain("https://www.google.com");
  });
  it("Sentry (browser reports), Vercel Blob (images, media, uploads), fonts and Vercel Analytics", async () => {
    const { cspOf, directive } = await load();
    const csp = cspOf("/:path*");
    expect(directive(csp, "connect-src")).toEqual(expect.arrayContaining(["https://*.ingest.sentry.io", "https://*.ingest.us.sentry.io", "https://*.public.blob.vercel-storage.com"]));
    expect(directive(csp, "media-src")).toContain("https://*.public.blob.vercel-storage.com");
    expect(directive(csp, "font-src")).toEqual(["'self'", "data:"]); // fonts are self-hosted (next/font/local): no Google Fonts host
    expect(directive(csp, "script-src").some((s) => s.includes("vercel"))).toBe(false); // Vercel Analytics is served from our own origin
  });
  it("images: Unsplash, ui-avatars, Blob and a pasted https link are all https images", async () => {
    const { cspOf, directive } = await load();
    expect(directive(cspOf("/:path*"), "img-src")).toEqual(expect.arrayContaining(["'self'", "data:", "blob:", "https:"]));
  });
  it("Stripe, PayPal, PhonePe, PayU, CCAvenue and Paytm are server-side or full-page redirects: no script or frame source is granted to them", async () => {
    const { cspOf, directive } = await load();
    const csp = cspOf("/:path*");
    for (const host of ["stripe", "paypal", "phonepe"]) for (const d of ["script-src", "frame-src", "connect-src"]) expect(directive(csp, d).join(" "), `${d} ${host}`).not.toContain(host);
    expect(directive(csp, "form-action")).toEqual(expect.arrayContaining(["https://secure.payu.in", "https://secure.ccavenue.com", "https://securegw.paytm.in"]));
  });
  it("no third-party client-side script is loaded that the policy does not name (source scan)", () => {
    const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");
    const roots = ["app", "components", "lib"];
    const hits = new Set<string>();
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(path.join(process.cwd(), dir), { withFileTypes: true })) {
        const rel = `${dir}/${e.name}`;
        if (e.isDirectory()) walk(rel);
        else if (/\.(ts|tsx)$/.test(e.name)) {
          const src = read(rel);
          for (const m of src.matchAll(/(?:s\.src\s*=|el\.src\s*=|<script[^>]*\ssrc=|loadPaymentScript\()\s*\{?\s*["'`](https:\/\/[^"'`/]+)/g)) hits.add(m[1]);
          for (const m of src.matchAll(/const \w*(?:SDK|_SDK)\w*\s*=\s*"(https:\/\/[^"/]+)/g)) hits.add(m[1]);
        }
      }
    };
    for (const r of roots) walk(r);
    const allowed = new Set(["https://sdk.cashfree.com", "https://connect.facebook.net", "https://checkout.razorpay.com"]);
    expect([...hits].filter((h) => !allowed.has(h))).toEqual([]);
  });
});

describe("no code in the browser needs 'unsafe-eval' (zod's probe is switched off)", () => {
  it("zod is configured jitless, so it never calls new Function (which a strict policy reports even when the error is caught)", async () => {
    vi.resetModules();
    await import("@/lib/zodConfig");
    const { globalConfig } = await import("zod/v4/core");
    expect(globalConfig.jitless).toBe(true);
    const { z } = await import("zod");
    const spy = vi.spyOn(globalThis, "Function");
    expect(z.object({ a: z.string(), b: z.number().optional() }).parse({ a: "x" })).toEqual({ a: "x" });
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
  it("the client Providers import it first, before any schema can run", () => {
    const src = fs.readFileSync(path.join(process.cwd(), "components/Providers.tsx"), "utf8");
    expect(src).toContain('import "@/lib/zodConfig"');
    expect(src.indexOf('import "@/lib/zodConfig"')).toBeLessThan(src.indexOf("from \""));
  });
});

describe("production policy hygiene", () => {
  it("no unsafe-eval in production, and object-src / base-uri stay locked", async () => {
    const { cspOf, directive } = await load();
    const csp = cspOf("/:path*");
    expect(directive(csp, "script-src")).not.toContain("'unsafe-eval'");
    expect(directive(csp, "object-src")).toEqual(["'none'"]);
    expect(directive(csp, "base-uri")).toEqual(["'self'"]);
  });
});
