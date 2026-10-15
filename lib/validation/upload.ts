export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
/** Per-tenant quota for website images. */
export const TENANT_UPLOAD_MAX_FILES = 50;
export const TENANT_UPLOAD_MAX_BYTES = 100 * 1024 * 1024;

export type ImageKind = { ext: "jpg" | "png" | "webp"; contentType: string };

/** Identify an image by its leading bytes (never trust the declared MIME or file name). SVG and GIF are not accepted. */
export function sniffImage(b: Uint8Array): ImageKind | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { ext: "jpg", contentType: "image/jpeg" };
  if (
    b.length >= 8 &&
    b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 &&
    b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a
  ) {
    return { ext: "png", contentType: "image/png" };
  }
  if (
    b.length >= 12 &&
    b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && // RIFF
    b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50 // WEBP
  ) {
    return { ext: "webp", contentType: "image/webp" };
  }
  return null;
}

/** Size and magic-byte validation. The extension and content type come from the verified bytes only. */
export async function checkImageUpload(
  file: File | null,
): Promise<({ ok: true } & ImageKind) | { ok: false; error: string }> {
  if (!file || file.size === 0) return { ok: false, error: "No file provided" };
  if (file.size > MAX_UPLOAD_BYTES) return { ok: false, error: "File too large (max 5 MB)" };
  const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const kind = sniffImage(head);
  if (!kind) return { ok: false, error: "Only JPEG, PNG or WebP images are allowed" };
  return { ok: true, ...kind };
}
