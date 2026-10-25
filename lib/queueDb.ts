// Token queue: database side of lib/queue.ts. All writes for one (session, date) run in a
// transaction under the same advisory lock the booking path uses, so a reception action and an
// online booking never interleave.
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { findOrCreateClient } from "@/lib/clients";
import { sendQueueMovedBack, sendQueueMovedNextDay, sendQueueNoShow, type BookingDetails } from "@/lib/email";
import { getEffectiveLimits } from "@/lib/getFeatures";
import { assertMonthlyHeadroom, startOfBusinessMonth, LimitReachedError } from "@/lib/limits";
import { logger } from "@/lib/logger";
import {
  QueueActionError, computeEtas, isOpen, nextWorkingDate, openQueue, placeInLine, planNext, planNotComing,
  planNotPresent, planWalkIn, positionsFor, stateOf, type ItemUpdate, type QueueItem, type QueuePlan, type QueueState,
} from "@/lib/queue";
import { t } from "@/lib/terms";
import { addDays, formatDateLabel, parseYMD, utcToZoned, weekdayOf, zonedDayRange, zonedToUtc } from "@/lib/time";
import { minToHhmm, sessionCapacity } from "@/lib/tokens";

type Tx = Prisma.TransactionClient;

const dateOnly = (d: string) => new Date(`${d}T00:00:00Z`);
const lockKey = (sessionId: string, date: string) => `token:${sessionId}:${date}`;
const lock = (tx: Tx, key: string) => tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;

export interface QueueBusiness { id: string; timezone: string; name: string; packId: string; termsOverride: unknown; currency: string | null }

export interface QueueRow {
  id: string;
  tokenNumber: number;
  state: QueueState;
  clientName: string;
  clientPhone: string | null;
  serviceName: string;
  source: "ONLINE" | "DASHBOARD" | "WALK_IN";
  /** Estimated time, HH:MM in the business timezone. */
  etaTime: string;
  /** 1-based place in the open queue (0 when closed). */
  place: number;
  notPresentCount: number;
  carried: boolean;
}

export interface QueueSessionInfo {
  id: string; name: string; staffId: string | null; staffName: string | null;
  startTime: string; endTime: string; minutesPerToken: number; capacity: number;
  issued: number; open: number;
}

export interface QueueView {
  session: QueueSessionInfo;
  date: string;
  open: QueueRow[];
  closed: QueueRow[];
}

/** Why a request cannot be served (mapped to HTTP errors by the routes). */
export class QueueRequestError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

export function assertRealDate(date: string): void {
  if (!parseYMD(date)) throw new QueueRequestError("Invalid date.");
}

const rowInclude = {
  client: { select: { name: true, email: true, phone: true } },
  service: { select: { name: true } },
} satisfies Prisma.AppointmentInclude;

type RowWithRelations = Prisma.AppointmentGetPayload<{ include: typeof rowInclude }>;

/** Appointments of a session/day that belong on the queue screen (not held, expired or customer-cancelled). */
async function loadRows(db: Tx | typeof prisma, businessId: string, sessionId: string, date: string): Promise<RowWithRelations[]> {
  return db.appointment.findMany({
    where: {
      businessId, tokenSessionId: sessionId, sessionDate: dateOnly(date), tokenNumber: { not: null },
      OR: [{ status: { in: ["confirmed", "completed", "no-show"] } }, { status: "cancelled", queueState: { in: ["MOVED", "NO_SHOW", "DONE"] } }],
    },
    include: rowInclude,
    orderBy: { tokenNumber: "asc" },
  });
}

const toItem = (a: RowWithRelations): QueueItem => ({
  id: a.id, tokenNumber: a.tokenNumber ?? 0, position: a.queuePosition, state: a.queueState,
  notPresentCount: a.notPresentCount, carriedFromId: a.carriedFromId,
});

/** ETAs for the open queue as it stands. */
function etasFor(order: string[], rows: RowWithRelations[], session: { startMin: number; minutesPerToken: number }, date: string, tz: string) {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const servingId = order.find((id) => byId.get(id)?.queueState === "SERVING") ?? null;
  return computeEtas({
    order, servingId, sessionStart: zonedToUtc(date, session.startMin, tz),
    servingStartedAt: servingId ? byId.get(servingId)?.servingStartedAt ?? null : null,
    minutesPerToken: session.minutesPerToken,
  });
}

function toRow(a: RowWithRelations, eta: Date | undefined, place: number, tz: string): QueueRow {
  return {
    id: a.id, tokenNumber: a.tokenNumber ?? 0, state: stateOf({ state: a.queueState }),
    clientName: a.client.name, clientPhone: a.client.phone, serviceName: a.service.name, source: a.source,
    etaTime: eta ? utcToZoned(eta, tz).time : "", place, notPresentCount: a.notPresentCount, carried: a.carriedFromId !== null,
  };
}

