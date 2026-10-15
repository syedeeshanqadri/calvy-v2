const MAX_BYTES = 5 * 1024 * 1024;
const TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

/** Allow-list of raster image types (SVG is excluded: it can carry script). Extension comes from the MIME type, never the file name. */
export function checkImageUpload(file: File | null): { ok: true; ext: string } | { ok: false; error: string } {
  if (!file || file.size === 0) return { ok: false, error: "No file provided" };
  if (file.size > MAX_BYTES) return { ok: false, error: "File too large (max 5 MB)" };
  const ext = TYPES[file.type];
  if (!ext) return { ok: false, error: "Only JPEG, PNG, WebP or GIF images are allowed" };
  return { ok: true, ext };
}
