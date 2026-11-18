"use client";
import Image from "next/image";
import type { ReactNode } from "react";
import { useRegion } from "@/components/landing/useRegion";

/** The region's photo, filling its (relatively positioned) parent; the fallback (drawing or screenshot) when there is no photo file. */
export function RegionPhoto({ photos, sizes, position = "center", className = "", children }: { photos: { IN: string | null; INTL: string | null }; sizes: string; position?: string; className?: string; children: ReactNode }) {
  const region = useRegion();
  const src = photos[region === "IN" ? "IN" : "INTL"];
  return src ? <Image src={src} alt="" fill sizes={sizes} className={`object-cover ${className}`} style={{ objectPosition: position }} /> : <>{children}</>;
}