async function sessionInfo(businessId: string, sessionId: string, date: string): Promise<QueueSessionInfo> {
  const s = await prisma.tokenSession.findFirst({ where: { id: sessionId, businessId }, include: { staff: { select: { name: true } } } });
  if (!s) throw new QueueRequestError("Session not found.", 404);
  const rows = await prisma.appointment.findMany({
    where: { tokenSessionId: sessionId, sessionDate: dateOnly(date), tokenNumber: { not: null } },
    select: { tokenNumber: true, queueState: true, status: true },
  });
  return {
    id: s.id, name: s.name, staffId: s.staffId, staffName: s.staff?.name ?? null,
    startTime: minToHhmm(s.startMin), endTime: minToHhmm(s.endMin), minutesPerToken: s.minutesPerToken, capacity: sessionCapacity(s),
    issued: Math.max(0, ...rows.map((r) => r.tokenNumber ?? 0)),
    open: rows.filter((r) => r.status === "confirmed" && isOpen({ state: r.queueState })).length,
  };
}

/** Sessions running on `date` (active, matching weekday), with how many tokens are issued / still open. */
export async function loadQueueSessions(businessId: string, date: string): Promise<QueueSessionInfo[]> {
  assertRealDate(date);
  const sessions = await prisma.tokenSession.findMany({ where: { businessId, isActive: true }, orderBy: { startMin: "asc" } });
  const today = sessions.filter((s) => s.weekdays.includes(weekdayOf(date)));
  return Promise.all(today.map((s) => sessionInfo(businessId, s.id, date)));
}

export async function loadQueue(biz: QueueBusiness, sessionId: string, date: string): Promise<QueueView> {
  assertRealDate(date);
  const info = await sessionInfo(biz.id, sessionId, date);
  const session = await prisma.tokenSession.findUniqueOrThrow({ where: { id: sessionId } });
  const rows = await loadRows(prisma, biz.id, sessionId, date);
  const openItems = openQueue(rows.map(toItem));
  const order = openItems.map((i) => i.id);
  const etas = etasFor(order, rows, session, date, biz.timezone);
  const byId = new Map(rows.map((r) => [r.id, r]));
  return {
    session: info, date,
    open: order.map((id, i) => toRow(byId.get(id)!, etas[id], i + 1, biz.timezone)),
    closed: rows.filter((r) => !isOpen({ state: r.queueState })).map((r) => toRow(r, undefined, 0, biz.timezone)),
  };
}

const STATUS_FOR: Partial<Record<QueueState, string>> = { DONE: "completed", NO_SHOW: "no-show", MOVED: "cancelled" };

async function writePlan(tx: Tx, rows: RowWithRelations[], plan: QueuePlan, session: { startMin: number; minutesPerToken: number }, date: string, tz: string) {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const apply = (u: ItemUpdate) => ({
    ...(u.state ? { queueState: u.state, ...(STATUS_FOR[u.state] ? { status: STATUS_FOR[u.state] } : {}) } : {}),
    ...(u.notPresentCount !== undefined ? { notPresentCount: u.notPresentCount } : {}),
    ...(u.servingStartedAt !== undefined ? { servingStartedAt: u.servingStartedAt } : {}),
  });
  // Final serving token and when it started, to recompute the open queue's ETAs.
  const finalState = (id: string) => plan.updates[id]?.state ?? stateOf({ state: byId.get(id)?.queueState ?? null });
  const servingId = plan.order.find((id) => finalState(id) === "SERVING") ?? null;
  const startedAt = servingId
    ? (plan.updates[servingId]?.servingStartedAt !== undefined ? plan.updates[servingId].servingStartedAt : byId.get(servingId)?.servingStartedAt) ?? null
    : null;
  const etas = computeEtas({ order: plan.order, servingId, sessionStart: zonedToUtc(date, session.startMin, tz), servingStartedAt: startedAt, minutesPerToken: session.minutesPerToken });
  const positions = positionsFor(plan.order);

  for (const id of new Set([...Object.keys(plan.updates), ...plan.order])) {
    await tx.appointment.update({
      where: { id },
      data: {
        ...apply(plan.updates[id] ?? {}),
        ...(positions[id] ? { queuePosition: positions[id], estimatedAt: etas[id] } : {}),
      },
    });
  }
  return { etas };
}

export type QueueAction = "next" | "not_present" | "not_coming";

export interface QueueActionResult {
  outcome: QueuePlan["outcome"];
  subjectToken?: number;
  /** Where a carried-over token went. */
  movedTo?: { date: string; tokenNumber: number };
}

