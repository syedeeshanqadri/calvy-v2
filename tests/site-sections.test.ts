import { describe, it, expect } from "vitest";
import {
  SITE_CAPS, isSafeImageUrl, sanitizeGallery, sanitizeFaq, validateSections, offerVisible, faqJsonLd, moveItem,
  resolveHeroLayout, defaultHeroLook, parseServiceLayout,
} from "@/lib/siteSections";
import { jsonLdString } from "@/lib/jsonLd";
import { websiteConfigSchema } from "@/lib/validation/misc";
import { staffPatchSchema, servicePatchSchema } from "@/lib/validation/dashboard";
import { parsePhotoPurpose, SITE_PHOTO_SIZE } from "@/lib/photo";

const img = (n: number) => ({ url: `https://cdn.example.com/p${n}.webp`, alt: `Photo ${n}` });
const many = (n: number) => Array.from({ length: n }, (_, i) => img(i));

describe("image URLs", () => {
  it("accepts https and own uploads, rejects everything else", () => {
    expect(isSafeImageUrl("https://x.com/a.webp")).toBe(true);
    expect(isSafeImageUrl("/uploads/website/b1/a.webp")).toBe(true);
    for (const bad of ["javascript:alert(1)", "data:image/png;base64,AA", "http://x.com/a.png", "//evil.com/a.png", "/uploads/../etc/passwd", "/other/a.png", "", 5, null]) {
      expect(isSafeImageUrl(bad)).toBe(false);
    }
  });
});

describe("gallery caps (SITE-GALLERY)", () => {
  it("sanitizeGallery keeps at most 12, drops unsafe and duplicate images", () => {
    expect(sanitizeGallery(many(20))).toHaveLength(SITE_CAPS.galleryImages);
    expect(sanitizeGallery([img(1), img(1), { url: "javascript:x", alt: "" }])).toHaveLength(1);
    expect(sanitizeGallery("nope")).toEqual([]);
  });
  it("the config schema accepts 12 and rejects 13", () => {
    expect(websiteConfigSchema.safeParse({ gallery: { enabled: true, images: many(12) } }).success).toBe(true);
    expect(websiteConfigSchema.safeParse({ gallery: { enabled: true, images: many(13) } }).success).toBe(false);
  });
  it("the config schema rejects an unsafe gallery URL and over-long alt text", () => {
    expect(websiteConfigSchema.safeParse({ gallery: { images: [{ url: "javascript:alert(1)", alt: "x" }] } }).success).toBe(false);
    expect(websiteConfigSchema.safeParse({ gallery: { images: [{ url: "https://a.com/x.png", alt: "a".repeat(SITE_CAPS.altText + 1) }] } }).success).toBe(false);
  });
  it("validateSections needs alt text on an enabled gallery and enforces the cap", () => {
    expect(validateSections({ gallery: { enabled: true, images: [{ url: "https://a.com/x.png", alt: " " }] } })).toHaveLength(1);
    expect(validateSections({ gallery: { enabled: true, images: many(12) } })).toEqual([]);
    expect(validateSections({ gallery: { enabled: true, images: many(13) } }).length).toBeGreaterThan(0);
  });
  it("moveItem reorders and ignores out-of-range moves", () => {
    expect(moveItem([1, 2, 3], 0, 2)).toEqual([2, 3, 1]);
    expect(moveItem([1, 2, 3], 0, 5)).toEqual([1, 2, 3]);
  });
});

