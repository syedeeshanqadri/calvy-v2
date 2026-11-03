import { test, expect } from "@playwright/test";

// New email sign-up -> verify -> onboarding wizard as a salon -> website is live.
// Needs the dev server started with AUTH_TEST_RETURN_TOKEN=1 (the sign-up response then carries the
// verification token, as the email would) and the onboarding migration applied.
test("email sign-up, wizard as a salon, website goes live", async ({ page }) => {
  const stamp = Date.now();
  const email = `wizard-${stamp}@example.com`;
  const password = "Wizard-pass-1";
  const slug = `glow-${stamp}`;

  const signup = await page.request.post("/api/signup", { data: { name: "Asha Rao", email, password, timezone: "Asia/Kolkata" } });
  expect(signup.status(), await signup.text()).toBe(201);
  const { devToken } = await signup.json();
  test.skip(!devToken, "start the server with AUTH_TEST_RETURN_TOKEN=1 to read the verification token");
  await page.request.get(`/api/auth/verify-email?token=${devToken}`, { maxRedirects: 0 }).catch(() => null);

  await page.goto("/login");
  await page.getByLabel(/email/i).first().fill(email);
  await page.locator('input[type="password"]').first().fill(password);
  await page.getByRole("button", { name: /sign in|log in/i }).first().click();
  // A business that has not finished the wizard is sent to it, not to the dashboard.
  await expect(page).toHaveURL(/\/onboarding/, { timeout: 60_000 });

  const next = () => page.getByRole("button", { name: /^(Continue|Finish)$/ }).click();
  await expect(page.getByText("Step 1 of 8")).toBeVisible();
  await page.getByRole("radio", { name: /India/ }).click();
  await next();

  await page.getByRole("radio", { name: /Salon/ }).click();
  await next();

  await page.getByLabel("Business name").fill("Glow Salon");
  await page.getByLabel("Your web address").fill(slug);
  await expect(page.getByText("Available")).toBeVisible();
  await next();

  await expect(page.getByText("Step 4 of 8")).toBeVisible();
  await page.getByRole("radio", { name: /Time slots/ }).click();
  await next();

  await expect(page.getByLabel("Name").first()).not.toHaveValue("");
  await next();

  await next(); // hours: weekday preset
  await next(); // plan: Free preselected

  await expect(page.getByText("Step 8 of 8")).toBeVisible();
  await expect(page.getByTestId("booking-link")).toContainText(slug);
  await page.getByRole("button", { name: "Go to dashboard" }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 60_000 });

  // The wizard is over: /onboarding bounces back to the dashboard, and the public site is live.
  await page.goto("/onboarding");
  await expect(page).toHaveURL(/\/dashboard/);
  const site = await page.request.get(`/${slug}`);
  expect(site.status()).toBe(200);
  expect(await site.text()).toContain("Glow Salon");
});
