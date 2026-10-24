import { describe, it, expect } from "vitest";
import sharp from "sharp";
import { checkLogoBytes, MAX_LOGO_BYTES } from "@/lib/validation/logo";
import { processLogo } from "@/lib/logo";
import { normalizeSocial, normalizeSocialLinks, parseSocialLinks, normalizeReviewLink, safeReviewLink } from "@/lib/brandLinks";
import { formatOpeningHours, mapsEmbedUrl } from "@/lib/hours";
import { assertSafeKey, localStorageAdapter } from "@/lib/storage";

const enc = (s: string) => new TextEncoder().encode(s);
const PNG_HEAD = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100"><rect width="200" height="100" fill="#e84545"/></svg>';

describe("step-3/website-extras: logo upload validation", () => {
  it("identifies raster images by content, not name", () => {
    expect(checkLogoBytes(new Uint8Array([...PNG_HEAD, 0, 0, 0, 0]))).toEqual({ ok: true, kind: "png" });
    expect(checkLogoBytes(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0]))).toEqual({ ok: true, kind: "jpg" });
  });
  it("accepts a plain SVG, with or without an xml prolog", () => {
    expect(checkLogoBytes(enc(SVG))).toEqual({ ok: true, kind: "svg" });
    expect(checkLogoBytes(enc(`<?xml version="1.0"?>\n${SVG}`))).toEqual({ ok: true, kind: "svg" });
  });
  it("rejects SVG with script, handlers, external refs or entities", () => {
    for (const bad of [
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
      '<svg xmlns="http://www.w3.org/2000/svg" onload="x()"></svg>',
      '<svg xmlns="http://www.w3.org/2000/svg"><image href="https://evil.test/a.png"/></svg>',
      '<svg xmlns="http://www.w3.org/2000/svg"><a xlink:href="javascript:alert(1)"/></svg>',
      '<svg xmlns="http://www.w3.org/2000/svg"><foreignObject/></svg>',
      '<!DOCTYPE svg [<!ENTITY x SYSTEM "file:///etc/passwd">]><svg xmlns="http://www.w3.org/2000/svg">&x;</svg>',
    ]) {
      expect(checkLogoBytes(enc(bad)).ok).toBe(false);
    }
  });
  it("rejects other content and oversize files", () => {
    expect(checkLogoBytes(enc("<html><body>hi</body></html>")).ok).toBe(false);
    expect(checkLogoBytes(enc("GIF89a....")).ok).toBe(false);
    expect(checkLogoBytes(new Uint8Array(0)).ok).toBe(false);
    const big = new Uint8Array(MAX_LOGO_BYTES + 1);
    big.set(PNG_HEAD);
    expect(checkLogoBytes(big)).toEqual({ ok: false, error: "Logo is too large (max 2 MB)" });
  });
});

describe("step-3/website-extras: logo processing", () => {
  it("rasterises an SVG to a PNG that fits 512px (never stored raw)", async () => {
    const r = await processLogo(enc(SVG));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const meta = await sharp(r.png).metadata();
    expect(meta.format).toBe("png");
    expect(Math.max(meta.width!, meta.height!)).toBeLessThanOrEqual(512);
  });
  it("downsizes a large raster and does not upscale a small one", async () => {
    const big = await sharp({ create: { width: 1600, height: 800, channels: 3, background: "#336699" } }).jpeg().toBuffer();
    const small = await sharp({ create: { width: 64, height: 64, channels: 3, background: "#336699" } }).png().toBuffer();
    const b = await processLogo(big);
    const s = await processLogo(small);
    expect(b.ok && s.ok).toBe(true);
    if (!b.ok || !s.ok) return;
    expect((await sharp(b.png).metadata()).width).toBe(512);
    expect((await sharp(s.png).metadata()).width).toBe(64);
  });
  it("refuses a corrupt image that only has a valid header", async () => {
    const r = await processLogo(new Uint8Array([...PNG_HEAD, 1, 2, 3, 4, 5, 6]));
    expect(r.ok).toBe(false);
  });
});

