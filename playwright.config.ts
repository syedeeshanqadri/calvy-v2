import { defineConfig } from "@playwright/test";

// Minimal smoke config. Vitest only picks up tests/**/*.test.ts, so these specs are not run by `npm test`.
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 120_000,
  workers: 1,
  fullyParallel: false,
  reporter: [["list"]],
  outputDir: "test-results",
  use: {
    baseURL: process.env.BASE_URL ?? "http://localhost:3000",
    browserName: "chromium",
  },
  projects: [
    { name: "mobile-375", use: { viewport: { width: 375, height: 812 } } },
    { name: "desktop-1440", use: { viewport: { width: 1440, height: 900 } } },
  ],
});