/** Run a reception action on a session's queue. */
export async function runQueueAction(
  biz: QueueBusiness,
  input: { sessionId: string; date: string; action: QueueAction; appointmentId?: string },
): Promise<QueueActionResult> {
  assertRealDate(input.date);
  const tz = biz.timezone;
  const now = new Date();

  const done = await prisma.$transaction(async (tx) => {
    await lock(tx, lockKey(input.sessionId, input.date));
    const session = await tx.tokenSession.findFirst({ where: { id: input.sessionId, businessId: biz.id } });
    if (!session) throw new QueueRequestError("Session not found.", 404);
    const rows = await loadRows(tx, biz.id, session.id, input.date);
    const items = rows.map(toItem);

    let plan: QueuePlan;
    try {
      if (input.action === "next") plan = planNext(items, now);
      else {
        if (!input.appointmentId) throw new QueueRequestError("Choose a token.");
        plan = input.action === "not_present" ? planNotPresent(items, input.appointmentId, now) : planNotComing(items, input.appointmentId, now);
      }
    } catch (e) {
      if (e instanceof QueueActionError) throw new QueueRequestError(e.message, 409);
      throw e;
    }

    const { etas } = await writePlan(tx, rows, plan, session, input.date, tz);
    const subject = plan.subjectId ? rows.find((r) => r.id === plan.subjectId) : undefined;
    let movedTo: QueueActionResult["movedTo"];
    let carried: { appointmentId: string; estimatedAt: Date } | undefined;

    if (plan.outcome === "carry_over" && subject) {
      // Same session, next working day, end of that queue; the paid state travels with the booking.
      const closures = await tx.timeOff.findMany({
        where: {
          businessId: biz.id, OR: [{ staffId: null }, ...(session.staffId ? [{ staffId: session.staffId }] : [])],
          endAt: { gt: zonedDayRange(input.date, tz).start }, startAt: { lt: zonedDayRange(addDays(input.date, 61), tz).end },
        },
        select: { startAt: true, endAt: true },
      });
      const isClosed = (d: string) => {
        const r = zonedDayRange(d, tz);
        return closures.some((c) => c.startAt < r.end && c.endAt > r.start);
      };
      const target = nextWorkingDate(session.weekdays, input.date, isClosed);
      if (!target) throw new QueueRequestError("No working day found to move this token to.", 409);
      await lock(tx, lockKey(session.id, target));
      const targetRows = await loadRows(tx, biz.id, session.id, target);
      const last = await tx.appointment.aggregate({ where: { tokenSessionId: session.id, sessionDate: dateOnly(target) }, _max: { tokenNumber: true } });
      const targetOpen = openQueue(targetRows.map(toItem)).map((i) => i.id);
      const walk = planWalkIn(last._max.tokenNumber ?? 0, targetOpen.map((_, i) => i + 1));
      const newTokenNumber = walk.tokenNumber;
      const targetEtas = etasFor([...targetOpen, "new"], targetRows, session, target, tz);
      const estimatedAt = targetEtas["new"] ?? zonedToUtc(target, session.startMin + (newTokenNumber - 1) * session.minutesPerToken, tz);
      const created = await tx.appointment.create({
        data: {
          businessId: biz.id, clientId: subject.clientId, staffId: subject.staffId, serviceId: subject.serviceId,
          date: estimatedAt, endAt: new Date(estimatedAt.getTime() + session.minutesPerToken * 60_000),
          duration: subject.duration, price: subject.price, status: "confirmed", notes: subject.notes,
          paymentStatus: subject.paymentStatus, paymentMode: subject.paymentMode, source: subject.source,
          tokenSessionId: session.id, sessionDate: dateOnly(target), tokenNumber: newTokenNumber,
          queuePosition: walk.position, estimatedAt, carriedFromId: subject.id,
        },
      });
      carried = { appointmentId: created.id, estimatedAt };
      movedTo = { date: target, tokenNumber: newTokenNumber };
    }

    return { plan, subject, etas, movedTo, carried, session };
  });

  const { plan, subject, etas, movedTo, carried, session } = done;

  // Customer emails run after the transaction; a failed email never undoes the queue action.
  if (subject?.client.email && plan.subjectId) {
    const full = await prisma.business.findUnique({ where: { id: biz.id }, select: { name: true, packId: true, termsOverride: true, currency: true } });
    const base: BookingDetails | null = full
      ? {
          to: subject.client.email, clientName: subject.client.name, businessName: full.name, serviceName: subject.service.name,
          staffName: session.staffId ? (await prisma.staff.findUnique({ where: { id: session.staffId }, select: { name: true } }))?.name ?? "" : `Your ${t(full, "staff")}`,
          terms: full, date: formatDateLabel(zonedToUtc(input.date, session.startMin, tz), tz),
          time: etas[plan.subjectId] ? utcToZoned(etas[plan.subjectId], tz).time : minToHhmm(session.startMin),
          duration: session.minutesPerToken, price: subject.price, currency: full.currency ?? undefined,
          token: { number: subject.tokenNumber ?? 0, estimatedTime: etas[plan.subjectId] ? utcToZoned(etas[plan.subjectId], tz).time : "", sessionName: session.name },
          ctx: { appointmentId: subject.id, businessId: biz.id },
        }
      : null;
    if (base) {
      try {
        if (plan.outcome === "moved_back") await sendQueueMovedBack({ ...base, place: placeInLine(plan.order, plan.subjectId) });
        else if (plan.outcome === "no_show" || plan.outcome === "closed") await sendQueueNoShow(base);
        else if (plan.outcome === "carry_over" && movedTo && carried) {
          await sendQueueMovedNextDay({
            ...base, date: formatDateLabel(carried.estimatedAt, tz), time: utcToZoned(carried.estimatedAt, tz).time,
            token: { number: movedTo.tokenNumber, estimatedTime: utcToZoned(carried.estimatedAt, tz).time, sessionName: session.name },
            appointmentDate: carried.estimatedAt, ctx: { appointmentId: carried.appointmentId, businessId: biz.id },
          });
        }
      } catch (e) {
        logger.error("[Queue] email failed:", { err: e });
      }
    }
  }

  return { outcome: plan.outcome, subjectToken: subject?.tokenNumber ?? undefined, movedTo };
}

