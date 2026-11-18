// Step 30b: tenant-site images (storage drivers, broken-image fallbacks) and the "Bookings by Calvy" footer.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { NextRequest } from "next/server";

const blob = vi.hoisted(() => ({ put: vi.fn(), del: vi.fn(), list: vi.fn() }));
vi.mock("@vercel/blob", () => blob);

import { storageDriver, getStorage, localStorageAdapter } from "@/lib/storage";
import { usableImageUrl, isLocalUploadUrl, stripFlaggedImages } from "@/lib/images";
import { calvyBadgeUrl } from "@/lib/calvyBadgeUrl";
import { badgeVisible, hiddenInWebsiteJson, parseRefCookie } from "@/lib/calvyBadge";
import { CalvyBadge } from "@/components/site/CalvyBadge";
import { evaluateLimit } from "@/lib/limits";
import { PLAN_LIMITS } from "@/lib/plans";
import { missingStorageEnv } from "@/lib/env";

describe("storage driver choice", () => {
  const env = (o: Record<string, string>) => o as unknown as NodeJS.ProcessEnv;
  it("Vercel Blob is the production default when its token is set", () => {
    expect(storageDriver({ NODE_ENV: "production", BLOB_READ_WRITE_TOKEN: "t" })).toBe("blob");
  });
  it("S3/R2 is optional: used when all its variables are set and there is no Blob token", () => {
    const s3 = { S3_ENDPOINT: "e", S3_BUCKET: "b", S3_ACCESS_KEY_ID: "k", S3_SECRET_ACCESS_KEY: "s", S3_PUBLIC_URL: "u" };
    expect(storageDriver({ NODE_ENV: "production", ...s3 })).toBe("s3");
    expect(storageDriver({ NODE_ENV: "production", ...s3, BLOB_READ_WRITE_TOKEN: "t" })).toBe("blob");
    expect(storageDriver({ NODE_ENV: "production", ...s3, STORAGE_DRIVER: "s3", BLOB_READ_WRITE_TOKEN: "t" })).toBe("s3");
  });
  it("production with nothing configured has NO driver (never local disk); development uses local", () => {
    expect(storageDriver({ NODE_ENV: "production" })).toBe("none");
    expect(storageDriver({ NODE_ENV: "development" })).toBe("local");
    expect(missingStorageEnv(env({ NODE_ENV: "production" }))).toEqual(["BLOB_READ_WRITE_TOKEN"]);
    expect(missingStorageEnv(env({ NODE_ENV: "production", BLOB_READ_WRITE_TOKEN: "t" }))).toEqual([]);
  });
  it("getStorage throws with no driver in production and returns the local adapter in development", () => {
    const old = { ...process.env };
    try {
      delete process.env.BLOB_READ_WRITE_TOKEN; delete process.env.STORAGE_DRIVER;
      (process.env as Record<string, string>).NODE_ENV = "production";
      expect(() => getStorage()).toThrow(/not configured/);
      (process.env as Record<string, string>).NODE_ENV = "development";
      expect(getStorage()).toBe(localStorageAdapter);
    } finally { process.env = old; }
  });
});

describe("Vercel Blob adapter", () => {
  beforeEach(() => { vi.clearAllMocks(); process.env.BLOB_READ_WRITE_TOKEN = "tok"; process.env.STORAGE_DRIVER = "blob"; });
  it("put stores a public object under the key and returns the Blob URL", async () => {
    blob.put.mockResolvedValue({ url: "https://abc.public.blob.vercel-storage.com/website/b1/x.webp" });
    const r = await getStorage().put("website/b1/x.webp", Buffer.from("x"), "image/webp");
    expect(r).toEqual({ key: "website/b1/x.webp", url: "https://abc.public.blob.vercel-storage.com/website/b1/x.webp" });
    expect(blob.put).toHaveBeenCalledWith("website/b1/x.webp", expect.any(Buffer), expect.objectContaining({ access: "public", contentType: "image/webp", addRandomSuffix: false }));
  });
  it("usage counts files and bytes under the prefix (the per-business quota)", async () => {
    blob.list.mockResolvedValue({ blobs: [{ size: 10 }, { size: 5 }] });
    expect(await getStorage().usage("website/b1/", 51)).toEqual({ files: 2, bytes: 15 });
    expect(blob.list).toHaveBeenCalledWith(expect.objectContaining({ prefix: "website/b1/", limit: 51 }));
  });
  it("keyFromUrl recognises its own URLs only; remove deletes by key", async () => {
    const s = getStorage();
    expect(s.keyFromUrl("https://abc.public.blob.vercel-storage.com/logos/b1/a.png")).toBe("logos/b1/a.png");
    expect(s.keyFromUrl("https://evil.example/logos/b1/a.png")).toBeNull();
    expect(s.keyFromUrl("/uploads/logos/b1/a.png")).toBeNull();
    await s.remove("logos/b1/a.png");
    expect(blob.del).toHaveBeenCalledWith("logos/b1/a.png", expect.objectContaining({ token: "tok" }));
  });
});

