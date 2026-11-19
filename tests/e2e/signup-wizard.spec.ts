import { test, expect } from "@playwright/test";

// Step 37: sign-up has no email step. Name, business name, email, phone -> straight into onboarding (step 1 asks the business type) -> website live
// -> the dashboard shows "Verify your email" until a link is used. The sign-in page's "Email me a sign-in link" signs in and verifies.
// Needs the dev server started with AUTH_TEST_RETURN_TOKEN=1 (the magic-link response then carries the emailed token) and the step 37 migration applied.
test.use({ timezoneId: "Asia/Kolkata", locale: "en-IN" });

test("sign-up with no email gate, onboarding, then a sign-in link verifies the address", async ({ page }) => {
  const stamp = Date.now();
  const email = `wizard-${stamp}@example.com`;
  const slug = `glow-${stamp}`;

  await page.goto("/signup");
  await expect(page.getByLabel(/password/i)).toHaveCount(0); // no password field
  await expect(page.getByRole("radio", { name: /Salon/ })).toHaveCount(0); // no business-type picker here
  await page.getByLabel("Your name").fill("Asha Rao");
  await page.getByLabel("Business name").fill("Glow Salon");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Get started" }).click();
  await expect(page.getByLabel(/Phone number/)).toHaveJSProperty("validity.valueMissing", true); // India: the phone number is required
  await page.getByLabel(/Phone number/).fill("+91 98765 43210");
  await page.getByRole("button", { name: "Get started" }).click();

  // Straight into the wizard: no "check your email" step. Step 1 asks the business type.
  await expect(page).toHaveURL(/\/onboarding/, { timeout: 60_000 });
  await expect(page.getByText("Step 1 of 7")).toBeVisible();
  const next = () => page.getByRole("button", { name: /^(Continue|Finish)$/ }).click();
  await page.getByRole("radio", { name: /Salon/ }).check({ force: true });
  await next();
  await expect(page.getByLabel("Business name")).toHaveValue("Glow Salon"); // carried over from sign-up
  await page.getByLabel("Your page link").fill(slug);
  await expect(page.getByText("Available")).toBeVisible();
  await next();
  await page.getByRole("radio", { name: /Time slots/ }).click();
  await next();
  await next(); // services
  await next(); // hours
  await next(); // plan: Free
  await expect(page.getByText("Step 7 of 7")).toBeVisible();
  await page.getByRole("button", { name: "Go to dashboard" }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 60_000 });
  expect((await page.request.get(`/${slug}`)).status()).toBe(200);

  // Not verified yet: a dismissible banner, and the gated actions refuse with the inline message.
  await expect(page.getByTestId("verify-banner")).toBeVisible();
  const gated = await page.request.post("/api/settings/gateways", { data: {} });
  expect(gated.status()).toBe(403);
  expect(await gated.json()).toMatchObject({ code: "EMAIL_NOT_VERIFIED" });

  // A sign-in link (the sign-in page's "Email me a sign-in link") verifies the address.
  const ask = await page.request.post("/api/auth/magic-link", { data: { email } });
  const { devToken } = await ask.json();
  test.skip(!devToken, "start the server with AUTH_TEST_RETURN_TOKEN=1 to read the emailed token");
  await page.context().clearCookies();
  await page.goto(`/auth/magic?token=${devToken}`);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 60_000 });
  await expect(page.getByTestId("verify-banner")).toHaveCount(0);
  // The link was single-use.
  await page.context().clearCookies();
  await page.goto(`/auth/magic?token=${devToken}`);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText(/expired or was already used/)).toBeVisible();
});
