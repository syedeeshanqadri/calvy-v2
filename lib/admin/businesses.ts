import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { PACK_IDS } from "@/lib/packs/types";

export const PAGE_SIZE = 25;
const DAY = 86_400_000;

const opt = <T extends z.ZodTypeAny>(t: T) => z.preprocess((v) => (v === "" || v == null ? undefined : v), t.optional());
export const businessFilterSchema = z.object({
  q: opt(z.string().trim().max(100)),
  pack: opt(z.enum(PACK_IDS)),
  region: opt(z.enum(["IN", "INTL"])),
  plan: opt(z.string().trim().max(30)),
  status: opt(z.enum(["active", "dormant", "suspended"])),
  from: opt(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  to: opt(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  page: z.preprocess((v) => Number(v) || 1, z.number().int().min(1).max(10_000)),
});
export type BusinessFilters = z.infer<typeof businessFilterSchema>;

/** The WHERE for the businesses list (pure, tested). Status: active = a booking in the last 30 days, dormant = none, suspended = suspended. */
export function buildBusinessWhere(f: BusinessFilters, now = new Date()): Prisma.BusinessWhereInput {
  const and: Prisma.BusinessWhereInput[] = [];
  if (f.q) and.push({ OR: [{ name: { contains: f.q, mode: "insensitive" } }, { slug: { contains: f.q, mode: "insensitive" } }, { owner: { email: { contains: f.q, mode: "insensitive" } } }] });
  if (f.pack) and.push({ packId: f.pack });
  if (f.region) and.push({ region: f.region });
  if (f.plan) and.push({ plan: f.plan });
  const d30 = new Date(now.getTime() - 30 * DAY);
  if (f.status === "suspended") and.push({ suspendedAt: { not: null } });
  if (f.status === "active") and.push({ suspendedAt: null, appointments: { some: { createdAt: { gte: d30 } } } });
  if (f.status === "dormant") and.push({ suspendedAt: null, appointments: { none: { createdAt: { gte: d30 } } } });
  if (f.from) and.push({ createdAt: { gte: new Date(`${f.from}T00:00:00Z`) } });
  if (f.to) and.push({ createdAt: { lt: new Date(new Date(`${f.to}T00:00:00Z`).getTime() + DAY) } });
  return and.length ? { AND: and } : {};
}

export async function listBusinesses(f: BusinessFilters) {
  const where = buildBusinessWhere(f);
  const [total, rows] = await Promise.all([
    prisma.business.count({ where }),
    prisma.business.findMany({
      where, orderBy: { createdAt: "desc" }, skip: (f.page - 1) * PAGE_SIZE, take: PAGE_SIZE,
      select: {
        id: true, name: true, slug: true, packId: true, region: true, plan: true, planOverridePlan: true, suspendedAt: true, createdAt: true, onboardingCompletedAt: true,
        owner: { select: { email: true } }, _count: { select: { appointments: true } },
      },
    }),
  ]);
  return { total, rows, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}