describe("step-3/website-extras: social links", () => {
  it("turns handles and urls into canonical https links", () => {
    expect(normalizeSocial("instagram", "@my.salon")).toEqual({ ok: true, value: "https://instagram.com/my.salon" });
    expect(normalizeSocial("instagram", "http://www.instagram.com/my.salon/?igsh=abc#x")).toEqual({ ok: true, value: "https://www.instagram.com/my.salon" });
    expect(normalizeSocial("x", "twitter.com/calvy")).toEqual({ ok: true, value: "https://twitter.com/calvy" });
    expect(normalizeSocial("youtube", "https://www.youtube.com/watch?v=abc123&t=9")).toEqual({ ok: true, value: "https://www.youtube.com/watch?v=abc123" });
    expect(normalizeSocial("website", "mybiz.com/about?utm=1")).toEqual({ ok: true, value: "https://mybiz.com/about" });
  });
  it("sends WhatsApp numbers to wa.me and strips formatting", () => {
    expect(normalizeSocial("whatsapp", "+91 98765-43210")).toEqual({ ok: true, value: "https://wa.me/919876543210" });
    expect(normalizeSocial("whatsapp", "https://wa.me/919876543210?text=hi")).toEqual({ ok: true, value: "https://wa.me/919876543210" });
    expect(normalizeSocial("whatsapp", "12345").ok).toBe(false);
    expect(normalizeSocial("whatsapp", "call me").ok).toBe(false);
  });
  it("rejects wrong hosts, other schemes and credentials", () => {
    expect(normalizeSocial("instagram", "https://facebook.com/x/y").ok).toBe(false);
    expect(normalizeSocial("instagram", "https://evilinstagram.com/x/y").ok).toBe(false);
    expect(normalizeSocial("website", "javascript:alert(1)").ok).toBe(false);
    expect(normalizeSocial("website", "data:text/html,hi").ok).toBe(false);
    expect(normalizeSocial("website", "https://user:pw@example.com").ok).toBe(false);
    expect(normalizeSocial("website", "localhost").ok).toBe(false);
  });
  it("normalises a map, dropping empties, and fails on the first bad value", () => {
    expect(normalizeSocialLinks({ instagram: "@a", facebook: "  " })).toEqual({ ok: true, value: { instagram: "https://instagram.com/a" } });
    expect(normalizeSocialLinks({ instagram: "@a", website: "javascript:x" }).ok).toBe(false);
  });
  it("re-validates stored values at render time", () => {
    expect(parseSocialLinks({ instagram: "https://instagram.com/a", website: "javascript:alert(1)", bogus: "x" })).toEqual({ instagram: "https://instagram.com/a" });
    expect(parseSocialLinks(null)).toEqual({});
  });
});

describe("step-3/website-extras: Google review link", () => {
  it("accepts Google review and place links", () => {
    for (const ok of [
      "https://g.page/r/CabC123/review",
      "g.page/r/CabC123/review",
      "https://search.google.com/local/writereview?placeid=ChIJabc",
      "https://maps.app.goo.gl/AbCdEf",
      "https://www.google.com/maps/place/Foo/@1,2,3z",
    ]) {
      expect(normalizeReviewLink(ok).ok).toBe(true);
    }
  });
  it("keeps the place id of search.google.com links but drops tracking from short links", () => {
    const a = normalizeReviewLink("https://search.google.com/local/writereview?placeid=ChIJabc#frag");
    expect(a).toEqual({ ok: true, value: "https://search.google.com/local/writereview?placeid=ChIJabc" });
    const b = normalizeReviewLink("https://g.page/r/CabC123/review?utm_source=x");
    expect(b).toEqual({ ok: true, value: "https://g.page/r/CabC123/review" });
  });
  it("rejects non-Google and non-review links", () => {
    for (const bad of ["https://example.com/review", "https://google.com.evil.test/maps", "https://www.google.com/", "javascript:alert(1)", "not a link", ""]) {
      expect(normalizeReviewLink(bad).ok).toBe(false);
    }
    expect(safeReviewLink("https://example.com")).toBeNull();
    expect(safeReviewLink(null)).toBeNull();
  });
});

describe("step-3/website-extras: opening hours and map", () => {
  it("lists Monday first, joins split days and marks missing days Closed", () => {
    const lines = formatOpeningHours([
      { weekday: 1, startMin: 9 * 60, endMin: 17 * 60 },
      { weekday: 2, startMin: 14 * 60, endMin: 18 * 60 },
      { weekday: 2, startMin: 9 * 60, endMin: 12 * 60 + 30 },
    ]);
    expect(lines.map((l) => l.day)).toEqual(["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]);
    expect(lines[0].label).toBe("9:00 AM – 5:00 PM");
    expect(lines[1].label).toBe("9:00 AM – 12:30 PM, 2:00 PM – 6:00 PM");
    expect(lines[2]).toMatchObject({ label: "Closed", closed: true });
  });
  it("handles noon and midnight", () => {
    expect(formatOpeningHours([{ weekday: 0, startMin: 0, endMin: 12 * 60 }])[6].label).toBe("12:00 AM – 12:00 PM");
  });
  it("encodes the address in the map embed url", () => {
    const u = new URL(mapsEmbedUrl("12 MG Road, Pune & Co"));
    expect(u.origin).toBe("https://www.google.com");
    expect(u.searchParams.get("q")).toBe("12 MG Road, Pune & Co");
    expect(u.searchParams.get("output")).toBe("embed");
  });
});

describe("step-3/website-extras: storage adapter", () => {
  it("rejects unsafe keys", () => {
    for (const bad of ["../x.png", "a/../b.png", "/abs.png", "a//b.png", "a b.png", ""]) {
      expect(() => assertSafeKey(bad)).toThrow();
    }
    expect(() => assertSafeKey("logos/biz1/123-abc.png")).not.toThrow();
  });
  it("maps local urls back to keys", () => {
    expect(localStorageAdapter.keyFromUrl("/uploads/logos/b/1.png")).toBe("logos/b/1.png");
    expect(localStorageAdapter.keyFromUrl("https://other.test/uploads/x.png")).toBeNull();
  });
});
