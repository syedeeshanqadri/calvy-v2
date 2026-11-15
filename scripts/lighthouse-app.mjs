// Lighthouse (mobile) on the signed-in Today and Queue screens.
//   AUDIT_OUT=dir BASE_URL=http://localhost:3300 npx dotenv -e .env.local -- node scripts/lighthouse-app.mjs
// Signs in with Playwright, leaves that Chromium open on a debugging port, and points Lighthouse at it (storage is NOT reset, so the session stays).
import { chromium } from "playwright";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import path from "node:path";

const BASE = process.env.BASE_URL ?? "http://localhost:3300";
const OUT = process.env.AUDIT_OUT;
const PORT = 9333;
const EMAIL = process.env.LH_EMAIL ?? "clinic@calvy.test";
const PASSWORD = process.env.LH_PASSWORD ?? process.env.TEST_PASSWORD ?? "CalvyDev#2026";
const PAGES = [["today", "/dashboard"], ["queue", "/dashboard/queue"]];
const run = promisify(execFile);

fs.mkdirSync(path.join(OUT, "lighthouse"), { recursive: true });
// A persistent profile = the browser's DEFAULT context, which is where Lighthouse opens its tab, so the sign-in is shared.
const profile = fs.mkdtempSync(path.join(OUT, "lh-profile-"));
const browser = await chromium.launchPersistentContext(profile, { args: [`--remote-debugging-port=${PORT}`], viewport: { width: 412, height: 915 } });
const page = browser.pages()[0] ?? (await browser.newPage());
await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 90000 });
await page.getByLabel(/email/i).first().fill(EMAIL);
await page.locator('input[type="password"]').first().fill(PASSWORD);
await page.getByRole("button", { name: /sign in|log in/i }).first().click();
await page.waitForURL(/\/dashboard/, { timeout: 90000 });

const results = {};
for (const [name, route] of PAGES) {
  const file = path.join(OUT, "lighthouse", `${name}.json`);
  try {
    await run("npx", ["--yes", "lighthouse@12", `${BASE}${route}`, `--port=${PORT}`, "--only-categories=performance,accessibility", "--form-factor=mobile", "--disable-storage-reset", "--quiet", "--output=json", `--output-path=${file}`], { timeout: 240000, maxBuffer: 64 * 1024 * 1024 });
    const j = JSON.parse(fs.readFileSync(file, "utf8"));
    const failing = Object.values(j.audits).filter((a) => a.score !== null && a.score < 0.9 && a.scoreDisplayMode !== "informative" && a.scoreDisplayMode !== "notApplicable" && a.scoreDisplayMode !== "manual").map((a) => `${a.id} ${Math.round(a.score * 100)}`);
    results[name] = { performance: Math.round(j.categories.performance.score * 100), accessibility: Math.round(j.categories.accessibility.score * 100), lcp: j.audits["largest-contentful-paint"].displayValue, tbt: j.audits["total-blocking-time"].displayValue, cls: j.audits["cumulative-layout-shift"].displayValue, finalUrl: new URL(j.finalDisplayedUrl).pathname, failing };
  } catch (e) { results[name] = { error: String(e).slice(0, 300) }; }
}
fs.writeFileSync(path.join(OUT, "lighthouse", "summary.json"), JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
await browser.close();
fs.rmSync(profile, { recursive: true, force: true });
