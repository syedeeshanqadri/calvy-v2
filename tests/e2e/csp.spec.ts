import { test, expect, Page } from "@playwright/test";

// Fails on any 'securitypolicyviolation' event (a Content-Security-Policy block) on the pages that load third parties. Run against a PRODUCTION
// build (the CI smoke job does), because the development policy is looser. Needs `npm run db:seed` first, like the smoke suite.
//
//   npx playwright test tests/e2e/csp.spec.ts --project=desktop-1440
//
// What it covers: /, /onboarding, /dashboard/billing, /dashboard/settings/whatsapp, /admin (a 404 for a non-admin: still a page with a policy)
// and a business booking page. Plus a check that the detector works (a script from a host nobody allowed IS reported), that Razorpay Checkout's
// hosts are allowed on the billing page and refused elsewhere, and that framing follows the policy.
//
// IMPORTANT: this test never calls page.evaluate() on the pages it watches. Playwright runs evaluate() through an eval() inside the page, which the
// production policy (rightly) refuses, so the test would report a violation it caused itself. Violations are sent out through an exposed binding,
// and everything the test needs to do inside the page (add a script, add a frame) is done by an init script that runs on load.

const OWNER = { email: "demo@calvy.io", password: process.env.E2E_OWNER_PASSWORD ?? "password123" };
const SALON = "alex-johnson-studio";

interface Violation { directive: string; blocked: string; page: string; source: string }
type Probe = "razorpay" | "stranger" | "own-frame" | null;

async function watchViolations(page: Page, probe: Probe = null) {
  const seen: Violation[] = [];
  await page.exposeFunction("__cspSeen", (v: Violation) => { seen.push(v); });
  await page.addInitScript((which) => {
    const w = window as unknown as { __cspSeen: (v: unknown) => void };
    document.addEventListener("securitypolicyviolation", (e) => {
      w.__cspSeen({ directive: e.violatedDirective, blocked: e.blockedURI, page: location.pathname, source: `${e.sourceFile}:${e.lineNumber}` });
    });
    if (!which) return;
    window.addEventListener("load", () => {
      const add = (tag: "script" | "iframe", src: string) => { const el = document.createElement(tag); el.src = src; if (tag === "iframe") el.style.display = "none"; (tag === "script" ? document.head : document.body).appendChild(el); };
      if (which === "razorpay") { add("script", "https://checkout.razorpay.com/v1/checkout.js"); add("iframe", "https://api.razorpay.com/"); }
      if (which === "stranger") add("script", "https://not-allowed.example/x.js");
      if (which === "own-frame") add("iframe", "/");
    });
  }, probe);
  // The browser also prints a console error for each block: a second signal, kept from every navigation.
  const consoleBlocks: string[] = [];
  page.on("console", (m) => { if (m.type() === "error" && /content security policy/i.test(m.text())) consoleBlocks.push(m.text().slice(0, 300)); });
  return { seen, consoleBlocks };
}
type Watch = Awaited<ReturnType<typeof watchViolations>>;

async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByPlaceholder("you@business.com").fill(OWNER.email);
  await page.getByPlaceholder("••••••••").fill(OWNER.password);
  await page.getByRole("button", { name: /sign in|log in/i }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 60_000 });
}

/** Visit a page, let it settle, and fail with every blocked resource named. */
async function expectNoViolations(page: Page, path: string, watch: Watch) {
  const before = watch.seen.length, beforeConsole = watch.consoleBlocks.length;
  await page.goto(path, { waitUntil: "networkidle" }).catch(() => page.goto(path));
  await page.waitForTimeout(1500); // late scripts (the Facebook SDK, analytics) load after idle
  expect(watch.seen.slice(before), `${path} was blocked by the Content-Security-Policy`).toEqual([]);
  expect(watch.consoleBlocks.slice(beforeConsole), `${path} logged CSP errors`).toEqual([]);
}

test("public pages: the home page and a booking page load with no policy violation", async ({ page }) => {
  const watch = await watchViolations(page);
  await expectNoViolations(page, "/", watch);
  await expectNoViolations(page, `/${SALON}`, watch);
  await expectNoViolations(page, `/${SALON}/book`, watch);
});

test("signed-in pages: onboarding, billing, WhatsApp settings and admin load with no policy violation", async ({ page }) => {
  const watch = await watchViolations(page);
  await signIn(page);
  for (const path of ["/onboarding", "/dashboard/billing", "/dashboard/settings/whatsapp", "/admin"]) await expectNoViolations(page, path, watch);
});

test("the detector works: a script from a host nobody allowed is reported", async ({ page }) => {
  const watch = await watchViolations(page, "stranger");
  await page.goto("/", { waitUntil: "load" });
  await page.waitForTimeout(800);
  expect(watch.seen.some((v) => v.directive.startsWith("script-src") && v.blocked.includes("not-allowed.example"))).toBe(true);
});

test("Razorpay Checkout's hosts are allowed on the billing page only", async ({ page, context }) => {
  await signIn(page);
  const probeOn = async (path: string) => {
    const p = await context.newPage();
    const watch = await watchViolations(p, "razorpay");
    await p.goto(path, { waitUntil: "load" });
    await p.waitForTimeout(1000);
    await p.close();
    return watch.seen;
  };
  // Billing: no policy violation for Razorpay (the network may still fail in CI; that is not a policy block).
  expect((await probeOn("/dashboard/billing")).filter((v) => v.blocked.includes("razorpay")), "billing").toEqual([]);
  // Elsewhere: the same load is refused, which proves the policy is scoped to the billing page.
  expect((await probeOn("/dashboard/services")).some((v) => v.blocked.includes("razorpay")), "services").toBe(true);
});

test("framing follows the policy: our own pages may be framed by us, private pages by nobody else", async ({ page, request }) => {
  const ancestorsOf = async (path: string) => {
    const res = await request.get(path);
    const csp = res.headers()["content-security-policy"] ?? "";
    return { csp, ancestors: (csp.split("; ").find((d) => d.startsWith("frame-ancestors")) ?? "").split(" ").slice(1), xfo: res.headers()["x-frame-options"] };
  };
  const site = await ancestorsOf(`/${SALON}`);
  expect(site.ancestors[0]).toBe("'self'");
  expect(site.ancestors.includes("*")).toBe(false);
  expect(site.csp).toMatch(/frame-src 'self'/);
  const dash = await ancestorsOf("/dashboard");
  expect(dash.ancestors).toEqual(["'self'"]);
  expect(dash.xfo).toBe("SAMEORIGIN");
  // A same-origin frame (the onboarding site preview) is not blocked.
  const watch = await watchViolations(page, "own-frame");
  await page.goto("/", { waitUntil: "load" });
  await page.waitForTimeout(1000);
  expect(watch.seen.filter((v) => v.directive.startsWith("frame"))).toEqual([]);
});
