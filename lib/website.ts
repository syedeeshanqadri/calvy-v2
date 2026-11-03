import { t, type TermsSource } from "@/lib/terms";
import type { FaqSection, GallerySection, HeroLook, OfferSection, ServiceLayout } from "@/lib/siteSections";
/** Which part of a photo the fixed-size frame keeps when it has to crop. */
export type ImageFocus = "top" | "center" | "bottom";

/** CSS object-position for a focus value. Anything unknown is the middle, so stored junk never reaches a style. */
export function focusPosition(focus: unknown): string {
  return focus === "top" ? "50% 12%" : focus === "bottom" ? "50% 88%" : "50% 50%";
}

/** Library and default photos are requested at the same 4:3 size uploads are cropped to. */
const PHOTO_SIZE = { hero: { w: 1600, h: 1200 }, about: { w: 1200, h: 900 } } as const;

export interface HeroSection {
  enabled: boolean;
  image: string;
  imageFocus?: ImageFocus;
  badge: string;
  headline: string;
  subheadline: string;
  ctaText: string;
  secondaryCtaText: string;
}

export interface AboutSection {
  enabled: boolean;
  image: string;
  imageFocus?: ImageFocus;
  badge: string;
  title: string;
  body: string;
  trustLabel: string;
  ctaText: string;
}

export interface ServicesSection {
  enabled: boolean;
  badge: string;
  title: string;
  subtitle: string;
  ctaText: string;
}

export interface TeamSection {
  enabled: boolean;
  badge: string;
  title: string;
  subtitle: string;
}

export interface ContactSection {
  enabled: boolean;
  badge: string;
  title: string;
  subtext: string;
  ctaHeading: string;
  ctaSubtext: string;
  ctaNote: string;
  showPhone: boolean;
  showEmail: boolean;
  showAddress: boolean;
  /** Google map from the address; on unless set to false. */
  showMap?: boolean;
  /** Opening-hours block from the business hours; on unless set to false. */
  showHours?: boolean;
}

export interface WebsiteConfig {
  metaTitle: string;
  metaDescription: string;
  hero: HeroSection;
  about: AboutSection;
  services: ServicesSection;
  team: TeamSection;
  contact: ContactSection;
  /** Owner's hero look; unset = the pack's default. */
  heroLook?: HeroLook;
  serviceLayout?: ServiceLayout;
  gallery?: GallerySection;
  offer?: OfferSection;
  faq?: FaqSection;
}

const HERO_IMAGES: Record<string, string> = {
  salon:      "photo-1562322140-8baeececf3df",
  hair:       "photo-1562322140-8baeececf3df",
  spa:        "photo-1540555700478-4be289fbecef",
  beauty:     "photo-1487412947147-5cebf100ffc2",
  fitness:    "photo-1517836357463-d25dfeac3438",
  gym:        "photo-1517836357463-d25dfeac3438",
  medical:    "photo-1631217868264-e5b90bb7e133",
  clinic:     "photo-1631217868264-e5b90bb7e133",
  dental:     "photo-1631217868264-e5b90bb7e133",
  health:     "photo-1612349317150-e413f6a5b16d",
  restaurant: "photo-1414235077428-338989a2e8c0",
  lawyer:     "photo-1589829545856-d10d557cf95f",
  legal:      "photo-1589829545856-d10d557cf95f",
  consultant: "photo-1573497019940-1c28c88b4f3e",
  consulting: "photo-1573497019940-1c28c88b4f3e",
  education:  "photo-1524178232363-1fb2b075b655",
  general:    "photo-1497366811353-6870744d04b2",
};

const ABOUT_IMAGES: Record<string, string> = {
  salon:      "photo-1521590832167-7bcbfaa6381f",
  hair:       "photo-1521590832167-7bcbfaa6381f",
  spa:        "photo-1519823551278-64ac92734fb1",
  beauty:     "photo-1487412947147-5cebf100ffc2",
  fitness:    "photo-1540497077202-7c8a3999166f",
  gym:        "photo-1540497077202-7c8a3999166f",
  medical:    "photo-1519494026892-80bbd2d6fd0d",
  clinic:     "photo-1519494026892-80bbd2d6fd0d",
  dental:     "photo-1519494026892-80bbd2d6fd0d",
  restaurant: "photo-1504674900247-0877df9cc836",
  lawyer:     "photo-1450101499163-c8848c66ca85",
  legal:      "photo-1450101499163-c8848c66ca85",
  consultant: "photo-1522202176988-66273c2fd55f",
  consulting: "photo-1522202176988-66273c2fd55f",
  general:    "photo-1556761175-5973dc0f32e7",
};

/** Earlier defaults that look poor (an analytics screenshot, an operating theatre, a faceless head of hair, ...). */
const RETIRED_PHOTOS = [
  "photo-1560472354-b33ff0c44a43", "photo-1579684385127-1ef15d508118", "photo-1522337360788-8b13dee7a37e",
  "photo-1584432810601-6c7f27d2362b", "photo-1497366216548-37526070297c", "photo-1454165804606-c3d57bc86b40",
  "photo-1552664730-d307ca884978", "photo-1571019613454-1cb2f99b2d8b", "photo-1534438327276-14e5300c3a48",
];

/**
 * Websites saved before the photo refresh store one of the retired defaults in their config.
 * Show the current default for the business type instead; any other photo is left alone.
 */
export function currentPhoto(url: string, businessType: string, slot: "hero" | "about"): string {
  if (!url || !RETIRED_PHOTOS.some((id) => url.includes(id))) return url;
  return pickImage(slot === "hero" ? HERO_IMAGES : ABOUT_IMAGES, businessType, slot);
}

