/**
 * Delivery log (chunk 6): the outbox read back for owners and admins, plus the one safe write (resend a failed row).
 * Never selects `payload` or `secret`; errors are redacted before they leave the server.
 */
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { MAX_ATTEMPTS } from "@/lib/notifications/policy";
import { attemptNow } from "@/lib/notifications/process";

export const LOG_PAGE_SIZE = 50;
export const RESEND_WINDOW_MS = 7 * 24 * 3_600_000;
const STATUSES = ["PENDING", "SENDING", "SENT", "FAILED", "SKIPPED"] as const;
const CHANNELS = ["EMAIL", "WHATSAPP"] as const;
const AUDIENCES = ["CUSTOMER", "BUSINESS", "PLATFORM"] as const;
const PERIODS = [1, 7, 30, 90] as const;

export type LogStatus = (typeof STATUSES)[number];
export interface LogFilters {
  status?: LogStatus;
  channel?: (typeof CHANNELS)[number];
  audience?: (typeof AUDIENCES)[number];
  days: (typeof PERIODS)[number];
  q?: string;
  page: number;
}

const pick = <T extends string | number>(list: readonly T[], v: unknown): T | undefined =>
  list.find((x) => String(x) === String(v ?? ""));

/** Query string → filters. Anything unknown is dropped, never an error: these come straight from the URL. */
export function parseLogFilters(sp: Record<string, string | string[] | undefined>): LogFilters {
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k]?.[0] : sp[k]) as string | undefined;
  const q = one("q")?.trim().slice(0, 100);
  const page = Math.min(1000, Math.max(1, Number.parseInt(one("page") ?? "1", 10) || 1));
  return {
    status: pick(STATUSES, one("status")),
    channel: pick(CHANNELS, one("channel")),
    audience: pick(AUDIENCES, one("audience")),
    days: pick(PERIODS, one("days")) ?? 7,
    q: q || undefined,
    page,
  };
}

export const since = (days: number, now: Date) => new Date(now.getTime() - days * 24 * 3_600_000);

/** Owner rows: always pinned to the session business. `q` matches recipient or event. */
export function ownerLogWhere(businessId: string, f: LogFilters, now: Date): Prisma.NotificationOutboxWhereInput {
  return {
    businessId,
    createdAt: { gte: since(f.days, now) },
    ...(f.status && { status: f.status }),
    ...(f.channel && { channel: f.channel }),
    ...(f.audience && { audience: f.audience }),
    ...(f.q && { OR: [{ recipient: { contains: f.q, mode: "insensitive" } }, { event: { contains: f.q, mode: "insensitive" } }] }),
  };
}

/**
 * Admin rows across businesses. `q` matches a business (ids resolved by the caller from name/slug), an event,
 * or an exact recipient: the admin list shows recipients masked, so partial matching would unmask them.
 */
export function adminLogWhere(f: LogFilters, now: Date, businessIds: string[] = []): Prisma.NotificationOutboxWhereInput {
  const q = f.q;
  return {
    createdAt: { gte: since(f.days, now) },
    ...(f.status && { status: f.status }),
    ...(f.channel && { channel: f.channel }),
    ...(f.audience && { audience: f.audience }),
    ...(q && {
      OR: [
        { id: q },
        { recipient: q.toLowerCase() },
        { recipient: q.replace(/\D/g, "") || q },
        { event: { contains: q, mode: "insensitive" } },
        ...(businessIds.length ? [{ businessId: { in: businessIds } }] : []),
      ],
    }),
  };
}

export function maskEmail(email: string): string {
  const at = email.lastIndexOf("@");
  if (at < 1) return "•••";
  const local = email.slice(0, at);
  const [host, ...rest] = email.slice(at + 1).split(".");
  const tld = rest.length ? `.${rest.join(".")}` : "";
  return `${local[0]}•••@${host ? `${host[0]}•••` : ""}${tld}`;
}

export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.length <= 4 ? "•••" : `•••${digits.slice(-4)}`;
}

export const maskRecipient = (channel: string, recipient: string) =>
  channel === "EMAIL" ? maskEmail(recipient) : maskPhone(recipient);