describe("broken image records", () => {
  it("a local-disk upload URL is unusable in production, fine in development", () => {
    expect(isLocalUploadUrl("/uploads/website/b1/a.webp")).toBe(true);
    expect(usableImageUrl("/uploads/website/b1/a.webp", { NODE_ENV: "production" })).toBeNull();
    expect(usableImageUrl("/uploads/website/b1/a.webp", { NODE_ENV: "development" })).toBe("/uploads/website/b1/a.webp");
  });
  it("blob and other https URLs pass; empty and junk do not", () => {
    expect(usableImageUrl("https://abc.public.blob.vercel-storage.com/x.webp", { NODE_ENV: "production" })).toBe("https://abc.public.blob.vercel-storage.com/x.webp");
    for (const bad of ["", "  ", null, undefined, "not a url", "javascript:alert(1)"]) expect(usableImageUrl(bad as string, { NODE_ENV: "production" }), String(bad)).toBeNull();
  });
  it("stripFlaggedImages drops flagged gallery items and blanks other fields, keeping the rest", () => {
    const cfg = { hero: { image: "/uploads/a.webp", headline: "Hi" }, gallery: { images: [{ url: "/uploads/b.webp", alt: "b" }, { url: "https://ok/x.webp", alt: "ok" }] } };
    expect(stripFlaggedImages(cfg, new Set(["/uploads/a.webp", "/uploads/b.webp"]))).toEqual({ hero: { image: "", headline: "Hi" }, gallery: { images: [{ url: "https://ok/x.webp", alt: "ok" }] } });
  });
  it("the site renders pictures through the safe components, so a failed load is a placeholder or a hidden tile, never a broken icon", () => {
    const sections = readFileSync("components/site/SiteSections.tsx", "utf8");
    expect(sections).toContain("SafeFrame");
    expect(sections).toContain("SafeImage");
    expect(sections).not.toMatch(/<Image /);
    expect(readFileSync("components/site/Brand.tsx", "utf8")).toContain("SafeLogo");
    expect(readFileSync("app/[slug]/SiteHero.tsx", "utf8")).toContain("<SafeImage");
    expect(readFileSync("components/site/SafeImage.tsx", "utf8")).toContain("onError");
  });
  it("CSP img-src allows the Blob domain", () => {
    expect(readFileSync("next.config.mjs", "utf8")).toMatch(/img-src[^"]*https:\/\/\*\.public\.blob\.vercel-storage\.com/);
  });
});

describe("Bookings by Calvy footer", () => {
  it("links to calvy.io with ref and utm_source", () => {
    expect(calvyBadgeUrl("glow-salon", "https://calvy.io/")).toBe("https://calvy.io/?ref=glow-salon&utm_source=tenant_site");
  });
  it("renders in the business's colour, with the logo as a mask, never Calvy blue", () => {
    const html = renderToStaticMarkup(createElement(CalvyBadge, { slug: "glow-salon", color: "#aa3300" }));
    expect(html).toContain("Bookings by");
    expect(html).toContain('aria-label="Bookings by Calvy"');
    expect(html).toContain("ref=glow-salon");
    expect(html).toContain("utm_source=tenant_site");
    expect(html).toContain("color:#aa3300");
    expect(html).toContain("/calvy.svg");
    expect(html.toLowerCase()).not.toContain("#0284c7");
  });
  it("shown unless the owner hid it AND the plan allows hiding", () => {
    expect(badgeVisible(undefined, true)).toBe(true);
    expect(badgeVisible(false, true)).toBe(true);
    expect(badgeVisible(true, false)).toBe(true); // a lower plan cannot hide it
    expect(badgeVisible(true, true)).toBe(false);
  });
  it("reads the owner's switch from the website JSON, tolerating junk", () => {
    expect(hiddenInWebsiteJson('{"calvyBadge":{"hidden":true}}')).toBe(true);
    expect(hiddenInWebsiteJson('{"calvyBadge":{"hidden":"yes"}}')).toBe(false);
    expect(hiddenInWebsiteJson("{}")).toBe(false);
    expect(hiddenInWebsiteJson("not json")).toBe(false);
    expect(hiddenInWebsiteJson(null)).toBe(false);
  });
  it("plan gate: only plans with removeBranding may hide it", () => {
    expect(evaluateLimit(PLAN_LIMITS.free, "branding")).toMatchObject({ code: "FEATURE_LOCKED", status: 402 });
    expect(evaluateLimit(PLAN_LIMITS.professional, "branding")).not.toBeNull();
    expect(evaluateLimit(PLAN_LIMITS.business, "branding")).toBeNull();
  });
  it("the site, booking page and queue page all carry it", () => {
    expect(readFileSync("app/[slug]/page.tsx", "utf8")).toContain("<CalvyBadge");
    expect(readFileSync("components/booking/BookingClient.tsx", "utf8")).toContain("<CalvyBadge");
    expect(readFileSync("app/booking/[code]/TrackClient.tsx", "utf8")).toContain("<CalvyBadge");
  });
  it("referral cookie: slug.source only", () => {
    expect(parseRefCookie("glow-salon.tenant_site")).toEqual({ ref: "glow-salon", source: "tenant_site" });
    for (const bad of ["", "glow", "Glow.tenant", "a b.c", "-x.y", "glow.tenant site", "a".repeat(80) + ".x", undefined, null]) expect(parseRefCookie(bad as string), String(bad)).toBeNull();
  });
});

// ---- website API gate and signup attribution ----
const h = vi.hoisted(() => ({
  session: vi.fn(), checkLimit: vi.fn(), update: vi.fn(), create: vi.fn(), createBusiness: vi.fn(),
}));
vi.mock("@/lib/access", () => ({ accessSession: h.session }));
vi.mock("@/lib/limits", async (orig) => ({ ...(await orig<typeof import("@/lib/limits")>()), checkLimit: h.checkLimit }));
vi.mock("@/lib/revalidateSite", () => ({ revalidateSite: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { business: { update: h.update }, user: { create: h.create, findFirst: vi.fn(async () => null) }, passwordResetToken: { create: vi.fn() } } }));

describe("PATCH /api/website: hiding the footer", () => {
  const patch = (cfg: object) => new NextRequest("http://x/api/website", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ websiteJson: JSON.stringify(cfg) }) });
  beforeEach(() => { vi.clearAllMocks(); h.session.mockResolvedValue({ user: { businessId: "b1" } }); h.checkLimit.mockResolvedValue(null); h.update.mockResolvedValue({}); });
  it("refused with 402 when the plan cannot hide it; nothing saved", async () => {
    h.checkLimit.mockResolvedValue({ kind: "branding", status: 402, code: "FEATURE_LOCKED", error: "no" });
    const { PATCH } = await import("@/app/api/website/route");
    const res = await PATCH(patch({ calvyBadge: { hidden: true } }));
    expect(res.status).toBe(402);
    expect(h.checkLimit).toHaveBeenCalledWith("b1", "branding", expect.anything());
    expect(h.update).not.toHaveBeenCalled();
  });
  it("saved when the plan allows it; a normal save does not even check", async () => {
    const { PATCH } = await import("@/app/api/website/route");
    expect((await PATCH(patch({ calvyBadge: { hidden: true } }))).status).toBe(200);
    expect(h.update).toHaveBeenCalledTimes(1);
    h.checkLimit.mockClear();
    expect((await PATCH(patch({ metaTitle: "x" }))).status).toBe(200);
    expect(h.checkLimit).not.toHaveBeenCalled();
  });
});
