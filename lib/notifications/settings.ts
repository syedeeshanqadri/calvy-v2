import { prisma } from "@/lib/prisma";
import { getEffectiveLimits } from "@/lib/getFeatures";
import { safeReviewLink } from "@/lib/brandLinks";
import { resolvePrefs, type NotificationPrefs } from "@/lib/notifications/prefs";

export interface NotificationSettings {
  prefs: NotificationPrefs;
  /** Where business alerts and the daily summary go. */
  alertEmail: string | null;
  /** True when the alert address is the owner's login email (no business email set). */
  alertEmailIsLogin: boolean;
  hasReviewLink: boolean;
  /** The plan includes email reminders. */
  emailReminders: boolean;
}

/** What the notifications settings page shows, for one business. */
export async function loadNotificationSettings(businessId: string): Promise<NotificationSettings | null> {
  const b = await prisma.business.findUnique({
    where: { id: businessId },
    select: { notificationPrefs: true, email: true, googleReviewUrl: true, plan: true, planStatus: true, trialEndsAt: true, owner: { select: { email: true } } },
  });
  if (!b) return null;
  const limits = await getEffectiveLimits(b);
  const own = b.email?.trim() || null;
  return {
    prefs: resolvePrefs(b.notificationPrefs),
    alertEmail: own ?? b.owner?.email ?? null,
    alertEmailIsLogin: !own,
    hasReviewLink: !!safeReviewLink(b.googleReviewUrl),
    emailReminders: limits.emailReminders,
  };
}
