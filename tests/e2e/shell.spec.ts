import { test, expect, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { withAdminFixture, type AdminFixture } from "../../scripts/e2e-admin-fixture";
import { signInAsFixtureAdmin } from "./helpers/admin";

// Step 36c: the admin and dashboard shells. At 375, 768, 1024 and 1440px, on every /admin route and the main /dashboard routes:
//   - the main content starts below the header and sits inside the viewport,
//   - the page itself never scrolls sideways (a wide table scrolls inside its card),
//   - at phone width the admin menu is a drawer: backdrop, Escape closes it, focus stays inside and returns to the menu button.
// Screenshots (SHELL_SHOTS=1) go to docs/audit/step-36c/.
//
// The admin half needs the fixture admin (scripts/e2e-admin-fixture.ts): it only runs where that is allowed (CI's own database, or a local database that
// is not on the PROD_DB_HOSTS list) and always cleans up. Run locally with:
//   SHELL_SHOTS=1 npx dotenv -e .env.local -- npx playwright test tests/e2e/shell.spec.ts --project=desktop-1440

const WIDTHS = [375, 768, 1024, 1440] as const;
const ADMIN_ROUTES = [
  "/admin", "/admin/businesses", "/admin/businesses/new", "/admin/plans", "/admin/revenue", "/admin/billing", "/admin/offers", "/admin/coupons", "/admin/customers",
  "/admin/referrals", "/admin/rewards", "/admin/notifications", "/admin/notifications/log", "/admin/whatsapp-review", "/admin/blog", "/admin/support", "/admin/audit", "/admin/settings",
];
const DASHBOARD_ROUTES = [
  "/dashboard", "/dashboard/appointments", "/dashboard/calendar", "/dashboard/clients", "/dashboard/services", "/dashboard/staff", "/dashboard/queue", "/dashboard/analytics",
  "/dashboard/expenses", "/dashboard/offers", "/dashboard/website", "/dashboard/booking-page", "/dashboard/payments", "/dashboard/settings", "/dashboard/support", "/dashboard/billing",
];
const slug = (p: string) => p.replace(/^\//, "").replace(/\//g, "_") || "root";
const SHOTS = process.env.SHELL_SHOTS === "1";

async function measure(page: Page) {
  return page.evaluate(() => {
    const vw = window.innerWidth, vh = window.innerHeight;
    const main = document.querySelector<HTMLElement>("[data-admin-main], main");
    const header = document.querySelector<HTMLElement>("[data-admin-header], header");
    const m = main?.getBoundingClientRect(), h = header?.getBoundingClientRect();
    return {
      vw, vh, hasMain: !!m, mainTop: m?.top ?? 0, mainBottom: m?.bottom ?? 0, mainLeft: m?.left ?? 0, mainRight: m?.right ?? 0, headerBottom: h?.bottom ?? 0,
      docScrollW: document.documentElement.scrollWidth, bodyScrollW: document.body.scrollWidth,
    };
  });
}

async function expectShellOk(page: Page, route: string, width: number) {
  const m = await measure(page);
  const where = `${route} @${width}`;
  expect(m.hasMain, `${where}: no <main>`).toBe(true);
  expect(m.mainTop, `${where}: main starts above the header's bottom edge`).toBeGreaterThanOrEqual(m.headerBottom - 1);
  expect(m.mainBottom, `${where}: main runs past the bottom of the viewport`).toBeLessThanOrEqual(m.vh + 1);
  expect(m.mainLeft, `${where}: main starts left of the viewport`).toBeGreaterThanOrEqual(-1);
  expect(m.mainRight, `${where}: main runs past the right edge`).toBeLessThanOrEqual(m.vw + 1);
  expect(m.docScrollW, `${where}: the page scrolls sideways`).toBeLessThanOrEqual(m.vw + 1);
  expect(m.bodyScrollW, `${where}: the body scrolls sideways`).toBeLessThanOrEqual(m.vw + 1);
}

async function visit(page: Page, route: string, width: number) {
  await page.setViewportSize({ width, height: width < 768 ? 812 : 900 });
  await page.goto(route, { waitUntil: "load" });
  await page.waitForTimeout(400);
  await expectShellOk(page, route, width);
  if (SHOTS) {
    mkdirSync("docs/audit/step-36c", { recursive: true });
    await page.screenshot({ path: `docs/audit/step-36c/${slug(route)}-${width}.png`, fullPage: false });
  }
}

test("admin: every route fits its shell at 375, 768, 1024 and 1440", async ({ page, context, baseURL }) => {
  test.setTimeout(900_000);
  await withAdminFixture(async (fixture: AdminFixture) => {
    await signInAsFixtureAdmin(context, baseURL ?? "http://localhost:3000", fixture);
    const routes = [...ADMIN_ROUTES];
    await page.goto("/admin/businesses");
    const first = await page.locator('a[href^="/admin/businesses/"]:not([href$="/new"])').first().getAttribute("href").catch(() => null);
    if (first) routes.push(first);
    for (const route of routes) for (const w of WIDTHS) await visit(page, route, w);
  });
});

test("admin: the menu is a drawer under 1024px (backdrop, Escape, focus kept inside and returned)", async ({ page, context, baseURL }) => {
  await withAdminFixture(async (fixture: AdminFixture) => {
    await signInAsFixtureAdmin(context, baseURL ?? "http://localhost:3000", fixture);
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/admin");
    const menu = page.getByRole("button", { name: "Open admin menu" });
    await expect(page.locator("#admin-sidebar")).toHaveAttribute("inert", "");
    await menu.click();
    await expect(page.getByTestId("admin-backdrop")).toBeVisible();
    await expect(page.locator("#admin-sidebar")).not.toHaveAttribute("inert", "");
    // Focus is inside the drawer, and Tab never leaves it.
    for (let i = 0; i < 30; i++) {
      await page.keyboard.press("Tab");
      expect(await page.evaluate(() => !!document.activeElement?.closest("#admin-sidebar")), `Tab ${i} left the drawer`).toBe(true);
    }
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("admin-backdrop")).toHaveCount(0);
    await expect(menu).toBeFocused();
    // Backdrop click closes it too, and the notifications panel replaces it rather than stacking.
    await menu.click();
    await page.getByTestId("admin-backdrop").click({ position: { x: 360, y: 400 } });
    await expect(page.getByTestId("admin-backdrop")).toHaveCount(0);
    await menu.click();
    await page.getByRole("button", { name: "Notifications" }).click({ force: true }).catch(() => undefined);
    await page.setViewportSize({ width: 1440, height: 900 });
    await expect(page.locator("#admin-sidebar")).not.toHaveAttribute("inert", ""); // widening shows the sidebar and drops the drawer
  });
});

test("dashboard: the main routes fit their shell at 375, 768, 1024 and 1440", async ({ page }) => {
  test.setTimeout(900_000);
  await page.goto("/login");
  await page.getByPlaceholder("you@business.com").fill("demo@calvy.io");
  await page.getByPlaceholder("••••••••").fill(process.env.E2E_OWNER_PASSWORD ?? "password123");
  await page.getByRole("button", { name: /sign in|log in/i }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 60_000 });
  for (const route of DASHBOARD_ROUTES) for (const w of WIDTHS) await visit(page, route, w);
});
