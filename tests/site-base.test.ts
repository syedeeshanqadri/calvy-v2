import { describe, it, expect } from "vitest";
import { siteBase } from "@/lib/siteBase";

// fix/booknow-links: a client site's links must work on its subdomain and on a plain host (vercel.app, localhost).

const ROOT = "calvy.io";

describe("siteBase", () => {
  it("on the business's own subdomain links are root-relative (the proxy adds the slug)", () => {
    expect(siteBase("glow.calvy.io", "glow", ROOT)).toBe("");
    expect(siteBase("glow.calvy.io:3000", "glow", ROOT)).toBe("");
    expect(siteBase("GLOW.Calvy.io", "glow", ROOT)).toBe("");
  });
  it("on the root domain, www, a preview or localhost links carry the slug", () => {
    for (const host of ["calvy.io", "www.calvy.io", "calvy-v2.vercel.app", "calvy-v2-abc-q3labs.vercel.app", "localhost:3000", null, undefined, ""]) {
      expect(siteBase(host, "glow", ROOT), String(host)).toBe("/glow");
    }
  });
  it("a root domain on vercel.app (the test server) serves sites by path", () => {
    expect(siteBase("calvy-v2.vercel.app", "alex-johnson-studio", "calvy-v2.vercel.app")).toBe("/alex-johnson-studio");
  });
  it("the book-now link built from it is never a bare /book-now on a plain host", () => {
    expect(`${siteBase("calvy-v2.vercel.app", "glow", ROOT)}/book-now`).toBe("/glow/book-now");
    expect(`${siteBase("glow.calvy.io", "glow", ROOT)}/book-now`).toBe("/book-now");
  });
});

import { publicSiteUrl, usesTenantSubdomains } from "@/lib/siteBase";

describe("publicSiteUrl: the address shown to the owner is one that exists", () => {
  it("a real domain gets the business's own subdomain", () => {
    expect(publicSiteUrl("glow", "calvy.io")).toBe("https://glow.calvy.io");
    expect(publicSiteUrl("glow", "https://calvy.io/")).toBe("https://glow.calvy.io");
    expect(usesTenantSubdomains("calvy.io")).toBe(true);
  });
  it("hosts that cannot do wildcard subdomains serve the site by path", () => {
    expect(publicSiteUrl("alex-johnson-studio", "calvy-v2.vercel.app")).toBe("https://calvy-v2.vercel.app/alex-johnson-studio");
    expect(publicSiteUrl("glow", "localhost:3000")).toBe("http://localhost:3000/glow");
    expect(publicSiteUrl("glow", "127.0.0.1:3000")).toBe("http://127.0.0.1:3000/glow");
    expect(usesTenantSubdomains("something.vercel.app")).toBe(false);
  });
  it("matches how links are built on the page (siteBase)", () => {
    expect(`${siteBase("calvy-v2.vercel.app", "glow", "calvy-v2.vercel.app")}/book-now`).toBe("/glow/book-now");
    expect(publicSiteUrl("glow", "calvy-v2.vercel.app").endsWith(siteBase("calvy-v2.vercel.app", "glow", "calvy-v2.vercel.app"))).toBe(true);
  });
});
