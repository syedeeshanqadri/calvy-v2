import { sniffImage } from "@/lib/validation/upload";

export const MAX_LOGO_BYTES = 2 * 1024 * 1024;

export type LogoKind = "png" | "jpg" | "webp" | "svg";

/** SVG constructs that can run script or pull in other files. Any match rejects the upload. */
const SVG_FORBIDDEN =
  /<!ENTITY|<!DOCTYPE[^>]*\[|<script|<foreignObject|<iframe|<embed|<object|\son[a-z]+\s*=|javascript:|(?:xlink:)?href\s*=\s*["'](?!#|data:image\/(?:png|jpe?g|webp);)/i;

function head(b: Uint8Array, n: number): string {
  return new TextDecoder("utf-8", { fatal: false }).decode(b.subarray(0, n)).replace(/^﻿/, "");
}

/** Does this look like an SVG document (decided from content, after an optional xml prolog and comments)? */
export function looksLikeSvg(b: Uint8Array): boolean {
  return /^\s*(?:<\?xml[^>]*\?>\s*)?(?:<!--[\s\S]*?-->\s*)*(?:<!DOCTYPE svg[^>]*>\s*)?<svg[\s>]/i.test(head(b, 4096));
}

export type LogoCheck = { ok: true; kind: LogoKind } | { ok: false; error: string };

/** Size and content validation. The declared MIME type and file name are never trusted. */
export function checkLogoBytes(bytes: Uint8Array): LogoCheck {
  if (bytes.length === 0) return { ok: false, error: "No file provided" };
  if (bytes.length > MAX_LOGO_BYTES) return { ok: false, error: "Logo is too large (max 2 MB)" };
  const raster = sniffImage(bytes);
  if (raster) return { ok: true, kind: raster.ext };
  if (looksLikeSvg(bytes)) {
    if (SVG_FORBIDDEN.test(head(bytes, bytes.length))) {
      return { ok: false, error: "This SVG contains features that are not allowed. Export a plain SVG or use PNG." };
    }
    return { ok: true, kind: "svg" };
  }
  return { ok: false, error: "Logo must be a PNG, JPG, SVG or WebP image" };
}
