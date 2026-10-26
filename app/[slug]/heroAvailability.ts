import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { loadTokenDay } from "@/lib/tokenBooking";
import { dayLabel, loadNextFreeSlots, timeLabel, withTimeout } from "@/lib/nextFree";
import { utcToZoned } from "@/lib/time";
import { logger } from "@/lib/logger";
import type { HeroAvail } from "./SiteHero";

// Streamed into the page, so this only bounds how long the card may take, not how long the page waits.
const LOOKUP_MS = 10_000;

/**
 * The hero's "next available" card, from the same engine the booking page uses. Slot businesses get the
 * next free start times for their first service; queue businesses get today's sessions and places left.
 * Returns null when there is nothing to show or the lookup fails or is slow: the hero just goes without it.
 */
export const loadHeroAvailability = cache(async function loadHeroAvailability(
  businessId: string, timezone: string, maxAdvanceDays: number, mode: "SLOT" | "TOKEN",
  serviceId: string, serviceName: string, bookingUrl: string, ctaText: string,
): Promise<HeroAvail | null> {
  const biz = { id: businessId, timezone, maxAdvanceDays, bookingMode: mode, services: serviceId ? [{ id: serviceId, name: serviceName }] : [] };
  try {
    const now = Date.now();
    const today = utcToZoned(new Date(now), biz.timezone).date;

    if (biz.bookingMode === "TOKEN") {
      const day = await withTimeout(loadTokenDay({ id: biz.id, timezone: biz.timezone, maxAdvanceDays: biz.maxAdvanceDays }, today, [], new Date(now)), LOOKUP_MS, null);
      if (!day || !day.ok) return null;
      const items = day.sessions.map((s) => ({
        key: s.id,
        label: s.name,
        sub: `${s.startTime} – ${s.endTime}${s.staffName ? ` · ${s.staffName}` : ""}`,
        note: s.left > 0 ? `${s.left} places left` : "Full",
        muted: s.left <= 0,
        href: bookingUrl,
      }));
      if (items.length > 0) return { title: "Today's sessions", items, footHref: bookingUrl, footLabel: ctaText };
      if (day.nextAvailable) {
        return {
          title: "Next available session",
          items: [{ key: "next", label: day.nextAvailable.sessionName, sub: dayLabel(day.nextAvailable.date, today), href: bookingUrl }],
          footHref: bookingUrl,
          footLabel: ctaText,
        };
      }
      return null;
    }

    const svc = biz.services[0];
    if (!svc) return null;
    const slots = await withTimeout(
      loadNextFreeSlots(prisma, { businessId: biz.id, serviceId: svc.id, now }),
      LOOKUP_MS,
      [],
    );
    if (slots.length === 0) return null;
    return {
      title: "Next available",
      sub: svc.name,
      items: slots.map((s) => ({
        key: `${s.date}|${s.time}`,
        label: timeLabel(s.time),
        sub: dayLabel(s.date, today),
        note: s.spots !== undefined ? `${s.spots} left` : undefined,
        href: `${bookingUrl}?service=${encodeURIComponent(svc.id)}&date=${s.date}&time=${s.time}`,
      })),
      footHref: `${bookingUrl}?service=${encodeURIComponent(svc.id)}`,
      footLabel: "See all times",
    };
  } catch (err) {
    logger.error("hero availability failed", { err, businessId: biz.id });
    return null;
  }
});
