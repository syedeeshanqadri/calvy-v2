import { prisma } from "@/lib/prisma";

const DAY = 86_400_000;

export interface AdminStats {
  businesses: { total: number; suspended: number; byPack: Record<string, number>; byRegion: Record<string, number>; byPlan: Record<string, number> };
  bookings: { today: number; last7: number; last30: number };
  signups: { last7: number; last30: number };
  activity: { active: number; dormant: number };
  notificationFailures: { last7: number; byTemplate: { template: string; count: number }[] };
  feeRevenue: { last30Minor: number; totalMinor: number; sandbox: boolean };
}

const toMap = (rows: { key: string | null; n: number }[]) => Object.fromEntries(rows.map((r) => [r.key ?? "unknown", r.n]));

/** Numbers for the admin dashboard. Counts and sums only: no customer data. "Today" is the server's UTC day. */
export async function loadAdminStats(now = new Date()): Promise<AdminStats> {
  const startOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const d7 = new Date(now.getTime() - 7 * DAY), d30 = new Date(now.getTime() - 30 * DAY);

  const [total, suspended, byPack, byRegion, byPlan, today, last7, last30, su7, su30, activeIds, failures7, failuresByTemplate, feeAll, fee30] = await Promise.all([
    prisma.business.count(),
    prisma.business.count({ where: { suspendedAt: { not: null } } }),
    prisma.business.groupBy({ by: ["packId"], _count: { _all: true } }),
    prisma.business.groupBy({ by: ["region"], _count: { _all: true } }),
    prisma.business.groupBy({ by: ["plan"], _count: { _all: true } }),
    prisma.appointment.count({ where: { createdAt: { gte: startOfToday } } }),
    prisma.appointment.count({ where: { createdAt: { gte: d7 } } }),
    prisma.appointment.count({ where: { createdAt: { gte: d30 } } }),
    prisma.business.count({ where: { createdAt: { gte: d7 } } }),
    prisma.business.count({ where: { createdAt: { gte: d30 } } }),
    prisma.appointment.groupBy({ by: ["businessId"], where: { createdAt: { gte: d30 } } }),
    prisma.notificationOutbox.count({ where: { status: "FAILED", createdAt: { gte: d7 } } }),
    prisma.notificationOutbox.groupBy({ by: ["template"], where: { status: "FAILED", createdAt: { gte: d7 } }, _count: { _all: true }, orderBy: { _count: { template: "desc" } }, take: 5 }),
    prisma.platformFeeEntry.groupBy({ by: ["kind"], _sum: { amountMinor: true } }),
    prisma.platformFeeEntry.groupBy({ by: ["kind"], where: { createdAt: { gte: d30 } }, _sum: { amountMinor: true } }),
  ]);

  const net = (rows: { kind: string; _sum: { amountMinor: number | null } }[]) =>
    rows.reduce((n, r) => n + (r.kind === "CHARGED" ? 1 : r.kind === "REFUNDED" ? -1 : 0) * (r._sum.amountMinor ?? 0), 0);

  return {
    businesses: {
      total, suspended,
      byPack: toMap(byPack.map((r) => ({ key: r.packId, n: r._count._all }))),
      byRegion: toMap(byRegion.map((r) => ({ key: r.region, n: r._count._all }))),
      byPlan: toMap(byPlan.map((r) => ({ key: r.plan, n: r._count._all }))),
    },
    bookings: { today, last7, last30 },
    signups: { last7: su7, last30: su30 },
    // Active = at least one booking made in the last 30 days; everyone else is dormant.
    activity: { active: activeIds.length, dormant: Math.max(0, total - activeIds.length) },
    notificationFailures: { last7: failures7, byTemplate: failuresByTemplate.map((r) => ({ template: r.template, count: r._count._all })) },
    feeRevenue: { totalMinor: net(feeAll), last30Minor: net(fee30), sandbox: process.env.CASHFREE_ENV !== "production" },
  };
}
