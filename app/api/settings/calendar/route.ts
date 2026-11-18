import { safeRoute } from "@/lib/api";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { accessSession } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { parseBody } from "@/lib/validation/common";
import { audit } from "@/lib/audit";
import { feedLinks, newCalendarToken } from "@/lib/calendarFeed";

export const dynamic = "force-dynamic";

const appBase = () => (process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXTAUTH_URL ?? "http://localhost:3000").replace(/\/+$/, "");
const feedUrl = (token: string) => `${appBase()}/api/calendar/${token}.ics`;

type Feed = { target: string; kind: "business" | "staff"; name: string; url: string; links: ReturnType<typeof feedLinks> };

/** Every feed of the business, creating any missing token on the way (tokens exist only once somebody opens this screen). */
async function loadFeeds(businessId: string): Promise<Feed[]> {
  const business = await prisma.business.findUnique({ where: { id: businessId }, select: { id: true, name: true, calendarToken: true } });
  if (!business) return [];
  let bToken = business.calendarToken;
  if (!bToken) {
    bToken = newCalendarToken();
    await prisma.business.update({ where: { id: businessId }, data: { calendarToken: bToken } });
  }
  const staff = await prisma.staff.findMany({ where: { businessId, isActive: true }, orderBy: { createdAt: "asc" }, select: { id: true, name: true, calendarToken: true } });
  const feeds: Feed[] = [{ target: "business", kind: "business", name: `${business.name}: all bookings`, url: feedUrl(bToken), links: feedLinks(feedUrl(bToken), `${business.name} bookings`) }];
  for (const s of staff) {
    let t = s.calendarToken;
    if (!t) {
      t = newCalendarToken();
      await prisma.staff.update({ where: { id: s.id, businessId }, data: { calendarToken: t } });
    }
    feeds.push({ target: s.id, kind: "staff", name: s.name, url: feedUrl(t), links: feedLinks(feedUrl(t), `${s.name} at ${business.name}`) });
  }
  return feeds;
}

/** Owner only: the private calendar feed URLs. Anyone with a URL can read those bookings, so they are shown to the owner alone. */
async function GET_handler() {
  const session = await accessSession("owner");
  if (!session?.user?.businessId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ feeds: await loadFeeds(session.user.businessId) }, { headers: { "Cache-Control": "no-store" } });
}

const regenerate = z.object({ target: z.string().min(1).max(64) });

/** Regenerate one feed's token ("business" or a staff id of this business). The old URL stops working at once. */
async function POST_handler(req: NextRequest) {
  const session = await accessSession("owner");
  if (!session?.user?.businessId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const businessId = session.user.businessId;
  const parsed = await parseBody(req, regenerate);
  if (!parsed.ok) return parsed.res;
  const { target } = parsed.data;
  const token = newCalendarToken();
  if (target === "business") {
    await prisma.business.update({ where: { id: businessId }, data: { calendarToken: token } });
  } else {
    const done = await prisma.staff.updateMany({ where: { id: target, businessId }, data: { calendarToken: token } });
    if (done.count !== 1) return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  await audit({ businessId, actorId: session.user.id ?? "owner", action: "calendar.feed_regenerated", target });
  return NextResponse.json({ feeds: await loadFeeds(businessId) }, { headers: { "Cache-Control": "no-store" } });
}

export const GET = safeRoute(GET_handler);
export const POST = safeRoute(POST_handler);
