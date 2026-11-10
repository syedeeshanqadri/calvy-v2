import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { BOOKING_TX_OPTIONS } from "@/lib/booking";
import { notify } from "@/lib/notifications/enqueue";
import { noticeFrom, reschedule } from "@/lib/notifications/events";
import { ownerAlert } from "@/lib/notifications/business";
import { sendPushToBusiness } from "@/lib/push";
import { shortName } from "@/lib/pushRouting";
import { manageability, tokenMoveBlocker } from "@/lib/customerView";
import { beforeCancellationCutoff } from "@/lib/holds";
import { loadTokenDay, type TokenDayOption } from "@/lib/tokenBooking";
import { formatDateLabel, formatTimeLabel, safeTimeZone, weekdayOf, zonedToUtc } from "@/lib/time";
import { issueToken, minToHhmm, type TokenStore } from "@/lib/tokens";
import { findOwned, type Fail } from "@/lib/customerAppointments";

/**
 * A signed-in customer moving their own queue token to another day. The booking (and its payment) stays the
 * same row: it takes the next token in the chosen session, at the end of that day's queue. The old day keeps
 * a cancelled "MOVED" placeholder with the old number, so numbers are never reused and the front desk sees
 * the token went elsewhere. A token moves once. Missed-call handling on the day itself is a separate flow.
 */

const fail = (status: number, error: string, code?: string): Fail => ({ ok: false, status, error, code });
const dateOnly = (d: string) => new Date(`${d}T00:00:00Z`);
const ymd = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");

class StaleTokenError extends Error {}

type Owned = NonNullable<Awaited<ReturnType<typeof findOwned>>>;

/** Shared checks: owned, a token, still waiting, before the cutoff, not moved before, and a different day. */
async function checkMovable(verifiedEmail: string, id: string, date: string): Promise<{ ok: true; a: Owned } | Fail> {
  const a = await findOwned(verifiedEmail, id);
  if (!a) return fail(404, "Booking not found.");
  if (!a.tokenNumber || !a.tokenSessionId || !a.sessionDate) return fail(400, "This booking is not a queue token.");
  const can = manageability(a, new Date());
  if (!can.ok) return fail(409, can.reason, can.code);
  const blocked = tokenMoveBlocker(a);
  if (blocked) return fail(409, blocked, "MOVED_ONCE");
  if (date === ymd(a.sessionDate)) return fail(400, "Pick another day. On the day itself, the front desk keeps your place in the queue.");
  return { ok: true, a };
}

const bizCtx = (a: Owned) => ({ id: a.businessId, timezone: safeTimeZone(a.business.timezone), maxAdvanceDays: a.business.maxAdvanceDays ?? 0 });

/** Sessions on `date` this token could move to (same service, with tokens left). */
export async function tokenMoveOptions(verifiedEmail: string, id: string, date: string): Promise<{ ok: true; sessions: TokenDayOption[] } | Fail> {
  const check = await checkMovable(verifiedEmail, id, date);
  if (!check.ok) return check;
  const day = await loadTokenDay(bizCtx(check.a), date, [check.a.serviceId]);
  if (!day.ok) return fail(400, day.error);
  return { ok: true, sessions: day.sessions.filter((s) => s.left > 0) };
}

