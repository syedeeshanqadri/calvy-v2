// A verified person (Google, or a link sent to the address) always wins over an UNVERIFIED account on the same email. Signing up proves nothing about
// an address, so an unverified account must never block, or hold hostage, the real owner of that mailbox.
//
// What happens depends on WHO is verifying:
//   the browser that created the account (a signed device cookie set at sign-up): the same person. The address is simply verified; nobody is signed out.
//   any other browser: it may be someone else. The address is verified, the password is cleared and the password-changed time set, which ends any
//   sign-up-ticket session of whoever created it (lib/auth.ts revokes those). If the account also has a business with real bookings it is flagged for
//   Admin review ("ownership transferred"); the takeover itself is automatic either way.
// Both cases write an audit entry (when there is a business) and send the same friendly "Your email is verified" message to the address.
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notifications/enqueue";
import { emailVerifiedEmail } from "@/lib/notifications/events";

export type VerifyVia = "google" | "magic-link";

/** Pure: should this verifying sign-in take over the account? Only an account that is still unverified. */
export function needsTakeover(user: { emailVerified: Date | null } | null | undefined): boolean {
  return !!user && !user.emailVerified;
}

export async function takeOverUnverified(userId: string, via: VerifyVia, opts: { sameDevice?: boolean; now?: Date } = {}): Promise<boolean> {
  const now = opts.now ?? new Date();
  const sameDevice = opts.sameDevice === true;
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true, email: true, emailVerified: true, business: { select: { id: true, name: true } } } });
  if (!user || !needsTakeover(user)) return false;
  const bookings = user.business ? await prisma.appointment.count({ where: { businessId: user.business.id, status: { not: "expired" } } }) : 0;
  // Flagged only when someone else may have taken it: a different browser AND real bookings.
  const flagged = !sameDevice && bookings > 0;
  // Conditional write: if two verifications race, only the first takes over.
  const claimed = await prisma.user.updateMany({
    where: { id: user.id, emailVerified: null },
    data: sameDevice ? { emailVerified: now } : { emailVerified: now, password: null, passwordChangedAt: now, ...(flagged ? { ownershipTransferredAt: now } : {}) },
  });
  if (claimed.count !== 1) return false;
  if (user.business) await audit({ businessId: user.business.id, actorId: user.id, action: "account.ownership_taken", target: user.email, detail: { via, bookings, sameDevice, flaggedForReview: flagged } });
  try {
    await notify(emailVerifiedEmail({ userId: user.id, to: user.email, name: user.name, at: now }));
  } catch (err) {
    logger.error("[takeover] verified email not queued", { err });
  }
  return true;
}
