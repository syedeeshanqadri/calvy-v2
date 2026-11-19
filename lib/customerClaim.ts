// Silent customer accounts and the "claim" link. A booking makes sure its email has a Calvy customer account (no prompt, no password, nothing shown
// until it is claimed). The confirmation email then carries a "Manage your bookings: claim your Calvy account" button: a single-use link (14 days) that
// signs the customer in, verifies the address, and offers an optional password and Link Google.
//
// Safety: the link goes only to the address typed at booking, so whoever opens it controls that mailbox. Claiming an account that someone had made on
// that address WITH a password (never verified) clears that password: the mailbox holder wins, an unverified account never keeps access to the
// bookings that share an address. Unclaimed accounts cannot sign in with a password (no password, or an unverified one, is refused at sign-in).
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { tryNormalizeEmail } from "@/lib/email-normalize";
import { generateToken, hashToken, tokenExpiry } from "@/lib/auth-tokens";

type Db = Prisma.TransactionClient | typeof prisma;
export const CLAIM_TTL_MS = 14 * 24 * 3_600_000;
export const CLAIM_PURPOSE = "claim";

const appBase = () => (process.env.NEXT_PUBLIC_APP_URL ?? "https://calvy.io").replace(/\/+$/, "");

/** Find the customer for this email, or create one with no password. Never fails a booking and never merges by anything but the email. */
export async function findOrCreateCustomerByEmail(email: string, name: string) {
  const e = tryNormalizeEmail(email);
  if (!e || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return null; // not an address: no account, no link
  const existing = await prisma.customer.findUnique({ where: { email: e }, select: { id: true, name: true, email: true, emailVerified: true } });
  if (existing) return existing;
  try {
    return await prisma.customer.create({ data: { email: e, name: name.trim().slice(0, 120) || e, password: null }, select: { id: true, name: true, email: true, emailVerified: true } });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return prisma.customer.findUnique({ where: { email: e }, select: { id: true, name: true, email: true, emailVerified: true } }); // a parallel booking made it
    }
    throw err;
  }
}

export async function issueClaimToken(db: Db, customerId: string, now = new Date()): Promise<string> {
  const token = generateToken();
  // Older claim links stay valid (each confirmation email has its own); only finished or expired ones are tidied away.
  await db.customerToken.deleteMany({ where: { customerId, purpose: CLAIM_PURPOSE, OR: [{ usedAt: { not: null } }, { expiresAt: { lt: now } }] } });
  await db.customerToken.create({ data: { customerId, purpose: CLAIM_PURPOSE, tokenHash: hashToken(token), expiresAt: tokenExpiry(CLAIM_TTL_MS, now) } });
  return token;
}

/**
 * The link for a confirmation email: a claim link for an account that is not verified yet, or a plain "my account" link once it is. Null when the
 * address is unusable. Called when the email is sent, so the token exists only in that email (it is never stored in the queue).
 */
export async function claimUrlFor(email: string, name: string): Promise<{ url: string; claimed: boolean } | null> {
  const customer = await findOrCreateCustomerByEmail(email, name);
  if (!customer) return null;
  if (customer.emailVerified) return { url: `${appBase()}/account`, claimed: true };
  return { url: `${appBase()}/account/claim?token=${await issueClaimToken(prisma, customer.id)}`, claimed: false };
}

/** Spend a claim link (one atomic write) and verify the account. Returns the customer, or null when the link is unknown, used or expired. */
export async function redeemClaim(rawToken: string | undefined | null, now = new Date()): Promise<{ id: string; name: string; email: string } | null> {
  if (!rawToken || !/^[0-9a-f]{64}$/.test(rawToken)) return null;
  const tokenHash = hashToken(rawToken);
  const claimed = await prisma.customerToken.updateMany({ where: { tokenHash, purpose: CLAIM_PURPOSE, usedAt: null, expiresAt: { gt: now } }, data: { usedAt: now } });
  if (claimed.count !== 1) return null;
  const rec = await prisma.customerToken.findUnique({ where: { tokenHash }, select: { customer: { select: { id: true, name: true, email: true, emailVerified: true, password: true } } } });
  const c = rec?.customer;
  if (!c) return null;
  if (!c.emailVerified) {
    // The mailbox holder wins: verify, and drop a password that was set on this address before it was ever verified.
    await prisma.customer.updateMany({ where: { id: c.id, emailVerified: null }, data: { emailVerified: now, ...(c.password ? { password: null, passwordChangedAt: now } : {}) } });
  }
  return { id: c.id, name: c.name, email: c.email };
}
