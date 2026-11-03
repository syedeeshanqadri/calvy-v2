import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { tryNormalizeEmail } from "@/lib/email-normalize";
import { notify } from "@/lib/notifications/enqueue";
import { authEmail } from "@/lib/notifications/events";
import { issueCustomerToken } from "@/lib/customerDb";

/**
 * A booking with an email makes sure that email has a customer account, so the booker can later keep track
 * of every appointment in /my. Booking never waits on this and never fails because of it.
 *
 * - No account: one is created with no password, and a "verify and set your password" link is emailed.
 * - Account made this way and not verified yet: a new link, at most once a day (so repeat bookings do not spam).
 * - Account the person created themselves but has not verified: left alone (their own signup link applies).
 * - Verified account: nothing to do.
 *
 * The account shows nothing until the emailed link is used, so typing someone else's email at booking
 * gives the booker no access; the real owner can set the password or ignore the email.
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
    const last = existing && !existing.emailVerified
      ? await prisma.customerToken.findFirst({ where: { customerId: existing.id, purpose: "verify" }, orderBy: { createdAt: "desc" }, select: { createdAt: true } })
      : null;
    const action = inviteAction(existing, last?.createdAt ?? null, now);

    let target = existing;
    if (action.create) {
      try {
        target = await prisma.customer.create({
          data: { email, name: input.name.trim().slice(0, 120) || email, password: null },
          select: { id: true, name: true, email: true, emailVerified: true, password: true },
        });
      } catch (err) {
        // Two bookings at once with the same new email: the other one created it and sent the link.
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return "verify";
        throw err;
      }
    }
    if (action.sendLink && target) {
      const token = await issueCustomerToken(prisma, target.id, "verify");
      await notify(authEmail({ template: "customer_account_setup", userId: target.id, to: target.email, name: target.name, token, baseUrl: input.baseUrl }));
    }
    return action.notice;
  } catch (err) {
    logger.error("[customer] account at booking failed", { err });
    return null;
  }
}
