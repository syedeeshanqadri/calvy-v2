/**
 * Audit helper: screenshots every page at 375px and 1440px.
 * Usage: npx tsx scripts/screenshot-all.ts   (dev server must be on BASE_URL)
 * Read-only: never submits the booking, never mutates data.
 */
import { chromium, type Browser, type Page } from "playwright";
import fs from "fs";
import path from "path";

const BASE = process.env.BASE_URL || "http://localhost:3000";
const EMAIL = process.env.DEMO_EMAIL || "demo@calvy.io";
const PASSWORD = process.env.DEMO_PASSWORD || "password123";
const TEST_PASSWORD = process.env.TEST_PASSWORD || "CalvyDev#2026"; // dev-only seed accounts
const ADMIN_EMAIL = "admin@calvy.test";
const NEWOWNER_EMAIL = "newowner@calvy.test";
const TENANT = process.env.TENANT_SLUG || "alex-johnson-studio";
const OUT = path.join(process.cwd(), "docs", "audit", "screenshots");
const VIEWPORTS = [
  { name: "375", width: 375, height: 812 },
  { name: "1440", width: 1440, height: 900 },
] as const;

type Result = { name: string; vp: string; ok: boolean; note?: string };
const results: Result[] = [];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function shot(page: Page, group: string, name: string, vp: string) {
  const dir = path.join(OUT, group);
  fs.mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: path.join(dir, `${name}-${vp}.png`), fullPage: true });
}

/** Visit a URL and screenshot it; records HTTP errors / redirects as notes. */
async function capturePage(page: Page, vp: string, group: string, name: string, url: string) {
  const label = `${group}/${name}`;
  try {
    const resp = await page.goto(BASE + url, { waitUntil: "load", timeout: 45000 });
    await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
    await sleep(400);
    const status = resp?.status() ?? 0;
    const finalPath = new URL(page.url()).pathname;
    const redirected = finalPath !== url.split("?")[0] ? ` redirected->${finalPath}` : "";
    await shot(page, group, name, vp);
    const bad = status >= 400;
    results.push({ name: label, vp, ok: !bad, note: bad ? `HTTP ${status}${redirected}` : redirected.trim() || undefined });
  } catch (e) {
    results.push({ name: label, vp, ok: false, note: (e as Error).message.split("\n")[0] });
  }
}

async function login(page: Page, email = EMAIL, password = PASSWORD): Promise<boolean> {
  await page.goto(BASE + "/login", { waitUntil: "load" });
  await page.locator('input[type="email"]').first().fill(email);
  await page.locator('input[type="password"]').first().fill(password);
  await page.locator('button[type="submit"]').first().click();
  try {
    await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 20000 });
    return true;
  } catch {
    return false;
  }
}

async function firstHref(page: Page, url: string, prefix: string): Promise<string | null> {
  await page.goto(BASE + url, { waitUntil: "load" });
  await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
  const hrefs = await page.$$eval("a[href]", (as) => as.map((a) => a.getAttribute("href") || ""));
  return hrefs.find((h) => h.startsWith(prefix) && h.length > prefix.length) ?? null;
}

async function bookingFlow(page: Page, vp: string) {
  const group = "booking-flow";
  const url = `/b/${TENANT}`;
  const step = async (name: string) => {
    await sleep(400);
    try {
      await shot(page, group, name, vp);
      results.push({ name: `${group}/${name}`, vp, ok: true });
    } catch (e) {
      results.push({ name: `${group}/${name}`, vp, ok: false, note: (e as Error).message.split("\n")[0] });
    }
  };
  const fail = (name: string, note: string) => results.push({ name: `${group}/${name}`, vp, ok: false, note });
  const next = () => page.getByRole("button", { name: /^Continue/ }).click();

  try {
    await page.goto(BASE + url, { waitUntil: "load" });
    await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
  } catch (e) {
    return fail("1-service", (e as Error).message.split("\n")[0]);
  }
  await step("1-service");

  try {
    await page.locator("button.rounded-2xl.border-2").first().click();
    await next();
    await step("2-staff");
  } catch (e) { return fail("2-staff", (e as Error).message.split("\n")[0]); }

  try {
    await page.locator("button.rounded-2xl.border-2").first().click(); // "No preference"
    await next();
    await step("3-datetime-empty");
  } catch (e) { return fail("3-datetime", (e as Error).message.split("\n")[0]); }

  try {
    // pick the first enabled day that offers time slots
    const days = page.locator("div.grid-cols-7.gap-1 button:not([disabled])");
    const n = await days.count();
    let picked = false;
    for (let i = 0; i < Math.min(n, 14) && !picked; i++) {
      await days.nth(i).click();
      await sleep(900);
      const slots = page.locator("text=/^\\d{1,2}:\\d{2}/");
      if ((await slots.count()) > 0) { await slots.first().click(); picked = true; }
    }
    await step("3-datetime-selected");
    if (!picked) return fail("3-datetime-slot", "no available slot found in next 14 enabled days");
    await next();
    await step("4-details-empty");
  } catch (e) { return fail("3-datetime-slot", (e as Error).message.split("\n")[0]); }

  try {
    await page.locator('input[placeholder="Jane Smith"]').fill("Audit Tester");
    await page.locator('input[type="email"]').fill("audit@example.com");
    await step("4-details-filled");
    await next();
    await step("5-confirm"); // intentionally NOT clicking "Confirm booking"
  } catch (e) { fail("4-details/5-confirm", (e as Error).message.split("\n")[0]); }
}

