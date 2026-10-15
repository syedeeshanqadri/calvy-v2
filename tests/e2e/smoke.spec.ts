import { test, expect, Page } from "@playwright/test";
import fs from "fs";
import path from "path";

const EMAIL = "demo@calvy.io";
const PASSWORD = process.env.TEST_PASSWORD ?? "password123";
const SLUG = "alex-johnson-studio";
const SHOTS = path.join("test-results", "smoke-shots");
const CONSOLE_LOG = path.join("test-results", "smoke-console.jsonl");

fs.mkdirSync(SHOTS, { recursive: true });

function track(page: Page, label: string) {
  page.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warning") {
      fs.appendFileSync(
        CONSOLE_LOG,
        JSON.stringify({ label, vp: page.viewportSize()?.width, type: m.type(), url: page.url(), text: m.text().slice(0, 400) }) + "\n"
      );
    }
  });
  page.on("pageerror", (e) =>
    fs.appendFileSync(
      CONSOLE_LOG,
      JSON.stringify({ label, vp: page.viewportSize()?.width, type: "pageerror", url: page.url(), text: String(e).slice(0, 400) }) + "\n"
    )
  );
}

async function shot(page: Page, name: string) {
  const vp = page.viewportSize()!.width;
  await page.screenshot({ path: path.join(SHOTS, `${name}-${vp}.png`), fullPage: false });
}

async function hOverflow(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

async function login(page: Page) {
  await page.goto("/login");
  await page.getByPlaceholder("you@business.com").fill(EMAIL);
  await page.getByPlaceholder("••••••••").fill(PASSWORD);
  await page.getByRole("button", { name: /sign in|log in/i }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 60_000 });
}

async function signOut(page: Page) {
  if (page.viewportSize()!.width < 1024) {
    await page.getByRole("button", { name: /more/i }).last().click();
    await page.getByRole("button", { name: "Sign out" }).click();
  } else {
    await page.getByTitle("Sign out").click();
  }
}

test("1. login, redirects, sign out", async ({ page }) => {
  track(page, "auth");
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login/);
  await shot(page, "login");
  expect(await hOverflow(page)).toBeLessThanOrEqual(0);

  await page.getByPlaceholder("you@business.com").fill(EMAIL);
  await page.getByPlaceholder("••••••••").fill("definitely-wrong");
  await page.getByRole("button", { name: /sign in|log in/i }).click();
  await expect(page.getByText("Invalid email or password.")).toBeVisible({ timeout: 30_000 });

  await page.getByPlaceholder("••••••••").fill(PASSWORD);
  await page.getByRole("button", { name: /sign in|log in/i }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 60_000 });
  await expect(page.getByText(/good (morning|afternoon|evening)/i).first()).toBeVisible();
  await shot(page, "dashboard");

  await page.goto("/login");
  await expect(page).toHaveURL(/\/dashboard/);

  await signOut(page);
  await page.waitForURL(/\/login/, { timeout: 30_000 });
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login/);
  const sess = await page.request.get("/api/auth/session");
  expect(await sess.json()).toEqual({});
});

test("2+3. dashboard and services", async ({ page }) => {
  track(page, "dash");
  await login(page);
  await expect(page.getByText(/good (morning|afternoon|evening)/i).first()).toBeVisible();
  const body = await page.locator("body").innerText();
  fs.writeFileSync(path.join(SHOTS, `dashboard-text-${page.viewportSize()!.width}.txt`), body);
  expect(await hOverflow(page)).toBeLessThanOrEqual(0);
  await shot(page, "dashboard-full");

  await page.goto("/dashboard/services");
  for (const s of ["Haircut & Style", "Consultation", "Color Treatment", "Full Session", "Follow-up", "Premium Package"]) {
    await expect(page.getByText(s, { exact: true }).first(), s).toBeVisible();
  }
  expect(await hOverflow(page)).toBeLessThanOrEqual(0);
  await shot(page, "services");
});

