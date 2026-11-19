import { test, expect, Page } from "@playwright/test";

// Fails on any 'securitypolicyviolation' event (a Content-Security-Policy block) on the pages that load third parties. Run against a PRODUCTION
// build (the CI smoke job does), because the development policy is looser. Needs `npm run db:seed` first, like the smoke suite.
//
//   npx playwright test tests/e2e/csp.spec.ts --project=desktop-1440
//
// What it covers: /, /onboarding, /dashboard/billing, /dashboard/settings/whatsapp, /admin (a 404 for a non-admin: still a page with a policy)
// and a business booking page. Plus a check that the detector works (a script from a host nobody allowed IS reported), that Razorpay Checkout's
// hosts are allowed on the billing page and refused elsewhere, and that framing follows the policy.

const OWNER = { email: "demo@calvy.io", password: process.env.E2E_OWNER_PASSWORD ?? "password123" };
const SALON = "alex-johnson-studio";

interface Violation { directive: string; blocked: string; page: string }

async function watchViolations(page: Page) {
  await page.addInitScript(() => {
    (window as unknown as { __csp: Violation[] }).__csp = [];
    document.addEventListener("securitypolicyviolation", (e) => {
      (window as unknown as { __csp: Violation[] }).__csp.push({ directive: e.violatedDirective, blocked: e.blockedURI, page: location.pathname });
    });
  });
  // The browser also prints a console error for each block: a second signal, kept from every navigation.
  const consoleBlocks: string[] = [];
  page.on("console", (m) => { if (m.type() === "error" && /content security policy/i.test(m.text())) consoleBlocks.push(m.text().slice(0, 300)); });
  return {
    violations: async (): Promise<Violation[]> => page.evaluate(() => (window as unknown as { __csp?: Violation[] }).__csp ?? []).catch(() => []),
    consoleBlocks,
  };
}

async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByPlaceholder("you@business.com").fill(OWNER.email);
  await page.getByPlaceholder("••••••••").fill(OWNER.password);
  await page.getByRole("button", { name: /sign in|log in/i }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 60_000 });
}

/** Visit a page, let it settle, and fail with every blocked resource named. */
async function expectNoViolations(page: Page, path: string, watch: Awaited<ReturnType<typeof watchViolations>>) {
  await page.goto(path, { waitUntil: "networkidle" }).catch(() => page.goto(path));
  await page.waitForTimeout(1500); // late scripts (the Facebook SDK, analytics) load after idle
  const found = await watch.violations();
  expect(found, `${path} was blocked by the Content-Security-Policy`).toEqual([]);
  expect(watch.consoleBlocks, `${path} logged CSP errors`).toEqual([]);
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
  const watch = await watchViolations(page);
  await page.goto("/");
  await page.evaluate(() => { const s = document.createElement("script"); s.src = "https://not-allowed.example/x.js"; document.head.appendChild(s); });
  await page.waitForTimeout(500);
  const found = await watch.violations();
  expect(found.some((v) => v.directive.startsWith("script-src") && v.blocked.includes("not-allowed.example"))).toBe(true);
});

test("Razorpay Checkout's hosts are allowed on the billing page only", async ({ page }) => {
  const watch = await watchViolations(page);
  await signIn(page);
  const inject = (path: string) => page.goto(path).then(() => page.evaluate(() => {
    const s = document.createElement("script"); s.src = "https://checkout.razorpay.com/v1/checkout.js"; document.head.appendChild(s);
    const f = document.createElement("iframe"); f.src = "https://api.razorpay.com/"; f.style.display = "none"; document.body.appendChild(f);
  })).then(() => page.waitForTimeout(800)).then(() => watch.violations());
  // Billing: no policy violation for Razorpay (the network may still fail in CI; that is not a policy block).
  const onBilling = await inject("/dashboard/billing");
  expect(onBilling.filter((v) => v.blocked.includes("razorpay")), "billing").toEqual([]);
  // Elsewhere: the same load is refused, which proves the policy is scoped to the billing page.
  const onServices = await inject("/dashboard/services");
  expect(onServices.some((v) => v.blocked.includes("razorpay")), "services").toBe(true);
});

test("framing follows the policy: our own pages may be framed by us, private pages by nobody else", async ({ page, request }) => {
  const watch = await watchViolations(page);
  const ancestorsOf = async (path: string) => {
    const res = await request.get(path);
    const csp = res.headers()["content-security-policy"] ?? "";
    return { csp, ancestors: (csp.split("; ").find((d) => d.startsWith("frame-ancestors")) ?? "").split(" ").slice(1), xfo: res.headers()["x-frame-options"] };
  };
  const site = await ancestorsOf(`/${SALON}`);
  expect(site.ancestors[0]).toBe("'self'");
  expect(site.ancestors.some((a) => a === "*" || /^https?:\/\/(?!(\*\.)?[a-z0-9.-]+$)/.test(a))).toBe(false);
  expect(site.csp).toMatch(/frame-src 'self'/);
  const dash = await ancestorsOf("/dashboard");
  expect(dash.ancestors).toEqual(["'self'"]);
  expect(dash.xfo).toBe("SAMEORIGIN");
  // A same-origin frame of a tenant site works (the onboarding preview).
  await page.goto("/");
  await page.evaluate((src) => { const f = document.createElement("iframe"); f.src = src; document.body.appendChild(f); }, `/${SALON}`);
  await page.waitForTimeout(1000);
  expect((await watch.violations()).filter((v) => v.directive.startsWith("frame"))).toEqual([]);
});
