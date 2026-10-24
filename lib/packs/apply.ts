import { getPack } from "./index";
import type { DefaultService, PackId } from "./types";

export interface PackServicePlan {
  toCreate: DefaultService[];
  skippedExisting: string[];
  skippedLimit: string[];
}

/**
 * Pure: which of a pack's default services still need creating. A default is skipped
 * when a service with the same name (case-insensitive, active or soft-deleted) already
 * exists, so applying twice is harmless, and once the plan's service limit has no room left.
 * `room` is the number of services the plan still allows (Infinity for unlimited).
 */
export function planPackServices(packId: PackId, existingNames: string[], room: number): PackServicePlan {
  const have = new Set(existingNames.map((n) => n.trim().toLowerCase()));
  const plan: PackServicePlan = { toCreate: [], skippedExisting: [], skippedLimit: [] };
  for (const svc of getPack(packId).defaultServices) {
    if (have.has(svc.name.toLowerCase())) plan.skippedExisting.push(svc.name);
    else if (plan.toCreate.length >= room) plan.skippedLimit.push(svc.name);
    else plan.toCreate.push(svc);
  }
  return plan;
}

/** The slice of the Prisma client (or a transaction) that applyPackDefaults needs. */
export interface PackApplyDb {
  service: {
    findMany(args: { where: { businessId: string }; select: { name: true; isActive: true } }): Promise<{ name: string; isActive: boolean }[]>;
    create(args: { data: DefaultService & { businessId: string; isActive: true } }): Promise<{ id: string }>;
  };
  staff: {
    findMany(args: { where: { businessId: string; isActive: true }; select: { id: true } }): Promise<{ id: string }[]>;
  };
  staffService: {
    createMany(args: { data: { staffId: string; serviceId: string }[]; skipDuplicates: true }): Promise<unknown>;
  };
}

export interface ApplyResult {
  added: string[];
  skippedExisting: string[];
  skippedLimit: string[];
}

/**
 * Adds the pack's default services to a business and links every active staff member to
 * them. Idempotent; never edits or removes existing services; respects `maxServices`
 * (-1 = unlimited, counted over active services).
 */
export async function applyPackDefaults(db: PackApplyDb, businessId: string, packId: PackId, maxServices: number): Promise<ApplyResult> {
  const existing = await db.service.findMany({ where: { businessId }, select: { name: true, isActive: true } });
  const activeCount = existing.filter((s) => s.isActive).length;
  const room = maxServices === -1 ? Infinity : Math.max(0, maxServices - activeCount);
  const plan = planPackServices(packId, existing.map((s) => s.name), room);

  const created: { id: string }[] = [];
  for (const svc of plan.toCreate) created.push(await db.service.create({ data: { ...svc, businessId, isActive: true } }));

  if (created.length) {
    const staff = await db.staff.findMany({ where: { businessId, isActive: true }, select: { id: true } });
    await db.staffService.createMany({
      data: staff.flatMap((st) => created.map((sv) => ({ staffId: st.id, serviceId: sv.id }))),
      skipDuplicates: true,
    });
  }
  return { added: plan.toCreate.map((s) => s.name), skippedExisting: plan.skippedExisting, skippedLimit: plan.skippedLimit };
}
