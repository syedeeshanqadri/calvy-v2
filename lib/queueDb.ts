// Token queue: database side of lib/queue.ts. All writes for one (session, date) run in a
// transaction under the same advisory lock the booking path uses, so a reception action and an
// online booking never interleave.
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { findOrCreateClient } from "@/lib/clients";
import { sendQueueClosed, sendQueueMovedBack, type BookingDetails } from "@/lib/email";
import { creditLabel } from "@/lib/credit";
import { creditClosedBooking } from "@/lib/creditDb";
import { getEffectiveLimits } from "@/lib/getFeatures";
import { assertMonthlyHeadroom, startOfBusinessMonth, LimitReachedError } from "@/lib/limits";
import { logger } from "@/lib/logger";
import {
  QueueActionError, computeEtas, describeOutcome, isOpen, openQueue, placeInLine, planNext, planNotComing,
  planNotPresent, planWalkIn, positionsFor, stateOf, type ItemUpdate, type QueueItem, type QueuePlan, type QueueState,
} from "@/lib/queue";
import { t } from "@/lib/terms";
import { formatDateLabel, parseYMD, utcToZoned, weekdayOf, zonedToUtc } from "@/lib/time";
import { minToHhmm, sessionCapacity } from "@/lib/tokens";
import { BOOKING_TX_OPTIONS } from "@/lib/booking";
import { trackingUrl } from "@/lib/tracking";
import { patientNameOf } from "@/lib/patients";

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
      OR: [{ status: { in: ["confirmed", "completed", "no-show"] } }, { status: "cancelled", queueState: { in: ["MOVED", "NO_SHOW", "DONE", "CANCELLED"] } }],
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
    clientName: patientNameOf(a), clientPhone: a.client.phone, serviceName: a.service.name, source: a.source,
    etaTime: eta ? utcToZoned(eta, tz).time : "", place, notPresentCount: a.notPresentCount, carried: a.carriedFromId !== null,
  };
}

/** Rows that belong on the queue screen: not held, expired or cancelled by the customer. */
const onScreen = (a: { status: string; queueState: string | null }) =>
  ["confirmed", "completed", "no-show"].includes(a.status) || (a.status === "cancelled" && ["MOVED", "NO_SHOW", "DONE", "CANCELLED"].includes(a.queueState ?? ""));

type SessionWithStaff = Prisma.TokenSessionGetPayload<{ include: { staff: { select: { name: true } } } }>;

function infoFor(s: SessionWithStaff, rows: { tokenNumber: number | null; queueState: string | null; status: string }[]): QueueSessionInfo {
  return {
    id: s.id, name: s.name, staffId: s.staffId, staffName: s.staff?.name ?? null,
    startTime: minToHhmm(s.startMin), endTime: minToHhmm(s.endMin), minutesPerToken: s.minutesPerToken, capacity: sessionCapacity(s),
    issued: Math.max(0, ...rows.map((r) => r.tokenNumber ?? 0)),
    open: rows.filter((r) => r.status === "confirmed" && isOpen({ state: r.queueState as QueueState | null })).length,
  };
}

export interface QueueScreen { sessions: QueueSessionInfo[]; queue: QueueView | null }

/**
 * Everything the reception screen shows, in two queries (sessions, then all their appointments for the
 * day): the day's sessions with counts, and the live queue of the chosen one (default: the first).
 */
export async function loadQueueScreen(biz: QueueBusiness, date: string, sessionId?: string): Promise<QueueScreen> {
  assertRealDate(date);
  const all = await prisma.tokenSession.findMany({
    where: { businessId: biz.id, isActive: true }, include: { staff: { select: { name: true } } }, orderBy: { startMin: "asc" },
  });
  const today = all.filter((s) => s.weekdays.includes(weekdayOf(date)));
  if (today.length === 0) return { sessions: [], queue: null };
  const apps = await prisma.appointment.findMany({
    where: { businessId: biz.id, tokenSessionId: { in: today.map((s) => s.id) }, sessionDate: dateOnly(date), tokenNumber: { not: null } },
    include: rowInclude,
    orderBy: { tokenNumber: "asc" },
  });
  const sessions = today.map((s) => infoFor(s, apps.filter((a) => a.tokenSessionId === s.id)));

  const chosen = today.find((s) => s.id === sessionId) ?? today[0];
  const rows = apps.filter((a) => a.tokenSessionId === chosen.id && onScreen(a));
  const order = openQueue(rows.map(toItem)).map((i) => i.id);
  const etas = etasFor(order, rows, chosen, date, biz.timezone);
  const byId = new Map(rows.map((r) => [r.id, r]));
  return {
    sessions,
    queue: {
      session: sessions.find((x) => x.id === chosen.id)!, date,
      open: order.map((id, i) => toRow(byId.get(id)!, etas[id], i + 1, biz.timezone)),
      closed: rows.filter((r) => !isOpen({ state: r.queueState })).map((r) => toRow(r, undefined, 0, biz.timezone)),
    },
  };
}

