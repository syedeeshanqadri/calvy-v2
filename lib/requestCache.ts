// Per-request memoisation for server components (React cache(): shared by a layout and its page within ONE request, never across requests).
// A dashboard navigation used to read the session, the access row and the business three or four times (layout, page, feature lookup). Each read is a
// round trip to the database; here each runs once per request. Authorization is unchanged: the same checks run on the same data, only repeated
// reads are removed, and nothing outlives the request, so a revoked member or a changed plan applies on the very next request.
import { cache } from "react";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const getSession = cache(() => getServerSession(authOptions));

/** Everything the dashboard layout and its pages read from the business row, in one query. Add a column here rather than re-querying. */
export const getBusinessCore = cache(async (businessId: string) =>
  prisma.business.findUnique({
    where: { id: businessId },
    select: {
      currency: true, packId: true, termsOverride: true, bookingMode: true, onboardingCompletedAt: true, suspendedAt: true, timezone: true,
      plan: true, planStatus: true, trialEndsAt: true, planOverridePlan: true, planOverrideUntil: true, intendedPlan: true, upgradeBannerDismissedAt: true,
    },
  }),
);
