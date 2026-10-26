import sharp from "sharp";

/**
 * Website photos are cropped to one fixed size on upload, so a phone portrait or a wide
 * banner both end up looking right in the hero and about frames. 4:3 sits between the
 * tall desktop hero panel and the wide mobile one; the page crops the last bit with CSS.
 */
export const SITE_PHOTO_SIZE = {
  hero: { width: 1600, height: 1200 },
  about: { width: 1200, height: 900 },
} as const;

export type SitePhotoPurpose = keyof typeof SITE_PHOTO_SIZE;

export function parsePhotoPurpose(v: unknown): SitePhotoPurpose {
  return v === "hero" ? "hero" : "about";
}

/**
 * Re-encode an uploaded photo as a WebP of the fixed size for its purpose. Smart-crops towards the
 * most detailed part of the picture, honours phone rotation, and drops metadata (GPS and so on).
 */
export async function processSitePhoto(
  bytes: Uint8Array,
  purpose: SitePhotoPurpose,
): Promise<{ ok: true; webp: Buffer; width: number; height: number } | { ok: false; error: string }> {
  const { width, height } = SITE_PHOTO_SIZE[purpose];
  try {
    const webp = await sharp(Buffer.from(bytes), { limitInputPixels: 60_000_000 })
      .rotate()
      .resize(width, height, { fit: "cover", position: sharp.strategy.attention })
      .webp({ quality: 82 })
      .toBuffer();
    return { ok: true, webp, width, height };
  } catch {
    return { ok: false, error: "We could not read that image. Try exporting it again as JPG or PNG." };
  }
}