const STATUS_FOR: Partial<Record<QueueState, string>> = { DONE: "completed", NO_SHOW: "no-show", MOVED: "cancelled", CANCELLED: "cancelled" };

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

  // State changes touch at most a few rows; positions and ETAs are one batched statement.
  for (const [id, u] of Object.entries(plan.updates)) {
    const data = apply(u);
    if (Object.keys(data).length) await tx.appointment.update({ where: { id }, data });
  }
  if (plan.order.length) {
    const ids = plan.order;
    const pos = ids.map((id) => positions[id]);
    const eta = ids.map((id) => etas[id].toISOString());
    await tx.$executeRaw`
      UPDATE "Appointment" AS a
      SET "queuePosition" = v.pos, "estimatedAt" = v.eta::timestamptz
      FROM unnest(${ids}::text[], ${pos}::int[], ${eta}::text[]) AS v(id, pos, eta)
      WHERE a.id = v.id`;
  }
  return { etas };
}

export type QueueAction = "next" | "not_present" | "not_coming";

export interface QueueActionResult {
  outcome: QueuePlan["outcome"];
  /** Plain-language result for the reception screen. */
  message: string;
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

    // A booking closed here (missed four calls, or cancelled) turns what was paid online into wallet
    // credit for that customer at this clinic. Nothing is refunded and nothing moves to another day.
    let credit: { amountMinor: number; currency: string } | null = null;
    if (subject && (plan.outcome === "no_show" || plan.outcome === "cancelled")) {
      credit = await creditClosedBooking(tx, {
        businessId: biz.id, clientId: subject.clientId, appointmentId: subject.id, kind: plan.outcome === "no_show" ? "MISSED" : "CANCELLED",
      });
    }

    return { plan, subject, etas, credit, session, rows };
  }, BOOKING_TX_OPTIONS);

  const { plan, subject, etas, credit, session } = done;

  // Customer emails run after the transaction; a failed email never undoes the queue action.
  if (subject?.client.email && plan.subjectId) {
    const full = await prisma.business.findUnique({ where: { id: biz.id }, select: { name: true, slug: true, packId: true, termsOverride: true, currency: true } });
    const base: BookingDetails | null = full
      ? {
          to: subject.client.email, clientName: subject.client.name, patientName: subject.patientName ?? undefined, businessName: full.name, serviceName: subject.service.name,
          staffName: session.staffId ? (await prisma.staff.findUnique({ where: { id: session.staffId }, select: { name: true } }))?.name ?? "" : `Your ${t(full, "staff")}`,
          terms: full, date: formatDateLabel(zonedToUtc(input.date, session.startMin, tz), tz),
          time: etas[plan.subjectId] ? utcToZoned(etas[plan.subjectId], tz).time : minToHhmm(session.startMin),
          duration: session.minutesPerToken, price: subject.price, currency: full.currency ?? undefined,
          token: { number: subject.tokenNumber ?? 0, estimatedTime: etas[plan.subjectId] ? utcToZoned(etas[plan.subjectId], tz).time : "", sessionName: session.name },
          trackUrl: trackingUrl(full.slug, subject.id) ?? undefined,
          ctx: { appointmentId: subject.id, businessId: biz.id },
        }
      : null;
    if (base) {
      try {
        if (plan.outcome === "moved_back") await sendQueueMovedBack({ ...base, place: placeInLine(plan.order, plan.subjectId) });
        else if (plan.outcome === "no_show" || plan.outcome === "cancelled") {
          await sendQueueClosed({
            ...base, reason: plan.outcome === "no_show" ? "missed" : "cancelled",
            creditLabel: credit ? creditLabel(credit.amountMinor, credit.currency) : undefined,
            loginUrl: `${(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "")}/my`,
          });
        }
      } catch (e) {
        logger.error("[Queue] email failed:", { err: e });
      }
    }
  }

  const calledId = Object.entries(plan.updates).find(([, u]) => u.state === "SERVING")?.[0];
  const called = calledId ? done.rows.find((r) => r.id === calledId) : undefined;
  return {
    outcome: plan.outcome,
    message: describeOutcome({
      outcome: plan.outcome, token: subject?.tokenNumber ?? undefined, name: subject?.client.name,
      place: plan.subjectId ? placeInLine(plan.order, plan.subjectId) : undefined,
      called: called ? { token: called.tokenNumber ?? 0, name: called.client.name } : undefined,
      misses: subject ? (plan.updates[subject.id]?.notPresentCount ?? subject.notPresentCount) : undefined,
      credit: plan.outcome === "no_show" || plan.outcome === "cancelled" ? (credit ? creditLabel(credit.amountMinor, credit.currency) : null) : undefined,
      emailed: !!subject?.client.email,
    }),
  };
}