test("4+8. page spot checks and apple icon", async ({ page }) => {
  track(page, "spot");
  await login(page);
  const results: string[] = [];
  for (const u of [
    "/dashboard/appointments",
    "/dashboard/clients",
    "/dashboard/calendar",
    "/dashboard/staff",
    "/dashboard/settings",
    "/blog",
    "/help",
    `/${SLUG}`,
    `/${SLUG}/book-now`,
  ]) {
    const res = await page.goto(u);
    const over = await hOverflow(page);
    results.push(`${u} status=${res?.status()} hscrollPx=${over}`);
    await shot(page, "page" + u.replace(/\//g, "_"));
  }
  fs.writeFileSync(path.join(SHOTS, `spot-${page.viewportSize()!.width}.txt`), results.join("\n"));
  console.log(results.join("\n"));
  for (const r of results) expect(r).toMatch(/status=(2|3)\d\d/);

  const icon = await page.request.get("/apple-icon.png");
  console.log(`apple-icon.png status=${icon.status()} ct=${icon.headers()["content-type"]}`);
  expect(icon.status()).toBe(200);
  expect(icon.headers()["content-type"]).toContain("image/png");
});

test("6. auth endpoints", async ({ request }) => {
  const s = await request.get("/api/auth/session");
  console.log("session", s.status(), s.headers()["content-type"], await s.text());
  expect(s.status()).toBe(200);
  const p = await request.get("/api/auth/providers");
  const pj = await p.json();
  console.log("providers", p.status(), JSON.stringify(pj));
  expect(p.status()).toBe(200);
  expect(pj.credentials).toBeTruthy();
});

test("5. public booking then cancel", async ({ page }) => {
  test.setTimeout(180_000);
  track(page, "booking");
  await page.goto(`/b/${SLUG}`);
  await expect(page.getByText("Choose services")).toBeVisible();
  await shot(page, "book-1-service");
  await page.getByText("Consultation", { exact: true }).first().click();
  await page.getByRole("button", { name: /continue/i }).click();
  await page.getByText("No preference").click();
  await page.getByRole("button", { name: /continue/i }).click();
  await expect(page.getByText("Pick a date & time")).toBeVisible();

  const monthLabel = page.locator("span.font-syne").first();
  const nextBtn = monthLabel.locator("xpath=following-sibling::button");
  let picked = "";
  for (let off = 7; off < 40 && !picked; off++) {
    const d = new Date();
    d.setDate(d.getDate() + off);
    const want = d.toLocaleString("en-US", { month: "long" }) + " " + d.getFullYear();
    for (let i = 0; i < 3 && !(await monthLabel.innerText()).includes(want); i++) await nextBtn.click();
    const dayBtn = page.locator(".grid-cols-7 button:not([disabled])").getByText(new RegExp(`^${d.getDate()}$`));
    if (!(await dayBtn.count())) continue;
    await dayBtn.first().click();
    await page.waitForFunction(() => !document.querySelector(".animate-spin"));
    const slots = page.locator(".grid-cols-4 button:not([disabled])");
    if (await slots.count()) {
      picked = `${d.toDateString()} slot=${await slots.first().innerText()}`;
      await slots.first().click();
    }
  }
  console.log("picked:", picked);
  expect(picked, "a date with slots").not.toBe("");
  await shot(page, "book-2-datetime");
  await page.getByRole("button", { name: /continue/i }).click();
  await page.getByPlaceholder("Jane Smith").fill("QA Smoke");
  await page.getByPlaceholder("jane@email.com").fill("qa-smoke@example.com");
  await page.getByRole("button", { name: /continue/i }).click();
  await expect(page.getByText("Confirm booking").first()).toBeVisible();
  await shot(page, "book-3-confirm");
  await page.getByRole("button", { name: "Confirm booking" }).click();
  await expect(page.getByText(/You're booked/)).toBeVisible({ timeout: 60_000 });
  await shot(page, "book-4-success");

  await page.context().clearCookies();
  await login(page);
  await page.goto("/dashboard/appointments");
  await page.getByPlaceholder("Search appointments...").fill("QA Smoke");
  const row = page.locator("tr", { hasText: "qa-smoke@example.com" }).first();
  await expect(row).toBeVisible();
  console.log("appointment row:", (await row.innerText()).replace(/\s+/g, " "));
  await row.getByRole("button", { name: "Edit" }).click();
  await page.locator("select").filter({ has: page.locator("option[value=cancelled]") }).selectOption("cancelled");
  await page.getByRole("button", { name: /save changes/i }).click();
  await expect(page.getByText("Saved")).toBeVisible({ timeout: 30_000 });
  await page.keyboard.press("Escape");
  await page.reload();
  await page.getByPlaceholder("Search appointments...").fill("QA Smoke");
  const row2 = page.locator("tr", { hasText: "qa-smoke@example.com" }).first();
  await expect(row2).toContainText(/cancelled/i);
  console.log("final row:", (await row2.innerText()).replace(/\s+/g, " "));
  await shot(page, "book-5-cancelled");
});
