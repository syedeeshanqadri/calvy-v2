import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Tests of plan limits run with enforcement ON (today's behaviour); tests of the OFF mode set it themselves.
    env: { PLAN_ENFORCEMENT: "1" },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