/** Reception adds a customer who walked in: name + phone, no email needed, no fee, last in the queue. */
export async function addWalkIn(
  biz: QueueBusiness & { plan: string; planStatus: string; trialEndsAt: Date | null },
  input: { sessionId: string; date: string; name: string; phone: string; serviceId?: string },
): Promise<{ tokenNumber: number; etaTime: string }> {
  assertRealDate(input.date);
  const tz = biz.timezone;

  // Reads and the client lookup happen before the transaction so it stays short (each query is a
  // network round trip to the database).
  const [limits, session] = await Promise.all([
    getEffectiveLimits(biz),
    prisma.tokenSession.findFirst({ where: { id: input.sessionId, businessId: biz.id, isActive: true } }),
  ]);
  if (!session) throw new QueueRequestError("Session not found.", 404);
  if (!session.weekdays.includes(weekdayOf(input.date))) throw new QueueRequestError("That session does not run on this date.");
  const service = await prisma.service.findFirst({
    where: {
      businessId: biz.id, isActive: true, ...(input.serviceId ? { id: input.serviceId } : {}),
      ...(session.staffId ? { staff: { some: { staffId: session.staffId } } } : {}),
    },
    orderBy: { createdAt: "asc" },
  });
  if (!service) throw new QueueRequestError("No service available for this session.");
  const client = await findOrCreateClient(prisma, biz.id, { name: input.name, phone: input.phone }, tz, { trusted: true });
  const monthStart = startOfBusinessMonth(tz);

  try {
    const result = await prisma.$transaction(async (tx) => {
      await lock(tx, lockKey(session.id, input.date));
      await assertMonthlyHeadroom(tx, biz.id, limits.maxMonthlyAppointments, monthStart);
      const rows = await loadRows(tx, biz.id, session.id, input.date);
      const last = await tx.appointment.aggregate({ where: { tokenSessionId: session.id, sessionDate: dateOnly(input.date) }, _max: { tokenNumber: true } });
      const openIds = openQueue(rows.map(toItem)).map((i) => i.id);
      const plan = planWalkIn(last._max.tokenNumber ?? 0, openIds.map((_, i) => i + 1));
      const estimatedAt = etasFor([...openIds, "new"], rows, session, input.date, tz)["new"];

      await tx.appointment.create({
        data: {
          businessId: biz.id, clientId: client.id, staffId: session.staffId, serviceId: service.id,
          date: estimatedAt, endAt: new Date(estimatedAt.getTime() + session.minutesPerToken * 60_000),
          duration: session.minutesPerToken, price: service.price, status: "confirmed", paymentStatus: "unpaid", paymentMode: "postpaid",
          source: "WALK_IN", tokenSessionId: session.id, sessionDate: dateOnly(input.date), tokenNumber: plan.tokenNumber,
          queuePosition: plan.position, estimatedAt,
        },
      });
      return { tokenNumber: plan.tokenNumber, estimatedAt };
    }, BOOKING_TX_OPTIONS);

    await prisma.client.update({ where: { id: client.id }, data: { totalAppointments: { increment: 1 }, lastVisit: result.estimatedAt } });
    return { tokenNumber: result.tokenNumber, etaTime: utcToZoned(result.estimatedAt, tz).time };
  } catch (e) {
    if (e instanceof LimitReachedError) throw new QueueRequestError("Your plan's monthly appointment limit has been reached.", 402);
    throw e;
  }
}
