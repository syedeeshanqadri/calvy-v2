/**
 * Audit helper: DOM-level UX/a11y checks per page at 375px (read-only).
 * Usage: npx tsx scripts/audit-checks.ts  -> writes docs/audit/screenshots/DOM-CHECKS.json
 */
import { chromium, type Page } from "playwright";
import fs from "fs";
import path from "path";

const BASE = process.env.BASE_URL || "http://localhost:3000";
const T = "alex-johnson-studio";
const PW = "CalvyDev#2026";
const pub = ["/", "/blog", "/help", "/privacy", "/terms", "/refund-policy", "/signup", "/login", `/${T}`, `/${T}/book-now`, `/b/${T}`, "/booking/success", "/blog/test-how-to-reduce-no-shows"];
const dash = ["", "/analytics", "/appointments", "/billing", "/booking-page", "/broadcasts", "/calendar", "/clients", "/expenses", "/payments", "/services", "/settings", "/staff", "/support", "/wallet", "/website"].map((p) => "/dashboard" + p);
const admin = ["", "/blog", "/notifications", "/plans", "/revenue", "/settings", "/support", "/tenants", "/withdrawals"].map((p) => "/admin" + p).concat(["/crm"]);

async function login(page: Page, email: string, password: string) {
  await page.goto(BASE + "/login");
  await page.locator('input[type="email"]').first().fill(email);
  await page.locator('input[type="password"]').first().fill(password);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 20000 });
}

async function check(page: Page, url: string) {
  const errs: string[] = [];
  const onC = (m: any) => m.type() === "error" && errs.push(m.text().slice(0, 140));
  page.on("console", onC);
  const resp = await page.goto(BASE + url, { waitUntil: "load", timeout: 45000 }).catch(() => null);
  await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
  const data = await page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const vis = (el: Element) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none"; };
    const interactive = Array.from(document.querySelectorAll("a[href],button,input,select,textarea,[role=button]")).filter(vis);
    const small = interactive.filter((e) => { const r = e.getBoundingClientRect(); return r.width < 44 || r.height < 44; });
    const label = (e: Element) => ((e as HTMLElement).innerText || e.getAttribute("aria-label") || e.getAttribute("placeholder") || e.getAttribute("href") || e.tagName).trim().slice(0, 30);
    const inputs = Array.from(document.querySelectorAll("input:not([type=hidden]),select,textarea")).filter(vis);
    const unlabeled = inputs.filter((i) => {
      const id = i.getAttribute("id");
      return !(i.getAttribute("aria-label") || i.getAttribute("aria-labelledby") || (id && document.querySelector(`label[for="${id}"]`)) || i.closest("label"));
    });
    const iconBtnNoName = Array.from(document.querySelectorAll("button,a")).filter(vis).filter((b) => !(b as HTMLElement).innerText.trim() && !b.getAttribute("aria-label") && !b.getAttribute("title"));
    const imgNoAlt = Array.from(document.querySelectorAll("img")).filter((i) => !i.hasAttribute("alt"));
    const hashLinks = Array.from(document.querySelectorAll('a[href="#"],a[href=""]')).map(label);
    const wide = Array.from(document.querySelectorAll("body *")).filter((e) => vis(e) && e.getBoundingClientRect().right > vw + 2).slice(0, 4).map((e) => e.tagName.toLowerCase() + "." + String((e as HTMLElement).className).slice(0, 50));
    const tinyText = Array.from(document.querySelectorAll("body *")).filter((e) => e.childNodes.length && Array.from(e.childNodes).some((n) => n.nodeType === 3 && n.textContent!.trim()) && vis(e) && parseFloat(getComputedStyle(e).fontSize) < 12).length;
    const fonts = new Set<string>(); const sizes = new Set<string>();
    document.querySelectorAll("body *").forEach((e) => { if (Array.from(e.childNodes).some((n) => n.nodeType === 3 && n.textContent!.trim())) { const s = getComputedStyle(e); fonts.add(s.fontFamily.split(",")[0].replace(/"/g, "")); sizes.add(s.fontSize); } });
    return {
      title: document.title, h1: document.querySelectorAll("h1").length, lang: document.documentElement.lang,
      scrollW: document.documentElement.scrollWidth, vw, overflowX: document.documentElement.scrollWidth > vw + 1, wide,
      smallTargets: small.length, smallSample: small.slice(0, 5).map((e) => `${label(e)} ${Math.round(e.getBoundingClientRect().width)}x${Math.round(e.getBoundingClientRect().height)}`),
      unlabeledInputs: unlabeled.length, unlabeledSample: unlabeled.slice(0, 4).map(label), iconBtnNoName: iconBtnNoName.length, imgNoAlt: imgNoAlt.length, hashLinks, tinyText,
      fonts: Array.from(fonts), sizes: Array.from(sizes), viewportMeta: !!document.querySelector('meta[name=viewport]'),
    };
  });
  page.off("console", onC);
  return { url, status: resp?.status() ?? 0, finalPath: new URL(page.url()).pathname, consoleErrors: errs.slice(0, 3), ...data };
}

(async () => {
  const browser = await chromium.launch();
  const out: any[] = [];
  const run = async (urls: string[], creds?: [string, string]) => {
    const ctx = await browser.newContext({ viewport: { width: 375, height: 812 } });
    await ctx.addInitScript("window.__name = (f) => f;");
    const page = await ctx.newPage();
    if (creds) await login(page, ...creds);
    for (const u of urls) out.push(await check(page, u).catch((e) => ({ url: u, error: String(e).slice(0, 100) })));
    await ctx.close();
  };
  await run(pub);
  await run(dash, ["demo@calvy.io", "password123"]);
  await run(admin, ["admin@calvy.test", PW]);
  await browser.close();
  fs.writeFileSync(path.join(process.cwd(), "docs/audit/screenshots/DOM-CHECKS.json"), JSON.stringify(out, null, 1));
  for (const r of out) console.log(r.error ? `${r.url} ERR ${r.error}` : `${r.url} [${r.status}${r.finalPath !== r.url.split("?")[0] ? "->" + r.finalPath : ""}] h1=${r.h1} ovfX=${r.overflowX}(${r.scrollW}) small=${r.smallTargets} unlbl=${r.unlabeledInputs} noname=${r.iconBtnNoName} noalt=${r.imgNoAlt} hash=${r.hashLinks.length} tiny=${r.tinyText} fonts=${r.fonts.length} sizes=${r.sizes.length} err=${r.consoleErrors.length} title="${r.title.slice(0, 40)}"`);
})();
