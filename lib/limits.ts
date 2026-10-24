// One place that answers "does this plan allow it?" for every server route.
// Limits come from the PlanConfig table (via getEffectiveLimits), never from the
// code defaults, so an edit at /admin/plans applies immediately. Pages still
// render <UpgradeGate>; this is the enforcement behind them.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isActivePlan, type PlanLimits } from "@/lib/plans";
import { getEffectiveLimits } from "@/lib/getFeatures";
import { safeTimeZone, utcToZoned, zonedToUtc } from "@/lib/time";

export type LimitKind = "staff" | "services" | "monthlyAppointments" | "upload" | "csv" | "group";

export interface LimitDenial {
  kind: LimitKind;
  status: 402;
  code: "LIMIT_REACHED" | "FEATURE_LOCKED" | "PLAN_EXPIRED";
  error: string;
  limit?: number;
}

const LOCKED: Record<"upload" | "csv" | "group", string> = {
  upload: "Image upload is not available on your plan. Upgrade to add images.",
  csv: "CSV export is not available on your plan. Upgrade to download your data.",
  group: "Group bookings are not available on your plan. Upgrade to use services with more than one spot.",
};

/** Pure decision: `used` is the current count for the counted kinds. */
export function evaluateLimit(limits: PlanLimits, kind: LimitKind, used = 0): LimitDenial | null {
  switch (kind) {
    case "staff":
      return limits.maxStaff !== -1 && used >= limits.maxStaff
        ? { kind, status: 402, code: "LIMIT_REACHED", limit: limits.maxStaff, error: `Staff limit (${limits.maxStaff}) reached on your plan. Upgrade to add more.` }
        : null;
    case "services":
      return limits.maxServices !== -1 && used >= limits.maxServices
        ? { kind, status: 402, code: "LIMIT_REACHED", limit: limits.maxServices, error: `Service limit (${limits.maxServices}) reached. Upgrade your plan.` }
        : null;
    case "monthlyAppointments":
      return limits.maxMonthlyAppointments !== -1 && used >= limits.maxMonthlyAppointments
        ? { kind, status: 402, code: "LIMIT_REACHED", limit: limits.maxMonthlyAppointments, error: `Monthly appointment limit (${limits.maxMonthlyAppointments}) reached. Upgrade your plan.` }
        : null;
    case "upload":
      return limits.imageUpload ? null : { kind, status: 402, code: "FEATURE_LOCKED", error: LOCKED.upload };
    case "csv":
      return limits.csvExport ? null : { kind, status: 402, code: "FEATURE_LOCKED", error: LOCKED.csv };
    case "group":
      return limits.groupBooking ? null : { kind, status: 402, code: "FEATURE_LOCKED", error: LOCKED.group };
  }
}

/** First instant of the current calendar month in the business timezone. */
export function startOfBusinessMonth(tz: string | null | undefined, now: Date = new Date()): Date {
  const zone = safeTimeZone(tz);
  return zonedToUtc(utcToZoned(now, zone).date.slice(0, 8) + "01", 0, zone);
}

export interface CheckOptions {
  /** Owner-initiated action: a lapsed paid plan is refused outright (PLAN_EXPIRED). */
  owner?: boolean;
  /** Service capacity being created or booked (kind "group"). */
  capacity?: number;
  now?: Date;
}

/**
 * Check one limit for one business. Returns the denial, or null when allowed.
 * Public booking paths leave `owner` unset: a lapsed plan falls back to Free limits.
 */
export async function checkLimit(businessId: string, kind: LimitKind, opts: CheckOptions = {}): Promise<LimitDenial | null> {
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: { plan: true, planStatus: true, trialEndsAt: true, timezone: true },
  });
  if (!business) return { kind, status: 402, code: "PLAN_EXPIRED", error: "Business not found." };

  if (opts.owner && !isActivePlan(business.planStatus, business.plan, business.trialEndsAt)) {
    return { kind, status: 402, code: "PLAN_EXPIRED", error: "Your trial has expired. Please upgrade to continue." };
  }
  const limits = await getEffectiveLimits(business);

  if (kind === "group") return (opts.capacity ?? 1) > 1 ? evaluateLimit(limits, kind) : null;

  let used = 0;
  if (kind === "staff" && limits.maxStaff !== -1) {
    used = await prisma.staff.count({ where: { businessId, isActive: true } });
  } else if (kind === "services" && limits.maxServices !== -1) {
    used = await prisma.service.count({ where: { businessId, isActive: true } });
  } else if (kind === "monthlyAppointments" && limits.maxMonthlyAppointments !== -1) {
    used = await prisma.appointment.count({
      where: { businessId, createdAt: { gte: startOfBusinessMonth(business.timezone, opts.now) } },
    });
  }
  return evaluateLimit(limits, kind, used);
}

export function denialResponse(d: LimitDenial): NextResponse {
  return NextResponse.json({ error: d.error, code: d.code, ...(d.limit !== undefined && { limit: d.limit }) }, { status: d.status });
}

/** Thrown inside a booking transaction when the monthly cap was reached by a parallel booking. */
export class LimitReachedError extends Error {
  constructor() {
    super("monthly appointment limit reached");
    this.name = "LimitReachedError";
  }
}

interface CountTx {
  $executeRaw(strings: TemplateStringsArray, ...values: unknown[]): Promise<number>;
  appointment: { count(args: { where: { businessId: string; createdAt: { gte: Date } } }): Promise<number> };
}

/**
 * Monthly cap re-checked under its own business lock. Always call it after the
 * staff lock (bookExclusive takes that first) so the lock order is fixed and
 * parallel bookings for different staff cannot overshoot the limit.
 */
export async function assertMonthlyHeadroom(tx: CountTx, businessId: string, max: number, monthStart: Date): Promise<void> {
  if (max === -1) return;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${"limit:" + businessId}, 0))`;
  const used = await tx.appointment.count({ where: { businessId, createdAt: { gte: monthStart } } });
  if (used >= max) throw new LimitReachedError();
}
