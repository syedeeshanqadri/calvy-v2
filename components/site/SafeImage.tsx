"use client";
import Image, { type ImageProps } from "next/image";
import { useState, type ReactNode } from "react";
import { isUnsplash, unsplashLoader } from "@/lib/imageLoaders";

/** Neutral stand-in for a picture that cannot be loaded: a flat tone, never the browser's broken-image icon. */
export const imagePlaceholder = <span aria-hidden style={{ position: "absolute", inset: 0, background: "#ece9e2" }} />;

/** next/image that swaps to a neutral placeholder (or `fallback`) when the file fails to load. */
export function SafeImage({ fallback, ...props }: ImageProps & { fallback?: ReactNode }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <>{fallback ?? imagePlaceholder}</>;
  // Library photos (Unsplash) are fetched at the width the layout needs (srcset from `sizes`); anything else keeps the caller's setting.
  if (isUnsplash(props.src)) {
    // eslint-disable-next-line jsx-a11y/alt-text
    return <Image {...props} unoptimized={false} loader={unsplashLoader} onError={() => setFailed(true)} />;
  }
  // eslint-disable-next-line jsx-a11y/alt-text
  return <Image {...props} onError={() => setFailed(true)} />;
}

/** A tile (div or list item) that holds one picture and disappears entirely when the picture fails. */
export function SafeFrame({ as: Tag = "div", className, src, alt, sizes }: { as?: "div" | "li"; className?: string; src: string; alt: string; sizes: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return (
    <Tag className={className}>
      <Image src={src} alt={alt} fill sizes={sizes} unoptimized onError={() => setFailed(true)} />
    </Tag>
  );
}

/** The business logo as a plain image; on failure the caller's fallback (the initials mark) shows instead. */
export function SafeLogo({ src, alt, size, className, fallback }: { src: string; alt: string; size: number; className?: string; fallback: ReactNode }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <>{fallback}</>;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} width={size} height={size} className={className} style={{ width: size, height: size }} onError={() => setFailed(true)} />;
}
