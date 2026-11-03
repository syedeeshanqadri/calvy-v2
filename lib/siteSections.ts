import type { PackId } from "@/lib/packs/types";
import type { HeroLayout } from "@/lib/siteLayout";
import { heroLayoutFor } from "@/lib/siteLayout";

/** Caps for the owner-editable website sections. The API and the editor both read these. */
export const SITE_CAPS = {
  galleryImages: 12,
  faqItems: 12,
  altText: 160,
  offerText: 200,
  faqQuestion: 200,
  faqAnswer: 1000,
  staffBio: 300,
  staffSpecialisation: 80,
  title: 120,
  url: 1000,
} as const;

/**
 * Is an optional section on? A section that has content is ON unless the owner switched it off
 * (enabled === false); one without content never renders. So adding content is enough to publish it.
 */
export function sectionOn(enabled: boolean | undefined, hasContent: boolean): boolean {
  return enabled !== false && hasContent;
}

export type HeroLook = "split" | "arch" | "dark";
export type ServiceLayout = "list" | "cards";

export interface GalleryItem { url: string; alt: string }
export interface FaqItem { q: string; a: string }
export interface GallerySection { enabled?: boolean; title: string; images: GalleryItem[] }
export interface OfferSection { enabled?: boolean; text: string; /** YYYY-MM-DD, last day the banner shows; empty = no end. */ endsOn: string }
export interface FaqSection { enabled?: boolean; title: string; items: FaqItem[] }

const LOOK_TO_LAYOUT: Record<HeroLook, HeroLayout> = { split: "split", arch: "arch", dark: "immersive" };

export function parseHeroLook(v: unknown): HeroLook | null {
  return v === "split" || v === "arch" || v === "dark" ? v : null;
}

/** The owner's hero look when set, else the pack default. Stored junk falls back to the pack. */
export function resolveHeroLayout(look: unknown, packId: PackId | string | null | undefined): HeroLayout {
  const l = parseHeroLook(look);
  return l ? LOOK_TO_LAYOUT[l] : heroLayoutFor(packId);
}

export function defaultHeroLook(packId: PackId | string | null | undefined): HeroLook {
  const layout = heroLayoutFor(packId);
  return layout === "arch" ? "arch" : layout === "immersive" ? "dark" : "split";
}

export function parseServiceLayout(v: unknown): ServiceLayout {
  return v === "cards" ? "cards" : "list";
}

/** Only https URLs and our own /uploads paths may reach an <img>; no javascript:, data: or protocol-relative URLs. */
export function isSafeImageUrl(v: unknown): v is string {
  if (typeof v !== "string" || v.length === 0 || v.length > SITE_CAPS.url) return false;
  if (v.startsWith("/uploads/") && !v.includes("..") && !v.includes("//")) return true;
  try {
    return new URL(v).protocol === "https:";
  } catch {
    return false;
  }
}

const clip = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** Cleans stored gallery data: drops unsafe or duplicate images, trims alt text, enforces the 12-image cap. */
export function sanitizeGallery(items: unknown): GalleryItem[] {
  if (!Array.isArray(items)) return [];
  const seen = new Set<string>();
  const out: GalleryItem[] = [];
  for (const it of items) {
    const url = (it as GalleryItem | null)?.url;
    if (!isSafeImageUrl(url) || seen.has(url)) continue;
    seen.add(url);
    out.push({ url, alt: clip((it as GalleryItem).alt, SITE_CAPS.altText) });
    if (out.length >= SITE_CAPS.galleryImages) break;
  }
  return out;
}

export function sanitizeFaq(items: unknown): FaqItem[] {
  if (!Array.isArray(items)) return [];
  const out: FaqItem[] = [];
  for (const it of items) {
    const q = clip((it as FaqItem | null)?.q, SITE_CAPS.faqQuestion);
    const a = clip((it as FaqItem | null)?.a, SITE_CAPS.faqAnswer);
    if (q && a) out.push({ q, a });
    if (out.length >= SITE_CAPS.faqItems) break;
  }
  return out;
}

/** Problems the editor must fix before saving (the API rejects the same cases). */
export function validateSections(cfg: { gallery?: Partial<GallerySection>; faq?: Partial<FaqSection>; offer?: Partial<OfferSection> }): string[] {
  const errors: string[] = [];
  const imgs = cfg.gallery?.images ?? [];
  if (imgs.length > SITE_CAPS.galleryImages) errors.push(`The gallery holds at most ${SITE_CAPS.galleryImages} photos.`);
  if (imgs.some((i) => !isSafeImageUrl(i.url))) errors.push("A gallery photo has an invalid address.");
  if (sectionOn(cfg.gallery?.enabled, imgs.length > 0) && imgs.some((i) => !i.alt?.trim())) errors.push("Describe every gallery photo (alt text) so screen readers can read it.");
  const faq = cfg.faq?.items ?? [];
  if (faq.length > SITE_CAPS.faqItems) errors.push(`The FAQ holds at most ${SITE_CAPS.faqItems} questions.`);
  if (faq.some((f) => !f.q?.trim() || !f.a?.trim())) errors.push("Every FAQ needs both a question and an answer.");
  if (cfg.offer?.enabled === true && !cfg.offer.text?.trim()) errors.push("Write the offer text, or switch the banner off.");
  if (cfg.offer?.endsOn && !/^\d{4}-\d{2}-\d{2}$/.test(cfg.offer.endsOn)) errors.push("The offer end date is not a valid date.");
  return errors;
}

/** Banner shows while enabled, has text, and today (in the business's timezone) is not after the end date. */
export function offerVisible(offer: Partial<OfferSection> | undefined, now: Date, timezone = "UTC"): boolean {
  if (!offer || !sectionOn(offer.enabled, !!offer.text?.trim())) return false;
  if (!offer.endsOn) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(offer.endsOn)) return true;
  let today: string;
  try {
    today = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  } catch {
    today = now.toISOString().slice(0, 10);
  }
  return today <= offer.endsOn;
}

/** FAQPage structured data, or null when there is nothing to publish. Serialise with jsonLdString. */
export function faqJsonLd(items: FaqItem[]): Record<string, unknown> | null {
  const clean = sanitizeFaq(items);
  if (clean.length === 0) return null;
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: clean.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
  };
}

export function moveItem<T>(list: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return list;
  const next = list.slice();
  const [it] = next.splice(from, 1);
  next.splice(to, 0, it);
  return next;
}