async function run(browser: Browser, vp: (typeof VIEWPORTS)[number]) {
  // --- public (logged out) ---
  const pub = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
  const p = await pub.newPage();
  const publicPages: [string, string, string][] = [
    ["marketing", "home", "/"],
    ["marketing", "blog", "/blog"],
    ["marketing", "help", "/help"],
    ["marketing", "privacy", "/privacy"],
    ["marketing", "terms", "/terms"],
    ["marketing", "refund-policy", "/refund-policy"],
    ["auth", "signup", "/signup"],
    ["auth", "login", "/login"],
    ["auth", "verify-email", "/verify-email"],
    ["tenant-site", "tenant-home", `/${TENANT}`],
    ["tenant-site", "tenant-book-now", `/${TENANT}/book-now`],
    ["tenant-site", "tenant-b-page", `/b/${TENANT}`],
    ["booking", "booking", "/booking"],
    ["booking", "booking-success-no-params", "/booking/success"], // known 500 (bug)
    ["booking", "booking-success", "/booking/success?razorpay_payment_link_id=plink_audit&razorpay_payment_link_status=paid"],
  ];
  for (const [g, n, u] of publicPages) await capturePage(p, vp.name, g, n, u);

  const blogHref = await firstHref(p, "/blog", "/blog/").catch(() => null);
  if (blogHref) await capturePage(p, vp.name, "marketing", "blog-post", blogHref);
  else results.push({ name: "marketing/blog-post", vp: vp.name, ok: false, note: "no blog post link found" });
  const helpHref = await firstHref(p, "/help", "/help/").catch(() => null);
  if (helpHref) await capturePage(p, vp.name, "marketing", "help-article", helpHref);
  else results.push({ name: "marketing/help-article", vp: vp.name, ok: false, note: "no help article link found" });

  await bookingFlow(p, vp.name);
  await pub.close();

  // --- authenticated ---
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
  const page = await ctx.newPage();
  if (!(await login(page))) {
    for (const n of ["dashboard/*", "admin/*", "crm"]) results.push({ name: n, vp: vp.name, ok: false, note: "login failed" });
    await ctx.close();
    return;
  }
  const dash = [
    "", "/analytics", "/appointments", "/billing", "/booking-page", "/broadcasts", "/calendar", "/clients",
    "/expenses", "/payments", "/services", "/settings", "/staff", "/support", "/wallet", "/website",
  ];
  for (const d of dash) await capturePage(page, vp.name, "dashboard", d ? d.slice(1) : "home", "/dashboard" + d);
  const clientHref = await firstHref(page, "/dashboard/clients", "/dashboard/clients/").catch(() => null);
  if (clientHref) await capturePage(page, vp.name, "dashboard", "client-detail", clientHref);
  else results.push({ name: "dashboard/client-detail", vp: vp.name, ok: false, note: "no client link found" });

  const admin = ["", "/blog", "/notifications", "/plans", "/revenue", "/settings", "/support", "/tenants", "/withdrawals"];
  await ctx.close();

  // --- super admin ---
  const actx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
  const apage = await actx.newPage();
  if (await login(apage, ADMIN_EMAIL, TEST_PASSWORD)) {
    for (const a of admin) await capturePage(apage, vp.name, "admin", a ? a.slice(1) : "home", "/admin" + a);
    await capturePage(apage, vp.name, "crm", "crm", "/crm");
  } else results.push({ name: "admin/*", vp: vp.name, ok: false, note: "admin login failed" });
  await actx.close();

  // --- new owner: onboarding (single-form step; never submitted) ---
  const nctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
  const npage = await nctx.newPage();
  if (await login(npage, NEWOWNER_EMAIL, TEST_PASSWORD)) {
    await capturePage(npage, vp.name, "onboarding", "1-empty", "/onboarding");
    try {
      await npage.getByRole("button", { name: "Finish setup" }).click(); // client-side validation only, no request
      await sleep(300);
      await shot(npage, "onboarding", "2-validation-error", vp.name);
      await npage.getByPlaceholder("e.g. Glow Beauty Studio").fill("Audit Test Studio");
      await npage.locator("select").selectOption({ index: 1 });
      await shot(npage, "onboarding", "3-filled", vp.name);
      results.push({ name: "onboarding/2-validation-error+3-filled", vp: vp.name, ok: true });
    } catch (e) {
      results.push({ name: "onboarding/steps", vp: vp.name, ok: false, note: (e as Error).message.split("\n")[0] });
    }
  } else results.push({ name: "onboarding/*", vp: vp.name, ok: false, note: "newowner login failed" });
  await nctx.close();
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  for (const vp of VIEWPORTS) await run(browser, vp);
  await browser.close();

  const ok = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok);
  const noted = results.filter((r) => r.ok && r.note);
  const lines = [
    `# Screenshot run`,
    ``,
    `Base: ${BASE} | captured OK: ${ok}/${results.length} | failed: ${failed.length}`,
    ``,
    `## Failed`,
    ...failed.map((r) => `- ${r.name} @${r.vp}: ${r.note}`),
    ``,
    `## Captured but redirected`,
    ...noted.map((r) => `- ${r.name} @${r.vp}: ${r.note}`),
    ``,
    `## All`,
    ...results.map((r) => `- [${r.ok ? "x" : " "}] ${r.name} @${r.vp}${r.note ? " — " + r.note : ""}`),
  ];
  fs.writeFileSync(path.join(OUT, "RUN-REPORT.md"), lines.join("\n"));
  console.log(lines.slice(0, 3).join("\n"));
  console.log("Failed:\n" + failed.map((r) => `  ${r.name} @${r.vp}: ${r.note}`).join("\n"));
  console.log("Redirected:\n" + noted.map((r) => `  ${r.name} @${r.vp}: ${r.note}`).join("\n"));
})();
