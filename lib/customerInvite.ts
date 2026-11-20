import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { tryNormalizeEmail } from "@/lib/email-normalize";

/**
 * A booking with an email makes sure that email has a customer account, silently, so the booker can later keep track of every appointment in
 * /account. Booking never waits on this and never fails because of it.
 *
 * - No account: one is created with no password. Nothing is emailed from here: the booking's CONFIRMATION email carries the "claim your Calvy
 *   account" button (lib/customerClaim.ts), a single-use link that signs in and verifies.
 * - Account not verified yet: left alone (the confirmation's claim link applies).
 * - Verified account: nothing to do.
 *
 * The account shows nothing until claimed, so typing someone else's email at booking gives the booker no access.
 */

export type AccountNotice = "created" | "verify" | null;
export const INVITE_COOLDOWN_MS = 24 * 3_600_000;

/** Pure decision, for tests: what to do for this email given the account found (or none). */
export function inviteAction(
  existing: { emailVerified: Date | null; password: string | null } | null,
  lastInviteAt: Date | null,
  now: Date,
): { notice: AccountNotice; create: boolean; sendLink: boolean } {
  if (!existing) return { notice: "created", create: true, sendLink: true };
  if (existing.emailVerified) return { notice: null, create: false, sendLink: false };
  if (existing.password) return { notice: "verify", create: false, sendLink: false };
  const due = !lastInviteAt || now.getTime() - lastInviteAt.getTime() >= INVITE_COOLDOWN_MS;
  return { notice: "verify", create: false, sendLink: due };
}

export async function ensureCustomerAccount(input: { email: string | null | undefined; name: string; baseUrl?: string }, now = new Date()): Promise<AccountNotice> {
  const email = tryNormalizeEmail(input.email ?? "");
  if (!email) return null;
  try {
    const existing = await prisma.customer.findUnique({ where: { email }, select: { id: true, name: true, email: true, emailVerified: true, password: true } });
    const action = inviteAction(existing, null, now);

    if (action.create) {
      try {
        await prisma.customer.create({
          data: { email, name: input.name.trim().slice(0, 120) || email, password: null },
        });
      } catch (err) {
        // Two bookings at once with the same new email: the other one created it.
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return "verify";
        throw err;
      }
    }
    return action.notice;
  } catch (err) {
    logger.error("[customer] account at booking failed", { err });
    return null;
  }
}