function pickImage(map: Record<string, string>, businessType: string, slot: "hero" | "about"): string {
  const key = Object.keys(map).find(k => businessType.toLowerCase().includes(k)) ?? "general";
  return photoUrl(map[key], slot);
}

export function defaultWebsiteConfig(businessName: string, businessType: string, terms: TermsSource = {}): WebsiteConfig {
  const appt = t(terms, "appointment");
  const Appt = t(terms, "appointment", { cap: true });
  const svcN = t(terms, "service", { plural: true });
  const SvcN = t(terms, "service", { plural: true, cap: true });
  const cliN = t(terms, "client", { plural: true });
  const typeLabel = businessType === "general" ? "services" : businessType;
  return {
    metaTitle: businessName,
    metaDescription: `Book ${typeLabel} with ${businessName}. Easy online scheduling.`,
    hero: {
      enabled: true,
      image: pickImage(HERO_IMAGES, businessType, "hero"),
      badge: `Professional ${typeLabel} services`,
      headline: `Welcome to ${businessName}`,
      subheadline: `Book your ${appt} online — fast, simple, and hassle-free.`,
      ctaText: "Book Now",
      secondaryCtaText: `View ${SvcN}`,
    },
    about: {
      enabled: true,
      image: pickImage(ABOUT_IMAGES, businessType, "about"),
      badge: "About Us",
      title: "About Us",
      body: `We're passionate about delivering great ${typeLabel}. Book online or give us a call.`,
      trustLabel: `Trusted by ${cliN}`,
      ctaText: `Book an ${appt}`,
    },
    services: {
      enabled: true,
      badge: "What We Offer",
      title: `Our ${SvcN}`,
      subtitle: `Choose from our range of professional ${svcN}.`,
      ctaText: `Book an ${Appt}`,
    },
    team: {
      enabled: true,
      badge: "The Team",
      title: "Our Team",
      subtitle: "Meet the professionals behind our work.",
    },
    contact: {
      enabled: true,
      badge: "Get In Touch",
      title: "Contact Us",
      subtext: `Reach out to us or book your ${appt} directly online.`,
      ctaHeading: "Ready to book?",
      ctaSubtext: `Skip the wait. Book your ${appt} online in under 2 minutes.`,
      ctaNote: "Free to book · No account needed",
      showPhone: true,
      showEmail: true,
      showAddress: true,
    },
  };
}

export function parseWebsiteConfig(json: string): WebsiteConfig | null {
  try {
    const parsed = JSON.parse(json);
    if (parsed && typeof parsed === "object" && parsed.hero) return parsed as WebsiteConfig;
    return null;
  } catch {
    return null;
  }
}

// Curated photo library shown in the image picker
export const PHOTO_LIBRARY = [
  { id: "photo-1497366811353-6870744d04b2", label: "Modern Space" },
  { id: "photo-1521737711867-e3b97375f902", label: "Team Meeting" },
  { id: "photo-1562322140-8baeececf3df", label: "Hair Stylist" },
  { id: "photo-1521590832167-7bcbfaa6381f", label: "Salon" },
  { id: "photo-1605497788044-5a32c7078486", label: "Barber" },
  { id: "photo-1540555700478-4be289fbecef", label: "Spa & Wellness" },
  { id: "photo-1519823551278-64ac92734fb1", label: "Massage" },
  { id: "photo-1517836357463-d25dfeac3438", label: "Strength Training" },
  { id: "photo-1540497077202-7c8a3999166f", label: "Gym" },
  { id: "photo-1487412947147-5cebf100ffc2", label: "Beauty" },
  { id: "photo-1604654894610-df63bc536371", label: "Nails" },
  { id: "photo-1631217868264-e5b90bb7e133", label: "Doctor and Patient" },
  { id: "photo-1612349317150-e413f6a5b16d", label: "Doctor" },
  { id: "photo-1519494026892-80bbd2d6fd0d", label: "Clinic Reception" },
  { id: "photo-1505751172876-fa1923c5c528", label: "Medical" },
  { id: "photo-1589829545856-d10d557cf95f", label: "Legal" },
  { id: "photo-1450101499163-c8848c66ca85", label: "Contract" },
  { id: "photo-1573497019940-1c28c88b4f3e", label: "Consultant" },
  { id: "photo-1522202176988-66273c2fd55f", label: "Client Meeting" },
  { id: "photo-1556761175-5973dc0f32e7", label: "Workshop" },
  { id: "photo-1414235077428-338989a2e8c0", label: "Restaurant" },
  { id: "photo-1504674900247-0877df9cc836", label: "Food" },
  { id: "photo-1524178232363-1fb2b075b655", label: "Education" },
  { id: "photo-1600880292203-757bb62b4baf", label: "Business" },
  { id: "photo-1497215842964-222b430dc094", label: "Creative Studio" },
];

export function photoUrl(id: string, size: "thumb" | "full" | "hero" | "about" = "full"): string {
  if (size === "thumb") return `https://images.unsplash.com/${id}?auto=format&fit=crop&w=400&h=300&q=70`;
  if (size === "hero" || size === "about") {
    const { w, h } = PHOTO_SIZE[size];
    return `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${w}&h=${h}&q=80`;
  }
  return `https://images.unsplash.com/${id}?auto=format&fit=crop&w=1920&q=80`;
}

/** JSON with sorted keys, so two configs with the same content compare equal whatever order they were built in. */
export function stableJson(value: unknown): string {
  return JSON.stringify(value, (_k, v) =>
    v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b))) : v);
}
