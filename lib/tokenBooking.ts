import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { findOrCreateClient } from "@/lib/clients";
import { DEFAULT_CURRENCY } from "@/lib/currency";
import { isFeatureEnabled } from "@/lib/flags";
import { PENDING_PAYMENT, holdExpiry } from "@/lib/holds";
import { BOOKING_TX_OPTIONS } from "@/lib/booking";
import { trackingUrl } from "@/lib/tracking";
import { assertNoDuplicatePatient, assertWithinPeopleCap, contactAtDailyCap } from "@/lib/patientsDb";
import { chargeFor, sendConfirmationFor, startCheckout, type PayConfig } from "@/lib/onlinePayment";
import { assertMonthlyHeadroom } from "@/lib/limits";
import { loadMeetingUrl } from "@/lib/onlineDb";
import { addDays, formatDateLabel, parseYMD, utcToZoned, weekdayOf, zonedToUtc } from "@/lib/time";
import {
  findNextOpen, issueToken, minToHhmm, sessionCapacity, tokensLeft, type SessionLike, type TokenStore,
} from "@/lib/tokens";

type Db = typeof prisma | Prisma.TransactionClient;
type SessionRow = SessionLike & { id: string };

const SEARCH_DAYS = 30;
const dateOnly = (dateStr: string) => new Date(`${dateStr}T00:00:00Z`);

/** Highest token number issued per `${sessionId}|${date}` over [fromDate, +days). Cancelled tokens count: numbers are never reused. */
async function lastNumbers(db: Db, sessionIds: string[], fromDate: string, days: number): Promise<Record<string, number>> {
  if (!sessionIds.length) return {};
  const rows = await db.appointment.groupBy({
    by: ["tokenSessionId", "sessionDate"],
    where: { tokenSessionId: { in: sessionIds }, sessionDate: { gte: dateOnly(fromDate), lt: dateOnly(addDays(fromDate, days)) } },
    _max: { tokenNumber: true },
  });
  const out: Record<string, number> = {};
  for (const r of rows) {
    if (r.tokenSessionId && r.sessionDate) out[`${r.tokenSessionId}|${r.sessionDate.toISOString().slice(0, 10)}`] = r._max.tokenNumber ?? 0;
  }
  return out;
}

export interface TokenDayOption {
  id: string; name: string; staffId: string | null; staffName: string | null;
  startTime: string; endTime: string; minutesPerToken: number; capacity: number; left: number;
}

export type TokenDayResult =
  | { ok: true; sessions: TokenDayOption[]; nextAvailable: { date: string; sessionName: string } | null }
  | { ok: false; error: string };

interface BusinessCtx { id: string; timezone: string; maxAdvanceDays: number }

/** Why a date cannot be booked at all (past, too far ahead), or null. */
function dateProblem(biz: BusinessCtx, dateStr: string, now = new Date()): string | null {
  // Only real calendar days: "2026-02-30" would store as another day than the one the lock key names.
  if (!parseYMD(dateStr)) return "Invalid date.";
  const today = utcToZoned(now, biz.timezone).date;
  if (dateStr < today) return "That date has already passed. Please pick a future date.";
  if (biz.maxAdvanceDays > 0 && dateStr > addDays(today, biz.maxAdvanceDays)) return "That date is too far ahead to book.";
  return null;
}

/** Sessions a customer can take on `dateStr` for these services, with tokens left. */
export async function loadTokenDay(biz: BusinessCtx, dateStr: string, serviceIds: string[], now = new Date()): Promise<TokenDayResult> {
  const problem = dateProblem(biz, dateStr, now);
  if (problem) return { ok: false, error: problem };

  const [sessions, staff, links] = await Promise.all([
    prisma.tokenSession.findMany({ where: { businessId: biz.id, isActive: true }, orderBy: { startMin: "asc" } }),
    prisma.staff.findMany({ where: { businessId: biz.id, isActive: true }, select: { id: true, name: true } }),
    serviceIds.length
      ? prisma.staffService.findMany({ where: { serviceId: { in: serviceIds }, staff: { businessId: biz.id } }, select: { staffId: true, serviceId: true } })
      : Promise.resolve([]),
  ]);
  const staffName = new Map(staff.map((s) => [s.id, s.name]));
  // A doctor's queue is offered only if they provide every selected service.
  const provides = (staffId: string) => serviceIds.every((sid) => links.some((l) => l.staffId === staffId && l.serviceId === sid));
  const usable = sessions.filter((s) => (s.staffId ? staffName.has(s.staffId) && provides(s.staffId) : true));

  const today = utcToZoned(now, biz.timezone);
  const nowMin = dateStr === today.date ? today.minutes : null;
  const last = await lastNumbers(prisma, usable.map((s) => s.id), dateStr, SEARCH_DAYS);
  const weekday = weekdayOf(dateStr);

  const options = usable
    .filter((s) => s.weekdays.includes(weekday) && (nowMin === null || s.endMin > nowMin))
    .map((s) => ({
      id: s.id, name: s.name, staffId: s.staffId, staffName: s.staffId ? staffName.get(s.staffId) ?? null : null,
      startTime: minToHhmm(s.startMin), endTime: minToHhmm(s.endMin), minutesPerToken: s.minutesPerToken,
      capacity: sessionCapacity(s), left: tokensLeft(s, last[`${s.id}|${dateStr}`] ?? 0),
    }));

  // When nothing is bookable that day, point to the next day with room (any queue).
  let nextAvailable: { date: string; sessionName: string } | null = null;
  if (!options.some((o) => o.left > 0)) {
    for (const q of new Set(usable.map((s) => s.staffId))) {
      const hit = findNextOpen({
        sessions: usable as SessionRow[], queueStaffId: q, startDate: dateStr, days: SEARCH_DAYS, lastNumbers: last, nowMin,
      });
      if (hit && (!nextAvailable || hit.date < nextAvailable.date)) nextAvailable = { date: hit.date, sessionName: hit.session.name };
    }
  }
  return { ok: true, sessions: options, nextAvailable };
}