/** Errors are provider text; strip anything token-shaped before display and keep them short. */
export function redactError(error: string | null | undefined, max = 200): string | null {
  if (!error) return null;
  const clean = error
    .replace(/([?&](?:token|key|secret|sig|signature)=)[^&\s"']+/gi, "$1[hidden]")
    .replace(/\b(Bearer)\s+\S+/gi, "$1 [hidden]")
    .replace(/\b[A-Za-z0-9_-]{32,}\b/g, "[hidden]");
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

/** "alert.booking.created" → "Alert: booking created". */
export function eventLabel(event: string): string {
  const parts = event.split(".").map((p) => p.replace(/_/g, " "));
  const [head, ...rest] = parts;
  const title = head.charAt(0).toUpperCase() + head.slice(1);
  return rest.length ? `${title}: ${rest.join(" ")}` : title;
}

export interface ResendCandidate { status: string; event: string; createdAt: Date; expiresAt: Date | null }

/**
 * Why a row cannot be resent, or null when it can. Only FAILED rows, recent enough that the payload is intact and
 * the message still makes sense, never auth links (their link was erased when the row closed), never expired ones.
 * The send path re-checks unsubscribes, prefs and stale reminders, so those need no rule here.
 */
export function resendBlocker(row: ResendCandidate, now: Date): string | null {
  if (row.status !== "FAILED") return "only failed messages can be resent";
  if (row.event.startsWith("auth.")) return "sign-in links cannot be resent; ask for a new one";
  if (row.expiresAt && row.expiresAt <= now) return "expired";
  if (now.getTime() - row.createdAt.getTime() > RESEND_WINDOW_MS) return "older than 7 days";
  return null;
}

/** Failed share of finished deliveries (sent + failed), 0..1. Skipped messages are choices, not failures. */
export function failureRate(sent: number, failed: number): number {
  const done = sent + failed;
  return done ? failed / done : 0;
}

const LOG_SELECT = {
  id: true, businessId: true, event: true, audience: true, channel: true, recipient: true, status: true,
  attempts: true, error: true, createdAt: true, sentAt: true, expiresAt: true, deliveryStatus: true, deliveryError: true,
} satisfies Prisma.NotificationOutboxSelect;

export interface LogRow {
  id: string; businessId: string | null; event: string; eventLabel: string; audience: string; channel: string;
  recipient: string; status: string; attempts: number; error: string | null; createdAt: string; sentAt: string | null;
  resendable: boolean;
}

/**
 * What the log shows as the status. WhatsApp keeps counting after "sent": Meta reports delivered, read or failed
 * through the webhook, so a sent WhatsApp row shows that later state (and the failure reason).
 */
export function shownStatus(r: { channel: string; status: string; deliveryStatus: string | null; error: string | null; deliveryError: string | null }): { status: string; error: string | null } {
  if (r.channel === "WHATSAPP" && r.status === "SENT" && r.deliveryStatus) {
    return { status: r.deliveryStatus.toUpperCase(), error: r.deliveryStatus === "failed" ? r.deliveryError : null };
  }
  return { status: r.status, error: r.error };
}

export async function listLog(where: Prisma.NotificationOutboxWhereInput, page: number, opts: { mask: boolean; now: Date }) {
  const rows = await prisma.notificationOutbox.findMany({
    where, select: LOG_SELECT, orderBy: { createdAt: "desc" },
    skip: (page - 1) * LOG_PAGE_SIZE, take: LOG_PAGE_SIZE + 1,
  });
  return {
    hasMore: rows.length > LOG_PAGE_SIZE,
    rows: rows.slice(0, LOG_PAGE_SIZE).map((r): LogRow => ({
      id: r.id, businessId: r.businessId, event: r.event, eventLabel: eventLabel(r.event), audience: r.audience,
      channel: r.channel, recipient: opts.mask ? maskRecipient(r.channel, r.recipient) : r.recipient,
      status: shownStatus(r).status, attempts: r.attempts, error: redactError(shownStatus(r).error),
      createdAt: r.createdAt.toISOString(), sentAt: r.sentAt?.toISOString() ?? null,
      resendable: resendBlocker(r, opts.now) === null,
    })),
  };
}

export type ResendResult = { ok: true; status: string } | { ok: false; code: 404 | 409; error: string };

/**
 * Put one failed row back and try it once now. `businessId` scopes owners to their own rows; admins pass undefined.
 * attempts is set so this is the last allowed try: a manual resend never starts a new automatic retry series.
 */
export async function resendFailed(id: string, businessId: string | undefined, now = new Date()): Promise<ResendResult> {
  const scope = businessId === undefined ? {} : { businessId };
  const row = await prisma.notificationOutbox.findFirst({
    where: { id, ...scope }, select: { status: true, event: true, createdAt: true, expiresAt: true },
  });
  if (!row) return { ok: false, code: 404, error: "Not found" };
  const blocker = resendBlocker(row, now);
  if (blocker) return { ok: false, code: 409, error: blocker };
  const { count } = await prisma.notificationOutbox.updateMany({
    where: { id, status: "FAILED", ...scope },
    data: { status: "PENDING", attempts: MAX_ATTEMPTS - 1, nextAttemptAt: now, error: null, lockedUntil: null },
  });
  if (count !== 1) return { ok: false, code: 409, error: "already being resent" };
  await attemptNow([id]);
  const after = await prisma.notificationOutbox.findUnique({ where: { id }, select: { status: true } });
  return { ok: true, status: after?.status ?? "PENDING" };
}
