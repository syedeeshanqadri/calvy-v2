import { describe, it, expect } from "vitest";
import { jsonLdString } from "@/lib/jsonLd";

describe("jsonLdString (step-6 final check)", () => {
  it("escapes script-breaking characters but stays valid JSON", () => {
    const separators = String.fromCharCode(0x2028, 0x2029);
    const name = "</script><img src=x onerror=alert(1)> & " + separators;
    const out = jsonLdString({ "@type": "LocalBusiness", name });
    expect(out).not.toMatch(/[<>&]/);
    expect(out).not.toContain(separators[0]);
    expect(out).not.toContain(separators[1]);
    expect(JSON.parse(out).name).toBe(name);
  });
});