describe("offer banner", () => {
  const now = new Date("2026-11-10T12:00:00Z");
  it("hides when off or empty", () => {
    expect(offerVisible({ enabled: false, text: "x", endsOn: "" }, now)).toBe(false);
    expect(offerVisible({ enabled: true, text: "  ", endsOn: "" }, now)).toBe(false);
    expect(offerVisible(undefined, now)).toBe(false);
  });
  it("shows through the end date and hides the day after", () => {
    expect(offerVisible({ enabled: true, text: "x", endsOn: "" }, now)).toBe(true);
    expect(offerVisible({ enabled: true, text: "x", endsOn: "2026-11-10" }, now, "UTC")).toBe(true);
    expect(offerVisible({ enabled: true, text: "x", endsOn: "2026-11-09" }, now, "UTC")).toBe(false);
  });
  it("uses the business timezone for 'today'", () => {
    const lateUtc = new Date("2026-11-10T20:00:00Z");
    expect(offerVisible({ enabled: true, text: "x", endsOn: "2026-11-10" }, lateUtc, "Asia/Kolkata")).toBe(false);
    expect(offerVisible({ enabled: true, text: "x", endsOn: "2026-11-10" }, lateUtc, "UTC")).toBe(true);
  });
  it("rejects a malformed date and over-long text", () => {
    expect(websiteConfigSchema.safeParse({ offer: { endsOn: "tomorrow" } }).success).toBe(false);
    expect(websiteConfigSchema.safeParse({ offer: { text: "a".repeat(SITE_CAPS.offerText + 1) } }).success).toBe(false);
  });
});

describe("FAQ and JSON-LD", () => {
  it("caps at 12 and drops half-filled items", () => {
    expect(sanitizeFaq(Array.from({ length: 20 }, (_, i) => ({ q: `Q${i}`, a: "A" })))).toHaveLength(SITE_CAPS.faqItems);
    expect(sanitizeFaq([{ q: "Q", a: "" }, { q: "", a: "A" }])).toEqual([]);
    expect(websiteConfigSchema.safeParse({ faq: { items: Array.from({ length: 13 }, () => ({ q: "q", a: "a" })) } }).success).toBe(false);
  });
  it("builds FAQPage data, or null when empty", () => {
    expect(faqJsonLd([])).toBeNull();
    const ld = faqJsonLd([{ q: "Parking?", a: "Yes." }]) as { "@type": string; mainEntity: { name: string }[] };
    expect(ld["@type"]).toBe("FAQPage");
    expect(ld.mainEntity[0].name).toBe("Parking?");
  });
  it("escapes script-breaking text in the serialised block", () => {
    const out = jsonLdString(faqJsonLd([{ q: "</script><script>alert(1)</script>", a: "a & b <b>" }]));
    expect(out).not.toContain("</script>");
    expect(out).not.toMatch(/[<>&]/);
    expect(JSON.parse(out).mainEntity[0].name).toBe("</script><script>alert(1)</script>");
  });
});

describe("hero look and service layout", () => {
  it("defaults from the pack and lets the owner override", () => {
    expect(resolveHeroLayout(undefined, "SALON_SPA")).toBe("arch");
    expect(resolveHeroLayout(undefined, "LAWYER")).toBe("immersive");
    expect(resolveHeroLayout("dark", "CLINIC")).toBe("immersive");
    expect(resolveHeroLayout("arch", "CLINIC")).toBe("arch");
    expect(resolveHeroLayout("bogus", "FITNESS")).toBe("immersive");
    expect(defaultHeroLook("FITNESS")).toBe("dark");
    expect(defaultHeroLook("CLINIC")).toBe("split");
  });
  it("service layout falls back to the list", () => {
    expect(parseServiceLayout("cards")).toBe("cards");
    expect(parseServiceLayout("x")).toBe("list");
    expect(websiteConfigSchema.safeParse({ heroLook: "wide" }).success).toBe(false);
  });
});

describe("team and service fields", () => {
  it("caps bio and specialisation, validates photo URLs, allows clearing", () => {
    expect(staffPatchSchema.safeParse({ bio: "a".repeat(SITE_CAPS.staffBio) }).success).toBe(true);
    expect(staffPatchSchema.safeParse({ bio: "a".repeat(SITE_CAPS.staffBio + 1) }).success).toBe(false);
    expect(staffPatchSchema.safeParse({ specialisation: "a".repeat(SITE_CAPS.staffSpecialisation + 1) }).success).toBe(false);
    expect(staffPatchSchema.safeParse({ photoUrl: "javascript:alert(1)" }).success).toBe(false);
    expect(staffPatchSchema.safeParse({ photoUrl: "" }).success).toBe(true);
    expect(servicePatchSchema.safeParse({ imageUrl: "https://a.com/s.webp" }).success).toBe(true);
    expect(servicePatchSchema.safeParse({ imageUrl: "data:text/html,x" }).success).toBe(false);
  });
});

