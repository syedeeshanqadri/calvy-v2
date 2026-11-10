import type { Prisma, PrismaClient } from "@prisma/client";
import { tryNormalizeEmail } from "@/lib/email-normalize";
import { signTicket, verifyTicket } from "@/lib/signedTicket";
import { readCreditTicket } from "@/lib/creditDb";
import { readFollowUpTicket } from "@/lib/followUpDb";

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * Booking limits for a VERIFIED customer: someone who signed in to My bookings with a verified email and came to the
 * booking page through one of their own links (Book again, Use credit, Free follow-up). A guest who just types an email
 * proves nothing, so guests keep the existing guest rules (rate limit, one booking per person per day, the people cap, the
 * 30-a-day no-email rule). The numbers are set by a Calvy admin (Admin → Settings); 0 turns a limit off.
 */
export const VERIFIED_DEFAULTS = { maxUpcomingPerBusiness: 6, maxNewPer24h: 5 } as const;
export const VERIFIED_KEYS = { upcoming: "verified.maxUpcomingPerBusiness", new24: "verified.maxNewPer24h" } as const;
export interface VerifiedLimits { maxUpcomingPerBusiness: number; maxNewPer24h: number }

export function parseLimit(v: string | undefined | null, fallback: number): number {
  const n = Number(v);
  return v !== undefined && v !== null && v !== "" && Number.isInteger(n) && n >= 0 && n <= 100 ? n : fallback;
}

export async function getVerifiedLimits(db: Db): Promise<VerifiedLimits> {
  const rows = await db.appSetting.findMany({ where: { key: { in: [VERIFIED_KEYS.upcoming, VERIFIED_KEYS.new24] } } });
  const map = new Map(rows.map((r) => [r.key, r.value]));
  return {
    maxUpcomingPerBusiness: parseLimit(map.get(VERIFIED_KEYS.upcoming), VERIFIED_DEFAULTS.maxUpcomingPerBusiness),
    maxNewPer24h: parseLimit(map.get(VERIFIED_KEYS.new24), VERIFIED_DEFAULTS.maxNewPer24h),
  };
}

/** A generic "this verified customer is booking" ticket, issued by the My bookings "Book again" link. */
const PURPOSE = "verified-booker";
export const signVerifiedTicket = (customerId: string) => signTicket(PURPOSE, customerId, process.env.NEXTAUTH_SECRET ?? "", 2 * 3_600_000);

/**
 * Is this booking made by a verified customer? Any of their own tickets proves who is booking, the customer must be verified,
 * and the booking's contact email must be theirs (a ticket never lends verified status to someone else's booking).
 */
export async function isVerifiedBooker(db: Db, tickets: (string | null | undefined)[], bookingEmail: string): Promise<boolean> {
  const secret = process.env.NEXTAUTH_SECRET ?? "";
  const ids = new Set<string>();
  for (const t of tickets) {
    if (!t) continue;
    const id = verifyTicket(PURPOSE, t, secret) ?? readCreditTicket(t)?.customerId ?? readFollowUpTicket(t)?.customerId ?? null;
    if (id) ids.add(id);
  }
  for (const id of ids) {
    const c = await db.customer.findUnique({ where: { id }, select: { email: true, emailVerified: true } });
    if (c?.emailVerified && tryNormalizeEmail(c.email) === tryNormalizeEmail(bookingEmail)) return true;
  }
  return false;
}

export type LimitVerdict = { ok: true } | { ok: false; code: "VERIFIED_UPCOMING_LIMIT" | "VERIFIED_DAILY_LIMIT"; status: 409 | 429; message: string };

/** Upcoming bookings still ahead, and bookings made in the last 24 hours, for this email at this business. */
export async function checkVerifiedLimits(
  db: Db,
  p: { businessId: string; businessName: string; email: string; limits: VerifiedLimits; now?: Date },
): Promise<LimitVerdict> {
  const now = p.now ?? new Date();
  const who = { email: { equals: p.email, mode: "insensitive" as const } };
  if (p.limits.maxUpcomingPerBusiness > 0) {
    const upcoming = await db.appointment.count({
      where: { businessId: p.businessId, client: who, status: { in: ["confirmed", "pending", "pending_payment"] }, date: { gte: now } },
    });
    if (upcoming >= p.limits.maxUpcomingPerBusiness) {
      return { ok: false, code: "VERIFIED_UPCOMING_LIMIT", status: 409, message: `You already have ${upcoming} upcoming bookings with ${p.businessName}. Please wait until one has passed, or cancel one, before booking another.` };
    }
  }
  if (p.limits.maxNewPer24h > 0) {
    const recent = await db.appointment.count({
      where: { businessId: p.businessId, client: who, status: { not: "expired" }, createdAt: { gte: new Date(now.getTime() - 24 * 3_600_000) } },
    });
    if (recent >= p.limits.maxNewPer24h) {
      return { ok: false, code: "VERIFIED_DAILY_LIMIT", status: 429, message: `You have made ${recent} bookings with ${p.businessName} in the last 24 hours. Please try again later.` };
    }
  }
  return { ok: true };
}
