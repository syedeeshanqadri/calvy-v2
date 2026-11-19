// A verified person (Google, or a link sent to the address) always wins over an UNVERIFIED account on the same email. Signing up proves nothing about
// an address, so an unverified account must never block, or hold hostage, the real owner of that mailbox.
//
// What happens to the unverified account: it becomes the verifying person's. Its password is cleared and its password-changed time set, which ends any
// sign-up-ticket session of whoever created it (lib/auth.ts revokes those). If the account already has a business with real bookings, it is also
// flagged for Admin review ("ownership transferred"); the takeover itself is automatic either way. The address gets an email, and the business
// (if any) gets an audit entry.
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notifications/enqueue";
import { ownershipTransferredEmail } from "@/lib/notifications/events";

export type VerifyVia = "google" | "magic-link";

/** Pure: should this verifying sign-in take over the account? Only an account that is still unverified. */
export function needsTakeover(user: { emailVerified: Date | null } | null | undefined): boolean {
  return !!user && !user.emailVerified;
}

export async function takeOverUnverified(userId: string, via: VerifyVia, now = new Date()): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true, email: true, emailVerified: true, business: { select: { id: true, name: true } } } });
  if (!user || !needsTakeover(user)) return false;
  const bookings = user.business ? await prisma.appointment.count({ where: { businessId: user.business.id, status: { not: "expired" } } }) : 0;
  const flagged = bookings > 0;
  // Conditional write: if two verifications race, only the first takes over.
  const claimed = await prisma.user.updateMany({
    where: { id: user.id, emailVerified: null },
    data: { emailVerified: now, password: null, passwordChangedAt: now, ...(flagged ? { ownershipTransferredAt: now } : {}) },
  });
  if (claimed.count !== 1) return false;
  if (user.business) await audit({ businessId: user.business.id, actorId: user.id, action: "account.ownership_taken", target: user.email, detail: { via, bookings, flaggedForReview: flagged } });
  try {
    await notify(ownershipTransferredEmail({ userId: user.id, to: user.email, name: user.name, via, at: now }));
  } catch (err) {
    logger.error("[takeover] notice email not queued", { err });
  }
  return true;
}
