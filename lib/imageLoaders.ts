/** Unsplash serves any width on request, so a tenant photo is asked for at the size the page needs, not the 1600px the library stores. */
export const UNSPLASH_HOST = "https://images.unsplash.com/";
export function isUnsplash(src: unknown): src is string { return typeof src === "string" && src.startsWith(UNSPLASH_HOST); }

export function unsplashLoader({ src, width, quality }: { src: string; width: number; quality?: number }): string {
  const u = new URL(src);
  u.searchParams.set("w", String(width));
  u.searchParams.delete("h"); // the box crops it (object-fit), so no fixed height
  u.searchParams.set("fit", "crop");
  u.searchParams.set("auto", "format");
  u.searchParams.set("q", String(quality ?? 75));
  return u.toString();
}
