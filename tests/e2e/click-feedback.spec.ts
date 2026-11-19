import { test, expect } from "@playwright/test";

// Step 36a: every click reacts at once. The route-progress bar shows on a link click and finishes after navigation; a pressed button scales down.
const SALON = "alex-johnson-studio";
const barOpacity = (page: import("@playwright/test").Page) => page.evaluate(() => Number(getComputedStyle(document.querySelector(".route-progress")!).opacity));

test("a link click shows the top progress bar, which finishes once the page has changed", async ({ page }) => {
  await page.goto(`/${SALON}`, { waitUntil: "networkidle" });
  expect(await barOpacity(page)).toBe(0);
  await page.route("**/*", async (route) => { if (route.request().resourceType() === "document" || route.request().url().includes("_rsc")) await new Promise((r) => setTimeout(r, 400)); await route.continue(); });
  const link = page.locator(`a[href*="book"]`).first();
  await link.click({ noWaitAfter: true });
  await expect.poll(() => barOpacity(page), { timeout: 3000 }).toBe(1);
  await expect(page).toHaveURL(/book/, { timeout: 30_000 });
  await expect.poll(() => barOpacity(page), { timeout: 5000 }).toBe(0);
});

test("a pressed button visibly depresses", async ({ page }) => {
  await page.goto("/login");
  const btn = page.getByRole("button", { name: /sign in|log in/i }).first();
  await btn.hover();
  await page.mouse.down();
  const scale = await btn.evaluate((el) => getComputedStyle(el).scale);
  await page.mouse.up();
  expect(parseFloat(scale)).toBeLessThan(1);
});
