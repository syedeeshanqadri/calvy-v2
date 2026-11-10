import { test, expect } from "@playwright/test";

// The admin area does not exist for anyone who is not a signed-in super admin.
test("a guest gets 404 on the admin pages and APIs, never a login redirect", async ({ page, request }) => {
  for (const path of ["/admin", "/admin/businesses", "/admin/audit", "/admin/settings", "/admin/2fa"]) {
    const res = await page.goto(path);
    expect(res?.status(), path).toBe(404);
  }
  for (const [method, path] of [["GET", "/api/admin/payments-health"], ["POST", "/api/admin/view-as"], ["POST", "/api/admin/2fa/verify"], ["PUT", "/api/admin/settings/limits"]] as const) {
    const res = await request.fetch(path, { method, data: {} });
    expect(res.status(), path).toBe(404);
  }
});
