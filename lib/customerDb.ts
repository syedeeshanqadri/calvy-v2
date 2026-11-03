import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { generateToken, hashToken, tokenExpiry, isExpired, RESET_TOKEN_TTL_MS, VERIFY_TOKEN_TTL_MS } from "@/lib/auth-tokens";
import { splitBookings, walletsByBusiness } from "@/lib/customerView";

type Db = Prisma.TransactionClient | typeof prisma;
export type TokenPurpose = "verify" | "reset";

/** A new single-use link for the customer; any unused link of the same purpose stops working. */
export async function issueCustomerToken(db: Db, customerId: string, purpose: TokenPurpose): Promise<string> {
  const token = generateToken();
  await db.customerToken.deleteMany({ where: { customerId, purpose, usedAt: null } });
  await db.customerToken.create({
    data: { customerId, purpose, tokenHash: hashToken(token), expiresAt: tokenExpiry(purpose === "verify" ? VERIFY_TOKEN_TTL_MS : RESET_TOKEN_TTL_MS) },
  });
  return token;
}

/**
 * Use a link: it must exist, match the purpose, be unused and unexpired. The claim is atomic, so a
 * second use (or a parallel one) fails. Returns the customer id, or null.
 */
export async function redeemCustomerToken(tx: Prisma.TransactionClient, rawToken: string, purpose: TokenPurpose, now: Date = new Date()): Promise<string | null> {
  const rec = await tx.customerToken.findUnique({ where: { tokenHash: hashToken(rawToken) } });
  if (!rec || rec.purpose !== purpose || rec.usedAt !== null || isExpired(rec.expiresAt, now)) return null;
  const claimed = await tx.customerToken.updateMany({ where: { id: rec.id, usedAt: null, expiresAt: { gt: now } }, data: { usedAt: now } });
  return claimed.count === 1 ? rec.customerId : null;
}

/**
 * What /my may show a signed-in customer: nothing at all until their email is verified. This is the
 * only gate between an account and the bookings that share its email address.
 */
export async function overviewForCustomer(c: { email: string; verified: boolean }, now: Date = new Date()) {
  return c.verified ? loadCustomerOverview(c.email, now) : null;
}

/**
 * Everything /my shows for one customer. The caller must pass a VERIFIED email (see getCustomer):
 * bookings are matched on it across all businesses, so an unverified address must never get here.
 */
export async function loadCustomerOverview(verifiedEmail: string, now: Date = new Date()) {
  const who = { email: { equals: verifiedEmail, mode: "insensitive" as const } };
  const [appointments, credits] = await Promise.all([
    prisma.appointment.findMany({
      // A token moved to another day leaves a "MOVED" placeholder on the old day: not a booking of its own.
      where: { client: who, OR: [{ queueState: null }, { queueState: { not: "MOVED" } }] },
      orderBy: { date: "desc" },
      take: 300,
      select: {
        id: true, date: true, estimatedAt: true, status: true, holdExpiresAt: true, patientName: true, tokenNumber: true, queueState: true, carriedFromId: true, price: true, paymentStatus: true,
        duration: true, isOnline: true, meetingUrl: true, serviceId: true,
        service: { select: { name: true, meetingUrl: true } }, staff: { select: { name: true, meetingUrl: true } },
        tokenSession: { select: { name: true } }, client: { select: { name: true } },
        business: { select: { name: true, slug: true, timezone: true, currency: true, phone: true, cancellationCutoffHours: true } },
      },
    }),
    prisma.customerCredit.findMany({
      where: { client: who },
      select: { amountMinor: true, currency: true, businessId: true, business: { select: { name: true, slug: true } } },
    }),
  ]);
  return {
    ...splitBookings(appointments, now),
    wallets: walletsByBusiness(credits.map((c) => ({ businessId: c.businessId, businessName: c.business.name, businessSlug: c.business.slug, currency: c.currency, amountMinor: c.amountMinor }))),
  };
}
