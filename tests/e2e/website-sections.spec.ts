import { test, expect } from "@playwright/test";
import { defaultWebsiteConfig } from "../../lib/website";

// Saves FAQ + offer banner + gallery for the demo salon through the same API the editor uses,
// then checks they render on the public page. Needs `npm run db:seed`. The seeded salon has an empty websiteJson, so the
// test puts "{}" back at the end.
const OWNER = { email: "demo@calvy.io", password: process.env.E2E_OWNER_PASSWORD ?? "password123" };
const SALON = "alex-johnson-studio";

test("FAQ, banner and gallery saved by the owner appear on the public site", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel(/email/i).first().fill(OWNER.email);
  await page.locator('input[type="password"]').first().fill(OWNER.password);
  await page.getByRole("button", { name: /sign in|log in/i }).first().click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 60_000 });

  const base = defaultWebsiteConfig("Alex Johnson Studio", "Hair Salon");
  const config = {
    ...base,
    offer: { text: "E2E offer: 20% off this week", endsOn: "" },
    gallery: { title: "E2E gallery", images: [{ url: "https://images.unsplash.com/photo-1562322140-8baeececf3df?auto=format&fit=crop&w=800&q=70", alt: "E2E stylist at work" }] },
    faq: { title: "E2E questions", items: [{ q: "E2E: is there parking?", a: "Yes, free parking at the back." }] },
  };
  const save = await page.request.patch("/api/website", { data: { websiteJson: JSON.stringify(config) } });
  expect(save.ok(), await save.text()).toBe(true);

  await page.goto(`/${SALON}`);
  await expect(page.getByText("E2E offer: 20% off this week")).toBeVisible();
  await expect(page.getByRole("heading", { name: "E2E gallery" })).toBeVisible();
  await expect(page.getByAltText("E2E stylist at work")).toBeVisible();
  await expect(page.getByText("E2E: is there parking?")).toBeVisible();
  const ld = await page.locator('script[type="application/ld+json"]').allTextContents();
  expect(ld.some((t) => t.includes("FAQPage") && t.includes("E2E: is there parking?"))).toBe(true);

  // Switching a section off hides it.
  const off = await page.request.patch("/api/website", { data: { websiteJson: JSON.stringify({ ...config, faq: { ...config.faq, enabled: false }, offer: { ...config.offer, enabled: false } }) } });
  expect(off.ok()).toBe(true);
  await page.goto(`/${SALON}`);
  await expect(page.getByText("E2E: is there parking?")).toHaveCount(0);
  await expect(page.getByText("E2E offer: 20% off this week")).toHaveCount(0);

  const restore = await page.request.patch("/api/website", { data: { websiteJson: "{}" } });
  expect(restore.ok()).toBe(true);
});
