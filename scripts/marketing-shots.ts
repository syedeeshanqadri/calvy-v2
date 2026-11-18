// Captures the real product screens used on the marketing site, for both regions, from the demo data (npm run marketing:demo).
//   BASE_URL=http://localhost:3000 npm run marketing:shots      (a running app: `next start` or `next dev`)
// Output: public/marketing/{in,intl}/<name>.webp (phone shots 520px wide, desktop shots 1200px wide).
import { chromium, type Browser, type Page } from "playwright";
import { PrismaClient } from "@prisma/client";
import sharp from "sharp";
import { mkdirSync } from "node:fs";
import { signTrackingCode } from "../lib/tracking";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const PASSWORD = process.env.TEST_PASSWORD ?? "CalvyDev#2026";
const prisma = new PrismaClient();
const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1440, height: 900 };

async function save(page: Page, region: "in" | "intl", name: string, width: number, viewport: { width: number; height: number }) {
  mkdirSync(`public/marketing/${region}`, { recursive: true });
  const png = await page.screenshot({ type: "png", clip: { x: 0, y: 0, ...viewport } });
  await sharp(png).resize({ width }).webp({ quality: 82 }).toFile(`public/marketing/${region}/${name}.webp`);
  console.log(`  ${region}/${name}.webp`);
}

async function settle(page: Page) {
  await page.waitForLoadState("networkidle").catch(() => {});
  // Quiet anything that floats over a clean capture: the dev badge, install and push prompts, toasts.
  await page.addStyleTag({ content: "nextjs-portal,[data-nextjs-toast],[role=status]{display:none!important}" }).catch(() => {});
  // A plain string, so the TypeScript runner cannot inject helpers into code that runs in the page.
  await page.evaluate(`(() => {
    // The "enable sound" pill is a browser-permission prompt, not part of the product screen.
    document.querySelectorAll("button, div").forEach((el) => { const t = (el.textContent || "").trim(); if (t.length < 30 && /Tap to enable sound/.test(t)) el.style.display = "none"; });
    // Real screens, but no emoji on the marketing site; and show the address a business gets in production, not this machine's localhost.
    const swap = (v) => v.replace(/https?:\\/\\/localhost(?::\\d+)?\\/([a-z0-9-]+)/g, (m, slug) => "https://" + slug + ".calvy.io");
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      if (!n.nodeValue) continue;
      if (/\\p{Extended_Pictographic}/u.test(n.nodeValue)) n.nodeValue = n.nodeValue.replace(/\\s*\\p{Extended_Pictographic}\\uFE0F?/gu, "");
      if (/localhost/.test(n.nodeValue)) n.nodeValue = swap(n.nodeValue);
    }
    document.querySelectorAll("input").forEach((i) => { i.value = swap(i.value); });
  })()`);
  await page.waitForTimeout(900);
}

async function login(b: Browser, email: string, viewport: { width: number; height: number }) {
  const ctx = await b.newContext({ viewport, deviceScaleFactor: 2, isMobile: viewport.width < 500, locale: "en-US" });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.getByLabel("Email").fill(email);
  await page.getByPlaceholder("••••••••").fill(PASSWORD);
  await page.getByRole("button", { name: /sign in|log in/i }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 60_000 });
  return { ctx, page };
}

async function publicShot(b: Browser, region: "in" | "intl", name: string, path: string, width: number, viewport: { width: number; height: number }) {
  const ctx = await b.newContext({ viewport, deviceScaleFactor: 2, isMobile: viewport.width < 500, locale: "en-US" });
  const page = await ctx.newPage();
  await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
  await settle(page);
  await save(page, region, name, width, viewport);
  await ctx.close();
}

async function ownerShot(b: Browser, email: string, region: "in" | "intl", name: string, path: string, width: number, viewport: { width: number; height: number }) {
  const { ctx, page } = await login(b, email, viewport);
  await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
  await settle(page);
  await save(page, region, name, width, viewport);
  await ctx.close();
}

async function main() {
  const b = await chromium.launch();
  for (const region of ["in", "intl"] as const) {
    console.log(region === "in" ? "India" : "International");
    const salon = await prisma.business.findFirstOrThrow({ where: { owner: { email: `marketing-salon-${region}@calvy.test` } }, select: { slug: true } });
    const clinic = await prisma.business.findFirstOrThrow({ where: { owner: { email: `marketing-clinic-${region}@calvy.test` } }, select: { id: true, slug: true } });
    const salonEmail = `marketing-salon-${region}@calvy.test`;
    const clinicEmail = `marketing-clinic-${region}@calvy.test`;

    await publicShot(b, region, "booking", `/${salon.slug}/book`, 520, PHONE);
    await publicShot(b, region, "website", `/${salon.slug}`, 1200, DESKTOP);
    await ownerShot(b, salonEmail, region, "today", "/dashboard", 520, PHONE);
    await ownerShot(b, salonEmail, region, "services", "/dashboard/services", 520, PHONE);
    await ownerShot(b, salonEmail, region, "share", "/dashboard/booking-page", 520, PHONE);
    await ownerShot(b, salonEmail, region, "dashboard", "/dashboard", 1200, DESKTOP);
    await ownerShot(b, clinicEmail, region, "queue", "/dashboard/queue", 520, PHONE);

    const waiting = await prisma.appointment.findFirstOrThrow({ where: { businessId: clinic.id, queueState: "WAITING" }, orderBy: { tokenNumber: "asc" }, select: { id: true } });
    const code = signTrackingCode(waiting.id);
    if (!code) throw new Error("No tracking secret (NEXTAUTH_SECRET) in the environment.");
    await publicShot(b, region, "tracking", `/booking/${code}`, 520, PHONE);
  }
  await b.close();
}
main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
