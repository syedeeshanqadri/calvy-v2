import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";

describe("step-20 framing: our own pages may embed each other (onboarding preview), nobody else", () => {
  const cfg = readFileSync("next.config.mjs", "utf8");
  it("uses SAMEORIGIN and frame-ancestors 'self', never a wildcard", () => {
    expect(cfg).toContain('{ key: "X-Frame-Options", value: "SAMEORIGIN" }');
    expect(cfg).toContain("\"frame-ancestors 'self'\"");
    expect(cfg).not.toMatch(/frame-ancestors[^"]*\*/);
  });
});
