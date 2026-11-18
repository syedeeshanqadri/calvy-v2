"use client";
import Image from "next/image";
import { useRegion } from "@/components/landing/useRegion";

/**
 * A real product screenshot from the set that matches the visitor's region: /marketing/in (India, INR, Indian names) or
 * /marketing/intl (USD, international names). Same size and layout in both, so nothing moves when the region resolves.
 * Region comes from the same detection as pricing (cookie, then /api/region); International until it is known.
 */
export function RegionImage({ name, alt, width, height, priority = false, className = "" }: { name: string; alt: string; width: number; height: number; priority?: boolean; className?: string }) {
  const region = useRegion();
  return (
    <Image src={`/marketing/${region === "IN" ? "in" : "intl"}/${name}.webp`} alt={alt} width={width} height={height} priority={priority} fetchPriority={priority ? "high" : "auto"} unoptimized className={className} />
  );
}
