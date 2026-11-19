import { test, expect } from "@playwright/test";

// Step 36a: every click reacts at once. The route-progress bar shows on a link click and finishes after navigation; a pressed button scales down.
const barOpacity = (page: import("@playwright/test").Page) => page.evaluate(() => Number(getComputedStyle(document.querySelector(".route-progress")!).opacity));

test("a link click shows the top progress bar, which finishes once the page has changed", async ({ page }) => {
  // Record that the bar was shown (its inline opacity went to 1) at any moment, however brief.
  await page.addInitScript(() => {
    (window as unknown as { __barShown: boolean }).__barShown = false;
    new MutationObserver(() => {
      const e = document.querySelector(".route-progress") as HTMLElement | null;
      if (e && e.style.opacity === "1") (window as unknown as { __barShown: boolean }).__barShown = true;
    }).observe(document, { subtree: true, attributes: true, attributeFilter: ["style"], childList: true });
  });
  await page.goto("/login", { waitUntil: "networkidle" });
  expect(await page.evaluate(() => (window as unknown as { __barShown: boolean }).__barShown)).toBe(false);
  await page.locator('a[href="/signup"]').first().click();
  await expect(page).toHaveURL(/signup/, { timeout: 30_000 });
  expect(await page.evaluate(() => (window as unknown as { __barShown: boolean }).__barShown)).toBe(true);
  await expect.poll(() => barOpacity(page), { timeout: 5000 }).toBe(0); // and it finishes
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
