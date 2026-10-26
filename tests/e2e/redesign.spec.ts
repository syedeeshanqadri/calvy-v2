import { test, expect } from "@playwright/test";

// step-6/redesign-final-check: the redesigned public site and both booking flows for the demo
// salon and clinic. Read-only (nothing is booked); the booking flows are walked to the date step.
const SITES = [
  { name: "salon", slug: "alex-johnson-studio" },
  { name: "clinic", slug: "city-care-clinic" },
];

for (const { name, slug } of SITES) {
  test(`${name}: website renders without horizontal scroll`, async ({ page }) => {
    const res = await page.goto(`/${slug}`);
    expect(res?.status()).toBe(200);
    await expect(page.locator("h1").first()).toBeVisible();
    const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(over).toBeLessThanOrEqual(0);
  });

  test(`${name}: full-page booking flow reaches the date step`, async ({ page }) => {
    const res = await page.goto(`/${slug}/book-now`);
    expect(res?.status()).toBe(200);
    await expect(page.getByText("Choose services")).toBeVisible();
    await page.locator("main button, [role=button]").filter({ hasText: /\d/ }).first().click();
    await page.getByRole("button", { name: /continue/i }).click();
    const noPref = page.getByText("No preference");
    if (await noPref.count()) { await noPref.first().click(); await page.getByRole("button", { name: /continue/i }).click(); }
    await expect(page.getByText(/Pick a date/i).first()).toBeVisible();
  });

  test(`${name}: chat booking route loads`, async ({ page }) => {
    const res = await page.goto(`/b/${slug}`);
    expect(res?.status()).toBe(200);
    await expect(page.getByText("Choose services")).toBeVisible();
    const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(over).toBeLessThanOrEqual(0);
  });
}