/** Reception adds a customer who walked in: name + phone, no email needed, no fee, last in the queue. */
export async function addWalkIn(
  biz: QueueBusiness & { plan: string; planStatus: string; trialEndsAt: Date | null },
  input: { sessionId: string; date: string; name: string; phone: string; serviceId?: string },
): Promise<{ tokenNumber: number; etaTime: string }> {
  assertRealDate(input.date);
  const tz = biz.timezone;
  const limits = await getEffectiveLimits(biz);
  const monthStart = startOfBusinessMonth(tz);

  try {
    return await prisma.$transaction(async (tx) => {
      await lock(tx, lockKey(input.sessionId, input.date));
      const session = await tx.tokenSession.findFirst({ where: { id: input.sessionId, businessId: biz.id, isActive: true } });
      if (!session) throw new QueueRequestError("Session not found.", 404);
      if (!session.weekdays.includes(weekdayOf(input.date))) throw new QueueRequestError("That session does not run on this date.");

      const services = await tx.service.findMany({
        where: {
          businessId: biz.id, isActive: true, ...(input.serviceId ? { id: input.serviceId } : {}),
          ...(session.staffId ? { staff: { some: { staffId: session.staffId } } } : {}),
        },
        orderBy: { createdAt: "asc" },
        take: 1,
      });
      const service = services[0];
      if (!service) throw new QueueRequestError("No service available for this session.");

      await assertMonthlyHeadroom(tx, biz.id, limits.maxMonthlyAppointments, monthStart);
      const client = await findOrCreateClient(tx, biz.id, { name: input.name, phone: input.phone }, tz, { trusted: true });
      const rows = await loadRows(tx, biz.id, session.id, input.date);
      const last = await tx.appointment.aggregate({ where: { tokenSessionId: session.id, sessionDate: dateOnly(input.date) }, _max: { tokenNumber: true } });
      const openIds = openQueue(rows.map(toItem)).map((i) => i.id);
      const plan = planWalkIn(last._max.tokenNumber ?? 0, openIds.map((_, i) => i + 1));
      const etas = etasFor([...openIds, "new"], rows, session, input.date, tz);
      const estimatedAt = etas["new"];

      await tx.appointment.create({
        data: {
          businessId: biz.id, clientId: client.id, staffId: session.staffId, serviceId: service.id,
          date: estimatedAt, endAt: new Date(estimatedAt.getTime() + session.minutesPerToken * 60_000),
          duration: session.minutesPerToken, price: service.price, status: "confirmed", paymentStatus: "unpaid", paymentMode: "postpaid",
          source: "WALK_IN", tokenSessionId: session.id, sessionDate: dateOnly(input.date), tokenNumber: plan.tokenNumber,
          queuePosition: plan.position, estimatedAt,
        },
      });
      await tx.client.update({ where: { id: client.id }, data: { totalAppointments: { increment: 1 }, lastVisit: estimatedAt } });
      return { tokenNumber: plan.tokenNumber, etaTime: utcToZoned(estimatedAt, tz).time };
    });
  } catch (e) {
    if (e instanceof LimitReachedError) throw new QueueRequestError("Your plan's monthly appointment limit has been reached.", 402);
    throw e;
  }
}
