import { test, expect, type Page } from "@playwright/test";

// Owner invites a receptionist WITHOUT "Customers: export". The receptionist cannot export:
// the button is hidden AND the API answers 403. Needs `npm run db:seed` and AUTH_TEST_RETURN_TOKEN=1
// on the dev server (the invite response then carries the token, as the email would).
const OWNER = { email: "demo@calvy.io", password: process.env.E2E_OWNER_PASSWORD ?? "password123" };

async function signIn(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel(/email/i).first().fill(email);
  await page.locator('input[type="password"]').first().fill(password);
  await page.getByRole("button", { name: /sign in|log in/i }).first().click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 60_000 });
}

test("a receptionist without 'Customers export' cannot export (button hidden, API 403)", async ({ browser, page }) => {
  const email = `receptionist-${Date.now()}@example.com`;
  const password = "Receptionist-pass-1";

  await signIn(page, OWNER.email, OWNER.password);
  const invite = await page.request.post("/api/team", {
    data: { name: "E2E Receptionist", email, roleName: "Receptionist", permissions: ["appointments.view_all", "appointments.write", "customers.view", "customers.edit"], staffId: null },
  });
  expect(invite.status(), await invite.text()).toBe(201);
  const { member, devToken } = await invite.json();
  test.skip(!devToken, "start the server with AUTH_TEST_RETURN_TOKEN=1 to read the invite token");

  try {
    // Owner can export (control); the member's invite works once.
    expect((await page.request.get("/api/clients/export")).status()).toBe(200);
    const memberCtx = await browser.newContext({ baseURL: test.info().project.use.baseURL });
    const mp = await memberCtx.newPage();
    const accept = await mp.request.post("/api/team/accept", { data: { token: devToken, password } });
    expect(accept.ok(), await accept.text()).toBe(true);
    expect((await mp.request.post("/api/team/accept", { data: { token: devToken, password } })).status()).toBe(400);

    await signIn(mp, email, password);
    await mp.goto("/dashboard/clients");
    await expect(mp.getByRole("heading", { level: 1 }).first()).toBeVisible();
    await expect(mp.getByTestId("clients-export")).toHaveCount(0);
    expect((await mp.request.get("/api/clients/export")).status()).toBe(403);

    // Owner-only areas are closed to the member, in the UI and the API.
    await mp.goto("/dashboard/settings/team");
    await expect(mp).toHaveURL(/\/dashboard$/);
    expect((await mp.request.get("/api/team")).status()).toBe(403);

    // Ticking the box takes effect on the next request, no new login.
    const tick = await page.request.patch(`/api/team/${member.id}`, { data: { permissions: ["customers.view", "customers.export"] } });
    expect(tick.ok()).toBe(true);
    expect((await mp.request.get("/api/clients/export")).status()).toBe(200);

    // Removing the member ends their access at once.
    expect((await page.request.delete(`/api/team/${member.id}`)).ok()).toBe(true);
    expect([401, 403]).toContain((await mp.request.get("/api/clients/export")).status());
    await memberCtx.close();
  } finally {
    await page.request.delete(`/api/team/${member.id}`);
  }
});
