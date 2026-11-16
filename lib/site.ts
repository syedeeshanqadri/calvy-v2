// Site-wide constants that appear in several places.

/**
 * Canonical public address of the marketing site: canonicals, sitemap, robots, Open Graph and JSON-LD all start from this one value.
 * Set SITE_URL (for example https://calvy.io) in the environment; until the real domain is live it falls back to NEXT_PUBLIC_APP_URL
 * (the Vercel address) and then to https://calvy.io. No trailing slash.
 */
export const SITE_URL = (process.env.SITE_URL || process.env.NEXT_PUBLIC_APP_URL || "https://calvy.io").replace(/\/+$/, "");

export const SITE_NAME = "Calvy";

/** Public contact address (footer, help, legal pages, push contact). Change it here only. */
export const SUPPORT_EMAIL = "support@calvy.io";

/** Contact details shown on the Contact page only (the proprietor's name is not repeated anywhere else). */
export const CONTACT = {
  proprietor: "Eeshan Ajaz",
  address: "174, Rajbagh, Srinagar",
  phone: "+91 60052 86335",
  phoneHref: "tel:+916005286335",
} as const;

/** Footer "Donate to plant a tree" link. */
export const PLANT_TREE_URL = "https://onetreeplanted.org/products/plant-trees";
