// The small "Bookings by Calvy" footer on every business website, booking page and tracking page.
// Shown by default on every plan. The Business plan (removeBranding) can hide it from the website editor.
import { getBusinessFeatures } from "@/lib/getFeatures";
export { calvyBadgeUrl } from "@/lib/calvyBadgeUrl";

/** Hidden only when the owner asked AND the plan allows it. Pure. */
export function badgeVisible(hiddenByOwner: boolean | undefined, planCanHide: boolean): boolean {
  return !(hiddenByOwner === true && planCanHide);
}

/** The owner's hide switch inside the stored website JSON (tolerant of junk). */
export function hiddenInWebsiteJson(websiteJson: string | null | undefined): boolean {
  try {
    const cfg = JSON.parse(websiteJson ?? "{}") as { calvyBadge?: { hidden?: unknown } };
    return cfg?.calvyBadge?.hidden === true;
  } catch {
    return false;
  }
}

/** For the public pages: should this business's footer show? Costs a plan lookup only when the owner asked to hide it. */
export async function showCalvyBadge(businessId: string, websiteJson: string | null | undefined): Promise<boolean> {
  if (!hiddenInWebsiteJson(websiteJson)) return true;
  const features = await getBusinessFeatures(businessId);
  return badgeVisible(true, features.removeBranding === true);
}

/** Referral cookie value: `<slug>.<utm_source>`; null unless both parts are well-formed. */
export function parseRefCookie(value: string | null | undefined): { ref: string; source: string } | null {
  const m = /^([a-z0-9][a-z0-9-]{0,59})\.([a-z0-9_]{1,32})$/.exec(value ?? "");
  return m ? { ref: m[1], source: m[2] } : null;
}
