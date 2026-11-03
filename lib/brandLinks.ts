// Social links and the Google review link: validation and normalisation.
// Every value is re-validated before it is rendered, so a stored value can
// never become a javascript: or other non-https link.

export const SOCIAL_PLATFORMS = ["instagram", "facebook", "whatsapp", "x", "linkedin", "youtube", "website"] as const;
export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];
export type SocialLinks = Partial<Record<SocialPlatform, string>>;

export const SOCIAL_LABELS: Record<SocialPlatform, string> = {
  instagram: "Instagram", facebook: "Facebook", whatsapp: "WhatsApp", x: "X", linkedin: "LinkedIn", youtube: "YouTube", website: "Website",
};

type Result = { ok: true; value: string } | { ok: false; error: string };

const HOSTS: Record<Exclude<SocialPlatform, "whatsapp" | "website">, string[]> = {
  instagram: ["instagram.com"],
  facebook: ["facebook.com", "fb.com", "fb.me"],
  x: ["x.com", "twitter.com"],
  linkedin: ["linkedin.com"],
  youtube: ["youtube.com", "youtu.be"],
};

/** Profile URL prefix used when the owner types just a handle. */
const HANDLE_BASE: Partial<Record<SocialPlatform, string>> = {
  instagram: "https://instagram.com/",
  facebook: "https://facebook.com/",
  x: "https://x.com/",
  linkedin: "https://linkedin.com/in/",
  youtube: "https://youtube.com/@",
};

const HANDLE_RE = /^[A-Za-z0-9._-]{1,60}$/;

/** Parse as an https URL (adds https:// when missing, upgrades http). Null for anything else. */
function parseHttps(input: string): URL | null {
  let s = input.trim();
  if (!s || /\s/.test(s)) return null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(s) && !/^https?:\/\//i.test(s)) return null; // javascript:, data:, mailto:, ...
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
  try {
    const u = new URL(s);
    if (u.username || u.password) return null;
    if (!u.hostname.includes(".")) return null;
    u.protocol = "https:";
    return u;
  } catch {
    return null;
  }
}

function hostMatches(host: string, allowed: string[]): boolean {
  const h = host.toLowerCase().replace(/^www\./, "");
  return allowed.some((a) => h === a || h.endsWith(`.${a}`));
}

function cleanUrl(u: URL): string {
  u.hash = "";
  u.search = "";
  return u.toString().replace(/\/$/, "");
}

/** Digits only, 8 to 15 long (E.164 maximum). */
export function whatsappDigits(input: string): string | null {
  const digits = input.replace(/[\s()+-]/g, "");
  return /^\d{8,15}$/.test(digits) ? digits : null;
}