describe("upload purposes", () => {
  it("has sizes for the new purposes and still falls back to about", () => {
    for (const p of ["gallery", "team", "service"] as const) {
      expect(parsePhotoPurpose(p)).toBe(p);
      expect(SITE_PHOTO_SIZE[p].width).toBeGreaterThan(0);
    }
    expect(parsePhotoPurpose("constructor")).toBe("about");
  });
});

import { sectionOn } from "@/lib/siteSections";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { OfferBanner, GallerySection, FaqSection, TeamCards, ServiceCards } from "@/components/site/SiteSections";

describe("defaults: a section with content is on unless switched off", () => {
  it("sectionOn", () => {
    expect(sectionOn(undefined, true)).toBe(true);
    expect(sectionOn(true, true)).toBe(true);
    expect(sectionOn(false, true)).toBe(false);
    expect(sectionOn(true, false)).toBe(false);
    expect(sectionOn(undefined, false)).toBe(false);
  });
  it("offer shows by default when it has text, hides when switched off or past its end date", () => {
    const now = new Date("2026-11-10T12:00:00Z");
    expect(offerVisible({ text: "Sale", endsOn: "" }, now, "UTC")).toBe(true);
    expect(offerVisible({ enabled: false, text: "Sale", endsOn: "" }, now, "UTC")).toBe(false);
    expect(offerVisible({ text: "Sale", endsOn: "2026-11-01" }, now, "UTC")).toBe(false);
  });
  it("an enabled gallery without alt text is rejected, a default-on one too", () => {
    expect(validateSections({ gallery: { images: [{ url: "https://a.com/x.png", alt: "" }] } })).toHaveLength(1);
    expect(validateSections({ gallery: { enabled: false, images: [{ url: "https://a.com/x.png", alt: "" }] } })).toEqual([]);
  });
});

describe("shared render components (same ones the editor preview uses)", () => {
  const html = (el: React.ReactElement) => renderToStaticMarkup(el);
  it("offer, FAQ, gallery, team and service cards produce the expected markup", () => {
    expect(html(createElement(OfferBanner, { text: "20% off" }))).toContain("20% off");
    const faq = html(createElement(FaqSection, { title: "FAQ", items: [{ q: "Parking?", a: "Yes, free." }] }));
    expect(faq).toContain("<details");
    expect(faq).toContain("Parking?");
    const gal = html(createElement(GallerySection, { title: "Gallery", images: [{ url: "https://a.com/x.webp", alt: "Front desk" }] }));
    expect(gal).toContain('alt="Front desk"');
    const team = html(createElement(TeamCards, { staff: [{ id: "1", name: "Ana Diaz", role: "Stylist", photoUrl: "https://a.com/a.webp", bio: "Ten years of colour.", specialisation: "Balayage" }] }));
    expect(team).toContain('alt="Ana Diaz"');
    expect(team).toContain("Ten years of colour.");
    expect(team).toContain("Balayage");
    const svc = html(createElement(ServiceCards, { currency: "INR", bookingUrl: "/b", services: [{ id: "s", name: "Cut", description: "", duration: 30, price: 500, capacity: 1, imageUrl: "https://a.com/s.webp" }] }));
    expect(svc).toContain("st-svc-card-img");
  });
  it("empty sections render nothing", () => {
    expect(html(createElement(FaqSection, { title: "FAQ", items: [] }))).toBe("");
    expect(html(createElement(GallerySection, { title: "G", images: [] }))).toBe("");
  });
});
