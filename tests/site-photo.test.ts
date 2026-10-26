import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { parsePhotoPurpose, processSitePhoto, SITE_PHOTO_SIZE } from "@/lib/photo";

const solid = (width: number, height: number, format: "jpeg" | "png" = "jpeg") =>
  sharp({ create: { width, height, channels: 3, background: "#3366cc" } })[format]().toBuffer();

describe("step-6/redesign-site-foundation: uploaded website photos are fixed to one size", () => {
  it.each([
    ["a tall phone portrait", 900, 2400],
    ["a wide banner", 3000, 600],
    ["a square", 1000, 1000],
    ["a small image", 320, 240],
  ])("crops %s to the hero size", async (_name, w, h) => {
    const r = await processSitePhoto(new Uint8Array(await solid(w, h)), "hero");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const meta = await sharp(r.webp).metadata();
    expect([meta.format, meta.width, meta.height]).toEqual(["webp", SITE_PHOTO_SIZE.hero.width, SITE_PHOTO_SIZE.hero.height]);
  });

  it("uses the smaller about size for about photos", async () => {
    const r = await processSitePhoto(new Uint8Array(await solid(2000, 1000, "png")), "about");
    expect(r.ok && [r.width, r.height]).toEqual([SITE_PHOTO_SIZE.about.width, SITE_PHOTO_SIZE.about.height]);
  });

  it("rejects bytes that are not an image instead of throwing", async () => {
    const r = await processSitePhoto(new Uint8Array([1, 2, 3, 4]), "hero");
    expect(r.ok).toBe(false);
  });

  it("any purpose other than hero is treated as about", () => {
    expect(parsePhotoPurpose("hero")).toBe("hero");
    expect(parsePhotoPurpose("about")).toBe("about");
    expect(parsePhotoPurpose("../../x")).toBe("about");
    expect(parsePhotoPurpose(null)).toBe("about");
  });
});