/** TokenStore over Prisma: one transaction per booking, serialised by an advisory lock on the key. */
function prismaStore(sessionId: string, dateStr: string): TokenStore<Prisma.TransactionClient> {
  return {
    run: (key, fn) =>
      prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
        return fn(tx);
      }, BOOKING_TX_OPTIONS),
    async lastNumber(tx) {
      const r = await tx.appointment.aggregate({
        where: { tokenSessionId: sessionId, sessionDate: dateOnly(dateStr) },
        _max: { tokenNumber: true },
      });
      return r._max.tokenNumber ?? 0;
    },
  };
}

const err = (status: number, error: string, code?: string) => NextResponse.json({ error, ...(code ? { code } : {}) }, { status });

export interface TokenBookingInput {
  business: {
    id: string; name: string; slug: string; phone: string | null; paymentMode: string; timezone: string; maxAdvanceDays: number; currency: string | null;
    packId: string; termsOverride: unknown;
  };
  services: { id: string; name: string; price: number }[];
  tokenSessionId: string;
  date: string;
  client: { name: string; email: string; phone?: string | null };
  notes?: string | null;
  maxMonthlyAppointments: number;
  monthStart: Date;
  tz: string;
  /** Online payment settings (null = confirm without paying). */
  payConfig: PayConfig | null;
  /** Who the token is for (the booker unless they booked for someone else). */
  patientName: string;
  /** Relation, age and gender of someone else (already limited to what the business collects). */
  patientDetails: { patientRelation: string | null; patientAge: number | null; patientGender: string | null };
  /** An online consultation: the staff member's / service's meeting link applies. */
  isOnline?: boolean;
  /** Fair use: most different people one booker contact may take tokens for per session. */
  maxPeoplePerBooker: number;
  /** Set when this token is the free follow-up of an earlier appointment: it costs nothing. */
  followUpOfId?: string | null;
}

