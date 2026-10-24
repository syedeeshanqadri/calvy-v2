import { REGION_COOKIE, DEFAULT_REGION, type Region } from "@/lib/pricing";

export const REGION_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

export function parseRegion(value: string | null | undefined): Region | null {
  return value === "IN" || value === "INTL" ? value : null;
}

/** ISO country code -> pricing region. Unknown or missing codes are international. */
export function regionFromCountry(country: string | null | undefined): Region | null {
  const c = country?.trim().toUpperCase();
  // Cloudflare sends XX (unknown) and T1 (Tor); treat both as "no signal"
  if (!c || !/^[A-Z]{2}$/.test(c) || c === "XX" || c === "T1") return null;
  return c === "IN" ? "IN" : "INTL";
}

/** Region from edge headers: Cloudflare first, then Vercel; a header with no usable country is skipped. */
export function regionFromHeaders(headers: Pick<Headers, "get">): Region | null {
  return regionFromCountry(headers.get("cf-ipcountry")) ?? regionFromCountry(headers.get("x-vercel-ip-country"));
}

function cookieValue(cookieHeader: string | null | undefined, name: string): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) return rest.join("=");
  }
  return null;
}

export function regionFromCookieHeader(cookieHeader: string | null | undefined): Region | null {
  return parseRegion(cookieValue(cookieHeader, REGION_COOKIE));
}

/**
 * Cookie override first, then edge headers, then the supplied IP lookup;
 * INTL if nothing yields a country (or the lookup throws).
 */
export async function resolveRegion(opts: {
  cookie?: string | null;
  headers: Pick<Headers, "get">;
  lookupCountry?: () => Promise<string | null>;
}): Promise<{ region: Region; source: "cookie" | "header" | "ip" | "default" }> {
  const fromCookie = regionFromCookieHeader(opts.cookie);
  if (fromCookie) return { region: fromCookie, source: "cookie" };

  const fromHeader = regionFromHeaders(opts.headers);
  if (fromHeader) return { region: fromHeader, source: "header" };

  if (opts.lookupCountry) {
    try {
      const fromIp = regionFromCountry(await opts.lookupCountry());
      if (fromIp) return { region: fromIp, source: "ip" };
    } catch {
      // fall through to the default
    }
  }
  return { region: DEFAULT_REGION, source: "default" };
}

export function regionCookieString(region: Region): string {
  return `${REGION_COOKIE}=${region}; Path=/; Max-Age=${REGION_COOKIE_MAX_AGE}; SameSite=Lax`;
}
