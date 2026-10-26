import type { PackId } from "@/lib/packs/types";

/** How the hero is composed. One system, three looks, picked per pack (see docs/redesign). */
export type HeroLayout = "split" | "arch" | "immersive";

const HERO_LAYOUT: Record<PackId, HeroLayout> = {
  CLINIC: "split",
  CONSULTANT: "split",
  OTHER: "split",
  SALON_SPA: "arch",
  LAWYER: "immersive",
  FITNESS: "immersive",
};

export function heroLayoutFor(packId: string | null | undefined): HeroLayout {
  return (packId && HERO_LAYOUT[packId as PackId]) || "split";
}

/**
 * Splits a headline so part of it can be set in the brand colour. If the business name is in the
 * headline ("Welcome to Sunrise Clinic") the name is the accent; otherwise the last two words,
 * for headlines of four words or more. Short headlines stay in one colour.
 */
export function splitHeadline(headline: string, businessName = ""): { lead: string; accent: string; trail: string } {
  const h = headline.trim();
  const name = businessName.trim();
  if (name.length >= 3) {
    const at = h.toLowerCase().indexOf(name.toLowerCase());
    if (at >= 0 && name.length < h.length) {
      return { lead: h.slice(0, at), accent: h.slice(at, at + name.length), trail: h.slice(at + name.length) };
    }
  }
  const words = h.split(/\s+/).filter(Boolean);
  if (words.length >= 4) {
    return { lead: `${words.slice(0, -2).join(" ")} `, accent: words.slice(-2).join(" "), trail: "" };
  }
  return { lead: h, accent: "", trail: "" };
}