/** Book the next token in a session: confirm at once, or hold it while the customer pays online. */
export async function bookToken(input: TokenBookingInput): Promise<NextResponse> {
  const { business, services, tokenSessionId, date, tz } = input;

  const problem = dateProblem(business, date);
  if (problem) return err(400, problem);

  // Without Cashfree online payments (flag off), never confirm an unpaid token where slot booking
  // would send the customer to the legacy Razorpay checkout: refuse (fail closed).
  if (!isFeatureEnabled("onlinePayments") && business.paymentMode === "prepaid" && process.env.RAZORPAY_KEY_ID) {
    return err(409, `Online token booking isn't available yet. Please contact ${business.name}${business.phone ? ` on ${business.phone}` : ""}.`, "PAYMENT_REQUIRED");
  }

  const session = await prisma.tokenSession.findFirst({ where: { id: tokenSessionId, businessId: business.id, isActive: true } });
  if (!session || !session.weekdays.includes(weekdayOf(date))) return err(400, "That session is not available on this date.");

  const today = utcToZoned(new Date(), tz);
  if (date === today.date && session.endMin <= today.minutes) return err(400, "That session has already ended today.");

  let staffName: string | null = null;
  if (session.staffId) {
    const staff = await prisma.staff.findFirst({
      where: { id: session.staffId, businessId: business.id, isActive: true },
      select: { name: true, services: { select: { serviceId: true } } },
    });
    if (!staff || !services.every((s) => staff.services.some((l) => l.serviceId === s.id))) {
      return err(400, "That session is not available for the selected service.");
    }
    staffName = staff.name;
  }

  const totalPrice = input.followUpOfId ? 0 : services.reduce((sum, s) => sum + s.price, 0);
  const notes = [services.length > 1 ? `__services__:${services.slice(1).map((s) => s.name).join("|")}` : "", input.notes ?? ""]
    .filter(Boolean).join("\n") || null;

  const charge = chargeFor(input.payConfig, totalPrice);
  if (charge.chargeMinor > 0 && !input.client.phone) return err(400, "A phone number is needed to pay online.");
  const holdExpiresAt = charge.chargeMinor > 0 ? holdExpiry() : null;

  const client = await findOrCreateClient(prisma, business.id, input.client, tz);

  // Over the contact's daily quota: still booked, but no email or WhatsApp goes to the contact.
  let suppressContactMessages = false;
  const result = await issueToken(prismaStore(session.id, date), session, date, async (tx, a) => {
    await assertMonthlyHeadroom(tx, business.id, input.maxMonthlyAppointments, input.monthStart);
    // Under the session lock, so a double-click cannot take two tokens for the same person.
    // The same person may hold tokens in different sessions of a day, so both rules look at this session only.
    await assertNoDuplicatePatient(tx, { businessId: business.id, clientId: client.id, patientName: input.patientName, date, tz, tokenSessionId: session.id });
    await assertWithinPeopleCap(tx, { businessId: business.id, clientId: client.id, patientName: input.patientName, bookerName: input.client.name, date, tz, tokenSessionId: session.id, max: input.maxPeoplePerBooker });
    suppressContactMessages = await contactAtDailyCap(tx, { businessId: business.id, clientId: client.id });
    const estimatedAt = zonedToUtc(date, a.estimatedMin, tz);
    return tx.appointment.create({
      data: {
        businessId: business.id, clientId: client.id, staffId: session.staffId, serviceId: services[0].id,
        date: estimatedAt, endAt: new Date(estimatedAt.getTime() + session.minutesPerToken * 60_000),
        duration: session.minutesPerToken, price: totalPrice, followUpOfId: input.followUpOfId ?? null, notes, patientName: input.patientName, ...input.patientDetails, isOnline: input.isOnline ?? false,
        status: holdExpiresAt ? PENDING_PAYMENT : "confirmed", holdExpiresAt,
        paymentStatus: "unpaid", paymentMode: business.paymentMode,
        tokenSessionId: session.id, sessionDate: dateOnly(date), tokenNumber: a.number, estimatedAt,
      },
    });
  });

  if (!result.ok) {
    const all = await prisma.tokenSession.findMany({ where: { businessId: business.id, isActive: true } });
    const hit = findNextOpen({
      sessions: all, queueStaffId: session.staffId, startDate: date, days: SEARCH_DAYS,
      lastNumbers: await lastNumbers(prisma, all.map((s) => s.id), date, SEARCH_DAYS),
      nowMin: date === today.date ? today.minutes : null, skipId: session.id,
    });
    const label = hit ? `${formatDateLabel(zonedToUtc(hit.date, 12 * 60, tz), tz)}, ${hit.session.name}` : null;
    return err(409, label ? `Session full — next available: ${label}` : "Session full. No other sessions are open in the next 30 days.", "SESSION_FULL");
  }

  const { number, estimatedMin } = result.assignment;
  const appointment = result.value;
  const estimatedTime = minToHhmm(estimatedMin);
  const dateLabel = formatDateLabel(appointment.date, tz);
  const token = { number, estimatedTime, sessionName: session.name, date, dateLabel, staffName, trackUrl: trackingUrl(business.slug, appointment.id) };

  if (charge.chargeMinor > 0) {
    // Token number is taken now; if the payment never completes the hold lapses and the number is not reused.
    const started = await startCheckout({
      appointmentId: appointment.id, businessId: business.id, businessName: business.name,
      currency: business.currency ?? DEFAULT_CURRENCY, charge, holdExpiresAt: holdExpiresAt!,
      client: { id: client.id, name: input.client.name, email: input.client.email, phone: input.client.phone! },
      note: `Token #${number} ${session.name} ${date}`,
    });
    if (!started.ok) return err(502, started.error, "PAYMENT_START_FAILED");
    return NextResponse.json({ success: true, appointmentId: appointment.id, pendingPayment: true, checkout: started.checkout, token, isOnline: input.isOnline ?? false });
  }

  await prisma.client.update({
    where: { id: client.id },
    data: { totalAppointments: { increment: 1 }, lastVisit: appointment.date },
  });
  await sendConfirmationFor(appointment.id, { contactMessages: !suppressContactMessages });

  return NextResponse.json({ success: true, appointmentId: appointment.id, paymentMode: business.paymentMode, token, confirmationWithheld: suppressContactMessages, isOnline: input.isOnline ?? false, meetingUrl: input.isOnline ? await loadMeetingUrl(appointment.id) : null });
}