/** Move the token to the end of the queue of `sessionId` on `date`. */
export async function moveTokenByCustomer(
  verifiedEmail: string, id: string, date: string, sessionId: string,
): Promise<{ ok: true; dateLabel: string; token: number; estimatedTime: string } | Fail> {
  const check = await checkMovable(verifiedEmail, id, date);
  if (!check.ok) return check;
  const a = check.a;
  const biz = bizCtx(a);
  const tz = biz.timezone;

  // Same rules as booking a token: a session of this business, open that weekday, offering this service.
  const day = await loadTokenDay(biz, date, [a.serviceId]);
  if (!day.ok) return fail(400, day.error);
  const option = day.sessions.find((s) => s.id === sessionId);
  if (!option) return fail(400, "That session is not available on this date.");
  const session = await prisma.tokenSession.findFirst({ where: { id: sessionId, businessId: a.businessId, isActive: true } });
  if (!session || !session.weekdays.includes(weekdayOf(date))) return fail(400, "That session is not available on this date.");

  const old = { date: a.date, sessionId: a.tokenSessionId as string, sessionDate: a.sessionDate as Date, number: a.tokenNumber as number };
  const store: TokenStore<Prisma.TransactionClient> = {
    run: (key, fn) =>
      prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
        return fn(tx);
      }, BOOKING_TX_OPTIONS),
    async lastNumber(tx) {
      const r = await tx.appointment.aggregate({ where: { tokenSessionId: sessionId, sessionDate: dateOnly(date) }, _max: { tokenNumber: true } });
      return r._max.tokenNumber ?? 0;
    },
  };

  let result;
  try {
    result = await issueToken(store, session, date, async (tx, assign) => {
      const estimatedAt = zonedToUtc(date, assign.estimatedMin, tz);
      const hours = a.business.cancellationCutoffHours ?? 0;
      if (!beforeCancellationCutoff(estimatedAt, hours, new Date())) throw new StaleTokenError("cutoff");
      // Guarded on what we checked: still waiting on the old day with the old number, never moved.
      const moved = await tx.appointment.updateMany({
        where: {
          id: a.id, status: { in: ["confirmed", "pending"] }, carriedFromId: null,
          tokenSessionId: old.sessionId, sessionDate: old.sessionDate, tokenNumber: old.number,
          OR: [{ queueState: null }, { queueState: "WAITING" }],
        },
        data: {
          tokenSessionId: session.id, sessionDate: dateOnly(date), tokenNumber: assign.number, staffId: session.staffId,
          date: estimatedAt, estimatedAt, endAt: new Date(estimatedAt.getTime() + session.minutesPerToken * 60_000),
          duration: session.minutesPerToken, queuePosition: null, queueState: null, notPresentCount: 0, servingStartedAt: null,
          reminderSent: false,
        },
      });
      if (moved.count !== 1) throw new StaleTokenError("stale");
      // The old number stays taken on the old day. Created after the move, so the unique number is free.
      const placeholder = await tx.appointment.create({
        data: {
          businessId: a.businessId, clientId: a.clientId, serviceId: a.serviceId, staffId: a.staffId,
          date: old.date, endAt: a.endAt, duration: a.duration, price: 0, status: "cancelled",
          paymentStatus: "unpaid", paymentMode: a.paymentMode, source: a.source, patientName: a.patientName,
          notes: `Moved by the customer to ${date} (token #${assign.number})`,
          tokenSessionId: old.sessionId, sessionDate: old.sessionDate, tokenNumber: old.number, estimatedAt: a.estimatedAt,
          queueState: "MOVED",
        },
        select: { id: true },
      });
      await tx.appointment.update({ where: { id: a.id }, data: { carriedFromId: placeholder.id } });
      return { estimatedAt };
    });
  } catch (err) {
    if (err instanceof StaleTokenError) {
      return err.message === "cutoff"
        ? fail(409, `That turn is too close to change to. Please pick a later day or contact ${a.business.name}.`, "CUTOFF")
        : fail(409, "This token was changed in the meantime. Please refresh and try again.", "STATUS");
    }
    throw err;
  }
  if (!result.ok) return fail(409, "That session is full. Please pick another session or day.", "SESSION_FULL");

  const { number, estimatedMin } = result.assignment;
  const estimatedAt = result.value.estimatedAt;
  const dateLabel = formatDateLabel(estimatedAt, tz);
  const estimatedTime = minToHhmm(estimatedMin);
  const oldLabel = `${formatDateLabel(old.date, tz)}, token #${old.number}`;

  sendPushToBusiness(a.businessId, {
    title: "Token moved by the customer",
    body: `${shortName(a.client.name)} · ${oldLabel} → ${dateLabel}, ${session.name}, token #${number}`,
    url: "/dashboard/queue", tag: "customer-token-move",
  }, { kind: "queue", staffId: a.staffId, subjectId: a.id, version: `${dateLabel}:${number}` }).catch(() => {});
  try {
    const n = noticeFrom({ ...a, date: estimatedAt, estimatedAt, tokenNumber: number, tokenSession: { name: session.name } });
    const move = { from: old.date, to: estimatedAt, oldDate: formatDateLabel(old.date, tz), oldTime: `token #${old.number}, about ${formatTimeLabel(a.estimatedAt ?? old.date, tz)}` };
    await notify(
      reschedule(n, move),
      await ownerAlert(n, "rescheduled", { version: `${old.date.getTime()}>${estimatedAt.getTime()}`, byCustomer: true, oldDate: move.oldDate, oldTime: move.oldTime }),
    );
  } catch (err) {
    logger.error("[CustomerToken] move notification failed", { err });
  }
  return { ok: true, dateLabel, token: number, estimatedTime };
}

