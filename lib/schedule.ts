// Weekly working-hours helpers (S2-04). Hours are minutes since local midnight
// in Business.timezone; weekday 0 = Sunday. `staffId null` rows are business hours.
import type { Prisma, PrismaClient } from "@prisma/client";

export interface HoursRow {
  staffId: string | null;
  weekday: number;
  startMin: number;
  endMin: number;
}
export interface DayWindow {
  startMin: number;
  endMin: number;
}

/** What the old booking route assumed when nothing was configured: Mon-Fri 09:00-18:00. */
export const DEFAULT_BUSINESS_HOURS: HoursRow[] = [1, 2, 3, 4, 5].map((weekday) => ({
  staffId: null,
  weekday,
  startMin: 9 * 60,
  endMin: 18 * 60,
}));

function parseHM(v: unknown): number | null {
  if (typeof v !== "string") return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(v.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 24 || min > 59 || (h === 24 && min > 0)) return null;
  return h * 60 + min;
}

/** Rows from the legacy `Business.availabilityJson` ({"0".."6": {enabled,start,end}}). Bad JSON gives the default week. */
export function businessHoursFromJson(json: string | null | undefined): HoursRow[] {
  let parsed: unknown;
  try {
    parsed = json && json !== "{}" ? JSON.parse(json) : null;
  } catch {
    parsed = null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return DEFAULT_BUSINESS_HOURS;
  const rows: HoursRow[] = [];
  for (let weekday = 0; weekday < 7; weekday++) {
    const cfg = (parsed as Record<string, { enabled?: boolean; start?: string; end?: string } | undefined>)[String(weekday)];
    if (!cfg) {
      if (weekday >= 1 && weekday <= 5) rows.push({ staffId: null, weekday, startMin: 540, endMin: 1080 });
      continue;
    }
    if (cfg.enabled !== true) continue;
    const startMin = parseHM(cfg.start) ?? 540;
    const endMin = parseHM(cfg.end) ?? 1080;
    if (endMin > startMin) rows.push({ staffId: null, weekday, startMin, endMin });
  }
  return rows;
}

/**
 * The open windows for one weekday. A staff member with any rows of their own
 * follows only those (a weekday without a row is a day off); with none they
 * inherit the business week. A business with no rows at all uses the default week.
 */
export function resolveDayHours(rows: HoursRow[], staffId: string | null, weekday: number): DayWindow[] {
  const mine = staffId ? rows.filter((r) => r.staffId === staffId) : [];
  const business = rows.filter((r) => r.staffId === null);
  const source = mine.length > 0 ? mine : business.length > 0 ? business : DEFAULT_BUSINESS_HOURS;
  return source
    .filter((r) => r.weekday === weekday)
    .map((r) => ({ startMin: Math.max(0, r.startMin), endMin: Math.min(1440, r.endMin) }))
    .filter((w) => w.endMin > w.startMin)
    .sort((a, b) => a.startMin - b.startMin);
}

type Db = PrismaClient | Prisma.TransactionClient;

/** Replace the business week from the settings JSON, so the engine sees what the owner saved. */
export async function syncBusinessHours(db: Db, businessId: string, availabilityJson: string): Promise<void> {
  const rows = businessHoursFromJson(availabilityJson);
  await db.workingHours.deleteMany({ where: { businessId, staffId: null } });
  if (rows.length > 0) {
    await db.workingHours.createMany({
      data: rows.map((r) => ({ businessId, staffId: null, weekday: r.weekday, startMin: r.startMin, endMin: r.endMin })),
    });
  }
}

/** Link a staff member to every active service of the business (default for new staff). */
export async function linkStaffToAllServices(db: Db, businessId: string, staffId: string): Promise<void> {
  const services = await db.service.findMany({ where: { businessId, isActive: true }, select: { id: true } });
  if (services.length === 0) return;
  await db.staffService.createMany({ data: services.map((s) => ({ staffId, serviceId: s.id })), skipDuplicates: true });
}

/** Link a service to every active staff member (default for new services). */
export async function linkServiceToAllStaff(db: Db, businessId: string, serviceId: string): Promise<void> {
  const staff = await db.staff.findMany({ where: { businessId, isActive: true }, select: { id: true } });
  if (staff.length === 0) return;
  await db.staffService.createMany({ data: staff.map((s) => ({ staffId: s.id, serviceId })), skipDuplicates: true });
}
