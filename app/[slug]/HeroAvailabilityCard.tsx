import { loadHeroAvailability } from "./heroAvailability";
import { AvailabilityCard } from "./SiteHero";

/** Async server component: waits for the (request-cached) lookup and renders nothing if there is no card. */
export async function HeroAvailabilityCard({ businessId, timezone, maxAdvanceDays, mode, serviceId, serviceName, bookingUrl, ctaText, where }: {
  businessId: string; timezone: string; maxAdvanceDays: number; mode: "SLOT" | "TOKEN";
  serviceId: string; serviceName: string; bookingUrl: string; ctaText: string; where: "in-copy" | "in-media";
}) {
  const avail = await loadHeroAvailability(businessId, timezone, maxAdvanceDays, mode, serviceId, serviceName, bookingUrl, ctaText);
  return avail ? <AvailabilityCard avail={avail} where={where} /> : null;
}