export function normalizeSocial(platform: SocialPlatform, input: string): Result {
  const raw = (input ?? "").trim();
  const label = SOCIAL_LABELS[platform];
  if (!raw) return { ok: false, error: `${label}: enter a value or leave it empty` };

  if (platform === "whatsapp") {
    const m = raw.match(/^(?:https?:\/\/)?wa\.me\/(\d{8,15})(?:[/?#].*)?$/i);
    const digits = m ? m[1] : whatsappDigits(raw);
    return digits ? { ok: true, value: `https://wa.me/${digits}` } : { ok: false, error: "WhatsApp: enter a phone number with country code, e.g. 919876543210" };
  }

  if (platform === "website") {
    const u = parseHttps(raw);
    return u ? { ok: true, value: cleanUrl(u) } : { ok: false, error: "Website: enter a valid web address" };
  }

  const handle = raw.replace(/^@/, "");
  if (HANDLE_RE.test(handle) && !handle.includes(".com")) {
    return { ok: true, value: `${HANDLE_BASE[platform]}${handle}` };
  }
  const u = parseHttps(raw);
  if (!u || !hostMatches(u.hostname, HOSTS[platform])) {
    return { ok: false, error: `${label}: enter a ${label} link or username` };
  }
  // Only query and hash are dropped, except YouTube's ?v= which identifies the video.
  const v = platform === "youtube" ? u.searchParams.get("v") : null;
  const base = cleanUrl(u);
  return { ok: true, value: v ? `${base}?v=${encodeURIComponent(v)}` : base };
}

/** Validate a whole map from the editor; empty values are dropped. */
export function normalizeSocialLinks(input: unknown): { ok: true; value: SocialLinks } | { ok: false; error: string } {
  if (input == null || typeof input !== "object" || Array.isArray(input)) return { ok: true, value: {} };
  const out: SocialLinks = {};
  for (const p of SOCIAL_PLATFORMS) {
    const v = (input as Record<string, unknown>)[p];
    if (typeof v !== "string" || !v.trim()) continue;
    const r = normalizeSocial(p, v);
    if (!r.ok) return r;
    out[p] = r.value;
  }
  return { ok: true, value: out };
}

/** For rendering: keep only values that still pass validation (one bad value does not hide the rest). */
export function parseSocialLinks(json: unknown): SocialLinks {
  const out: SocialLinks = {};
  if (json && typeof json === "object" && !Array.isArray(json)) {
    for (const p of SOCIAL_PLATFORMS) {
      const v = (json as Record<string, unknown>)[p];
      if (typeof v === "string" && v.trim()) {
        const n = normalizeSocial(p, v);
        if (n.ok) out[p] = n.value;
      }
    }
  }
  return out;
}

// ── Google review link ────────────────────────────────────────────────────────

function bareHost(u: URL): string {
  return u.hostname.toLowerCase().replace(/^www\./, "");
}

function isGoogleReviewUrl(u: URL): boolean {
  const host = bareHost(u);
  if (host === "g.page" || host === "maps.app.goo.gl" || host === "g.co") return true;
  if (host === "goo.gl") return u.pathname.startsWith("/maps");
  if (host === "search.google.com") return u.pathname.startsWith("/local/");
  if (host === "google.com") return u.pathname.startsWith("/maps") || u.pathname === "/search";
  return false;
}

export function normalizeReviewLink(input: string): Result {
  const u = parseHttps(input ?? "");
  if (!u || !isGoogleReviewUrl(u)) {
    return { ok: false, error: "Paste the review link from your Google Business Profile (it starts with g.page, search.google.com or maps.app.goo.gl)" };
  }
  u.hash = "";
  // Google's own review URLs identify the place in the query string; short links do not need one.
  if (!["search.google.com", "google.com"].includes(bareHost(u))) u.search = "";
  const value = u.toString();
  if (value.length > 500) return { ok: false, error: "That link is too long" };
  return { ok: true, value };
}

/** For rendering: the stored link, or null if it no longer validates. */
export function safeReviewLink(v: unknown): string | null {
  if (typeof v !== "string" || !v) return null;
  const r = normalizeReviewLink(v);
  return r.ok ? r.value : null;
}

/** Google Place IDs look like "ChIJ…" (older ones start Gh, Eg, Eh or Ei). Letters, digits, "_" and "-" only. */
const PLACE_ID = /^(ChIJ|GhIJ|Eg|Eh|Ei)[A-Za-z0-9_-]{10,250}$/;

export function isPlaceId(v: string): boolean {
  return PLACE_ID.test(v.trim());
}

/** The write-a-review page for a place. The same link goes to every customer: no rating filter, no gating. */
export function buildReviewLink(placeId: string): string {
  return `https://search.google.com/local/writereview?placeid=${encodeURIComponent(placeId.trim())}`;
}

export const PLACE_ID_FINDER_URL = "https://developers.google.com/maps/documentation/places/web-service/place-id";

/** What the owner pastes: a Place ID (turned into the review link) or a full Google review URL. */
export function reviewLinkFromInput(input: string): Result {
  const v = (input ?? "").trim();
  if (isPlaceId(v)) return { ok: true, value: buildReviewLink(v) };
  const r = normalizeReviewLink(v);
  if (r.ok) return r;
  return { ok: false, error: "Paste your Google Place ID (starts with ChIJ) or the review link from your Google Business Profile" };
}
