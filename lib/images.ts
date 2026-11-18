// Image URL hygiene for tenant sites.
//
// Why images broke: uploads made with the LOCAL storage driver are saved as "/uploads/<key>", files on one developer's disk
// (public/uploads, gitignored). The URL went into the shared database, so on Vercel the same URL points at a file that does
// not exist. Production now stores uploads in Vercel Blob (lib/storage.ts); records written earlier still hold the old URLs.

/** A path the local driver produced: only valid on the machine that wrote it. */
export const isLocalUploadUrl = (url: string): boolean => url.startsWith("/uploads/");

/**
 * The URL to render, or null when the image cannot exist on this server (a local-disk path in production, or junk).
 * Callers hide the tile or fall back to a default instead of rendering a broken image.
 */
export function usableImageUrl(url: string | null | undefined, env: { NODE_ENV?: string } = process.env): string | null {
  if (typeof url !== "string") return null;
  const u = url.trim();
  if (!u) return null;
  if (isLocalUploadUrl(u)) return env.NODE_ENV === "production" ? null : u;
  if (/^https?:\/\//i.test(u) || u.startsWith("/")) return u;
  return null;
}

/**
 * `cfg` (a website config) without the flagged image URLs: gallery items that point at one are dropped, any other field
 * holding one is blanked. Pure, used by scripts/image-records.ts --clear.
 */
export function stripFlaggedImages(cfg: unknown, flagged: ReadonlySet<string>): unknown {
  if (typeof cfg === "string") return flagged.has(cfg) ? "" : cfg;
  if (Array.isArray(cfg)) {
    return cfg
      .filter((x) => !(x && typeof x === "object" && typeof (x as { url?: unknown }).url === "string" && flagged.has((x as { url: string }).url)))
      .map((x) => stripFlaggedImages(x, flagged));
  }
  if (cfg && typeof cfg === "object") return Object.fromEntries(Object.entries(cfg).map(([k, v]) => [k, stripFlaggedImages(v, flagged)]));
  return cfg;
}
