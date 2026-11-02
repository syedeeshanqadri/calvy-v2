import { test, expect, Page } from "@playwright/test";

// CI smoke suite (npm run test:e2e:smoke): the journeys that must never break. Needs `npm run db:seed` and
// `npm run db:e2e-fixtures` first. Every booking uses the calvy.test domain.
const OWNER = { email: "demo@calvy.io", password: process.env.E2E_OWNER_PASSWORD ?? "password123" };
const CUSTOMER = { email: "e2e-customer@calvy.test", password: process.env.TEST_PASSWORD ?? "CalvyDev#2026" };
const SALON = "alex-johnson-studio";
const CLINIC = "city-care-clinic";
// Unique per booking: the app refuses a second booking by the same person on the same day.
let bookerCount = 0;
function newBooker() {
  const id = `${Date.now().toString(36)}${bookerCount++}`;
  return { name: `E2E Booker ${id}`, email: `e2e-${id}@calvy.test`, phone: "9876543210" };
}

const continueBtn = (page: Page) => page.getByRole("button", { name: /^continue/i });

async function pickService(page: Page, name: string) {
  await page.getByRole("checkbox", { name: new RegExp(`^${name}\\b`) }).first().click();
  await continueBtn(page).click();
  const noPref = page.getByText("No preference");
  if (await noPref.count()) {
    await noPref.first().click();
    await continueBtn(page).click();
  }
}

/** Slot flow: jumps to the first month with availability, then takes the first free slot on the first open day. */
async function pickSlot(page: Page) {
  await expect(page.getByText("Pick a date & time")).toBeVisible();
  const days = page.locator(".bk-cal-grid button:not([disabled])");
  const goTo = page.getByRole("button", { name: "Go to date" });
  const slots = page.locator(".bk-slots button:not([disabled])");
  // Days look open until the month's availability has loaded, so a day can turn out empty: try again, and
  // follow "Go to date" when the month has nothing.
  for (let attempt = 0; attempt < 12; attempt++) {
    await expect(days.first().or(goTo).first()).toBeVisible({ timeout: 30_000 });
    if (await goTo.isVisible()) {
      await goTo.click();
      continue;
    }
    const count = await days.count();
    if (count === 0) continue;
    await days.nth(attempt % count).click();
    if (await slots.first().waitFor({ timeout: 10_000 }).then(() => true, () => false)) {
      await slots.first().click();
      return;
    }
  }
  throw new Error("no open day with a free slot: " + (await page.locator("main").innerText()).replace(/\s+/g, " ").slice(0, 600));
}

async function fillDetails(page: Page, opts: { forName?: string } = {}) {
  if (opts.forName) {
    await page.getByRole("radio", { name: "Someone else" }).click();
    await page.locator("#booking-patient-name").fill(opts.forName);
  }
  const booker = newBooker();
  await page.locator("#booking-name").fill(booker.name);
  const phone = page.locator("#booking-phone");
  if (await phone.count()) await phone.fill(booker.phone);
  await page.locator("#booking-email-address").fill(booker.email);
  await continueBtn(page).click();
}

async function confirm(page: Page) {
  await page.getByRole("button", { name: "Confirm booking" }).click();
  await expect(page.getByText(/You.re booked/)).toBeVisible({ timeout: 60_000 });
}

test("owner logs in and the dashboard loads", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login/);
  await page.getByPlaceholder("you@business.com").fill(OWNER.email);
  await page.getByPlaceholder("••••••••").fill(OWNER.password);
  await page.getByRole("button", { name: /sign in|log in/i }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 60_000 });
  await expect(page.getByText(/good (morning|afternoon|evening)/i).first()).toBeVisible();
  for (const path of ["/dashboard/appointments", "/dashboard/services"]) {
    const res = await page.goto(path);
    expect(res?.status(), path).toBe(200);
  }
});

test("business website page renders", async ({ page }) => {
  for (const slug of [SALON, CLINIC]) {
    const res = await page.goto(`/${slug}`);
    expect(res?.status(), slug).toBe(200);
    await expect(page.locator("h1").first()).toBeVisible();
  }
});

test("slot booking (salon)", async ({ page }) => {
  await page.goto(`/${SALON}/book-now`);
  await expect(page.getByText("Choose services")).toBeVisible();
  await pickService(page, "Consultation");
  await pickSlot(page);
  await continueBtn(page).click();
  await fillDetails(page);
  await confirm(page);
});

test("queue booking (clinic gets a token)", async ({ page }) => {
  await page.goto(`/${CLINIC}/book-now`);
  await page.getByRole("checkbox", { name: /General Consultation/ }).check();
  await continueBtn(page).click();
  await expect(page.getByText("Pick a date & session")).toBeVisible();
  const sessions = page.getByRole("radiogroup", { name: "Sessions" }).getByRole("radio");
  let picked = false;
  for (let off = 1; off < 15 && !picked; off++) {
    const d = new Date();
    d.setDate(d.getDate() + off);
    await page.locator("#token-date").fill(d.toLocaleDateString("en-CA"));
    await page.waitForFunction(() => !document.body.innerText.includes("Loading sessions"));
    const free = sessions.and(page.locator(":not([disabled])"));
    if (await free.count()) {
      await free.first().click();
      picked = true;
    }
  }
  expect(picked, "a day with a free session").toBe(true);
  await continueBtn(page).click();
  await fillDetails(page);
  await confirm(page);
  await expect(page.getByText("Your number in the queue")).toBeVisible();
  await expect(page.locator(".bk-token")).toHaveText(/#\d+/);
});

test("booking for someone else", async ({ page }) => {
  await page.goto(`/${SALON}/book-now`);
  await expect(page.getByText("Choose services")).toBeVisible();
  await pickService(page, "Follow-up");
  await pickSlot(page);
  await continueBtn(page).click();
  await fillDetails(page, { forName: "E2E Patient" });
  await expect(page.locator("p").filter({ hasText: "Booking for:" })).toContainText("E2E Patient");
  await confirm(page);
  await expect(page.getByText("for E2E Patient")).toBeVisible();
});

test("online consultation booking shows the join link", async ({ page }) => {
  await page.goto(`/${SALON}/book-now`);
  await expect(page.getByText("Choose services")).toBeVisible();
  await pickService(page, "Online Consultation");
  await pickSlot(page);
  await continueBtn(page).click();
  await fillDetails(page);
  await expect(page.getByText(/Online consultation/).first()).toBeVisible();
  await confirm(page);
  await expect(page.getByRole("link", { name: "Join link" })).toHaveAttribute("href", /^https:\/\//);
});

test("customer signup form and login to /my", async ({ page }) => {
  // The signup API would send a real verification email, so it is stubbed; the verified account comes from the fixtures.
  let body: { email?: string } = {};
  await page.route("**/api/customer/signup", (route) => {
    body = route.request().postDataJSON();
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
  });
  await page.goto("/my/signup");
  await page.getByLabel("Your name").fill("E2E New Customer");
  await page.getByLabel("Email").fill("e2e-new@calvy.test");
  await page.getByLabel("Password", { exact: true }).fill("longenough1");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
  expect(body.email).toBe("e2e-new@calvy.test");

  await page.goto("/my/login");
  await page.getByLabel("Email").fill(CUSTOMER.email);
  await page.getByLabel("Password", { exact: true }).fill(CUSTOMER.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/my\/?$/, { timeout: 60_000 });
  expect((await page.goto("/my"))?.status()).toBe(200);
});
