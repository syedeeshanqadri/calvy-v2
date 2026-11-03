import { test, expect } from "@playwright/test";

// New sign-up (name, email, phone, business type; no password) -> wizard as a salon -> website live ->
// the emailed link sets the password and verifies the address -> sign in.
// Needs the dev server started with AUTH_TEST_RETURN_TOKEN=1 (the sign-up response then carries the
// emailed token) and the onboarding migration applied.
test.use({ timezoneId: "Asia/Kolkata", locale: "en-IN" });

test("passwordless sign-up, wizard as a salon, website goes live, then set password from the email link", async ({ page }) => {
  const stamp = Date.now();
  const email = `wizard-${stamp}@example.com`;
  const password = "Wizard-pass-1";
  const slug = `glow-${stamp}`;

  await page.goto("/signup");
  await page.getByLabel("Your name").fill("Asha Rao");
  await page.getByLabel("Email").fill(email);
  // India: the phone number is required.
  await page.getByRole("button", { name: "Get started" }).click();
  await expect(page.getByLabel(/Phone number/)).toHaveJSProperty("validity.valueMissing", true);
  await page.getByLabel(/Phone number/).fill("+91 98765 43210");
  await page.getByRole("radio", { name: /Salon/ }).check({ force: true });
  const signupResponse = page.waitForResponse((r) => r.url().includes("/api/signup") && r.request().method() === "POST");
  await page.getByRole("button", { name: "Get started" }).click();
  const { devToken } = await (await signupResponse).json();

  // Straight into the wizard, no verification first; region and type are already set, so it opens at step 3.
  await expect(page).toHaveURL(/\/onboarding/, { timeout: 60_000 });
  await expect(page.getByText("Step 3 of 8")).toBeVisible();

  const next = () => page.getByRole("button", { name: /^(Continue|Finish)$/ }).click();
  await expect(page.getByLabel(/Phone/)).toHaveValue("+91 98765 43210");
  await page.getByLabel("Business name").fill("Glow Salon");
  await page.getByLabel("Your web address").fill(slug);
  await expect(page.getByText("Available")).toBeVisible();
  await next();
  await page.getByRole("radio", { name: /Time slots/ }).click();
  await next();
  await expect(page.getByLabel("Name").first()).not.toHaveValue("");
  await next();
  await next(); // hours
  await next(); // plan: Free preselected
  await expect(page.getByText("Step 8 of 8")).toBeVisible();
  await expect(page.getByTestId("booking-link")).toContainText(slug);
  await page.getByRole("button", { name: "Go to dashboard" }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 60_000 });
  const site = await page.request.get(`/${slug}`);
  expect(site.status()).toBe(200);
  expect(await site.text()).toContain("Glow Salon");

  // The emailed link verifies the address and sets the password; the passwordless session then ends.
  test.skip(!devToken, "start the server with AUTH_TEST_RETURN_TOKEN=1 to read the emailed token");
  const set = await page.request.post("/api/auth/reset-password", { data: { token: devToken, password } });
  expect(set.status(), await set.text()).toBe(200);
  await page.goto("/login");
  await page.getByLabel(/email/i).first().fill(email);
  await page.locator('input[type="password"]').first().fill(password);
  await page.getByRole("button", { name: /sign in|log in/i }).first().click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 60_000 });
});
