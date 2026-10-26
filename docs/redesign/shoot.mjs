// Re-shoots the mockup screenshots: node docs/redesign/shoot.mjs
import { chromium } from "playwright";
import { readdirSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const mock = join(here, "mockups");
const outDir = join(here, "screenshots");
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
for (const file of readdirSync(mock).filter((f) => f.endsWith(".html") && f !== "index.html")) {
  for (const width of [375, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 900 }, deviceScaleFactor: width === 375 ? 2 : 1 });
    await page.goto(pathToFileURL(join(mock, file)).href, { waitUntil: "networkidle" });
    await page.evaluate(() => document.fonts.ready);
    // Grow the viewport to the page height so the sticky mobile book bar renders at the bottom, not mid-shot.
    const height = await page.evaluate(() => document.documentElement.scrollHeight);
    await page.setViewportSize({ width, height });
    await page.screenshot({ path: join(outDir, `${file.replace(".html", "")}-${width}.png`), fullPage: true });
    await page.close();
  }
}
await browser.close();
console.log("done");
