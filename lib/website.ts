export interface HeroSection {
  enabled: boolean;
  image: string;
  badge: string;
  headline: string;
  subheadline: string;
  ctaText: string;
  secondaryCtaText: string;
}

export interface AboutSection {
  enabled: boolean;
  image: string;
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
}

export interface WebsiteConfig {
  metaTitle: string;
  metaDescription: string;
  hero: HeroSection;
  about: AboutSection;
  services: ServicesSection;
  team: TeamSection;
  contact: ContactSection;
}

const HERO_IMAGES: Record<string, string> = {
  salon:      "photo-1560472354-b33ff0c44a43",
  hair:       "photo-1522337360788-8b13dee7a37e",
  spa:        "photo-1540555700478-4be289fbecef",
  beauty:     "photo-1487412947147-5cebf100ffc2",
  fitness:    "photo-1534438327276-14e5300c3a48",
  gym:        "photo-1571019613454-1cb2f99b2d8b",
  medical:    "photo-1579684385127-1ef15d508118",
  clinic:     "photo-1579684385127-1ef15d508118",
  dental:     "photo-1579684385127-1ef15d508118",
  health:     "photo-1505751172876-fa1923c5c528",
  restaurant: "photo-1414235077428-338989a2e8c0",
  consulting: "photo-1497366216548-37526070297c",
  legal:      "photo-1454165804606-c3d57bc86b40",
  education:  "photo-1524178232363-1fb2b075b655",
  general:    "photo-1497366216548-37526070297c",
};

const ABOUT_IMAGES: Record<string, string> = {
  salon:      "photo-1522337360788-8b13dee7a37e",
  spa:        "photo-1519823551278-64ac92734fb1",
  fitness:    "photo-1571019613454-1cb2f99b2d8b",
  medical:    "photo-1584432810601-6c7f27d2362b",
  clinic:     "photo-1584432810601-6c7f27d2362b",
  dental:     "photo-1584432810601-6c7f27d2362b",
  restaurant: "photo-1504674900247-0877df9cc836",
  consulting: "photo-1552664730-d307ca884978",
  general:    "photo-1552664730-d307ca884978",
};

function pickImage(map: Record<string, string>, businessType: string): string {
  const key = Object.keys(map).find(k => businessType.toLowerCase().includes(k)) ?? "general";
  return `https://images.unsplash.com/${map[key]}?auto=format&fit=crop&w=1920&q=80`;
}

export function defaultWebsiteConfig(businessName: string, businessType: string): WebsiteConfig {
  const typeLabel = businessType === "general" ? "services" : businessType;
  return {
    metaTitle: businessName,
    metaDescription: `Book ${typeLabel} with ${businessName}. Easy online scheduling.`,
    hero: {
      enabled: true,
      image: pickImage(HERO_IMAGES, businessType),
      badge: `Professional ${typeLabel} services`,
      headline: `Welcome to ${businessName}`,
      subheadline: `Book your appointment online — fast, simple, and hassle-free.`,
      ctaText: "Book Now",
      secondaryCtaText: "View Services",
    },
    about: {
      enabled: true,
      image: pickImage(ABOUT_IMAGES, businessType),
      badge: "About Us",
      title: "About Us",
      body: `We're passionate about delivering great ${typeLabel}. Book online or give us a call.`,
      trustLabel: "Trusted by clients",
      ctaText: "Book an appointment",
    },
    services: {
      enabled: true,
      badge: "What We Offer",
      title: "Our Services",
      subtitle: "Choose from our range of professional services.",
      ctaText: "Book an Appointment",
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
      subtext: "Reach out to us or book your appointment directly online.",
      ctaHeading: "Ready to book?",
      ctaSubtext: "Skip the wait. Book your appointment online in under 2 minutes.",
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
  { id: "photo-1497366216548-37526070297c", label: "Modern Office" },
  { id: "photo-1521737711867-e3b97375f902", label: "Team Meeting" },
  { id: "photo-1560472354-b33ff0c44a43", label: "Salon" },
  { id: "photo-1522337360788-8b13dee7a37e", label: "Hair Styling" },
  { id: "photo-1540555700478-4be289fbecef", label: "Spa & Wellness" },
  { id: "photo-1519823551278-64ac92734fb1", label: "Relaxation" },
  { id: "photo-1534438327276-14e5300c3a48", label: "Fitness" },
  { id: "photo-1571019613454-1cb2f99b2d8b", label: "Gym" },
  { id: "photo-1487412947147-5cebf100ffc2", label: "Beauty" },
  { id: "photo-1579684385127-1ef15d508118", label: "Healthcare" },
  { id: "photo-1505751172876-fa1923c5c528", label: "Medical" },
  { id: "photo-1584432810601-6c7f27d2362b", label: "Doctor / Clinic" },
  { id: "photo-1414235077428-338989a2e8c0", label: "Restaurant" },
  { id: "photo-1504674900247-0877df9cc836", label: "Food" },
  { id: "photo-1552664730-d307ca884978", label: "Consulting" },
  { id: "photo-1454165804606-c3d57bc86b40", label: "Legal / Office" },
  { id: "photo-1524178232363-1fb2b075b655", label: "Education" },
  { id: "photo-1552581234-26160f608093", label: "Workshop" },
  { id: "photo-1600880292203-757bb62b4baf", label: "Business" },
  { id: "photo-1497215842964-222b430dc094", label: "Creative Studio" },
];

export function photoUrl(id: string, size: "thumb" | "full" = "full"): string {
  return size === "thumb"
    ? `https://images.unsplash.com/${id}?auto=format&fit=crop&w=400&h=260&q=70`
    : `https://images.unsplash.com/${id}?auto=format&fit=crop&w=1920&q=80`;
}
