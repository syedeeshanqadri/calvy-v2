import sharp from "sharp";
import { checkLogoBytes } from "@/lib/validation/logo";

export const LOGO_MAX_PX = 512;

/**
 * Validate and normalise a logo to a PNG that fits in 512x512. Every format,
 * SVG included, is re-encoded by sharp, so the stored file is always a raster
 * image and an uploaded SVG is never served raw.
 */
export async function processLogo(bytes: Uint8Array): Promise<{ ok: true; png: Buffer } | { ok: false; error: string }> {
  const check = checkLogoBytes(bytes);
  if (!check.ok) return check;
  try {
    const png = await sharp(Buffer.from(bytes), { density: check.kind === "svg" ? 300 : undefined, limitInputPixels: 40_000_000 })
      .rotate() // honour EXIF orientation; metadata is dropped on output
      .resize(LOGO_MAX_PX, LOGO_MAX_PX, { fit: "inside", withoutEnlargement: check.kind !== "svg" })
      .png({ compressionLevel: 9 })
      .toBuffer();
    return { ok: true, png };
  } catch {
    return { ok: false, error: "We could not read that image. Try exporting it again as PNG." };
  }
}
