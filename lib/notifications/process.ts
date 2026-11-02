import type { NotificationOutbox } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { loadBrand } from "@/lib/notifications/brand";
import { CHANNELS, type Channel, type SendOutcome } from "@/lib/notifications/channels";
import { MAX_ATTEMPTS, nextAttemptAt } from "@/lib/notifications/policy";
import { OPTIONAL_EVENTS, skipReasons, unsubscribeLinks } from "@/lib/notifications/prefs";
import { decryptSecret } from "@/lib/notifications/secret";
import { renderTemplate } from "@/lib/notifications/templates";

const LOCK_MS = 5 * 60_000;
const BATCH = 5;
const MAX_PER_RUN = 25;
/** cron-job.org hangs up at 30s; no new batch starts after this, so a run ends inside that. */
const BUDGET_MS = 20_000;
/** Spacing between sends to stay near Resend's rate limit; a 429 is retried anyway. */
const PACE_MS = 550;
const PURGE_AFTER_MS = 90 * 24 * 3_600_000;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const short = (error: string) => error.slice(0, 500);

/** Claim due rows; SKIP LOCKED lets overlapping runs take different rows. A crashed run's rows come back when their lock lapses. */
async function claimDue(limit: number, now: Date): Promise<NotificationOutbox[]> {
  return prisma.$queryRaw<NotificationOutbox[]>`
    UPDATE "NotificationOutbox"
    SET "status" = 'SENDING', "attempts" = "attempts" + 1, "lockedUntil" = ${new Date(now.getTime() + LOCK_MS)}
    WHERE "id" IN (
      SELECT "id" FROM "NotificationOutbox"
      WHERE ("status" = 'PENDING' AND "nextAttemptAt" <= ${now})
         OR ("status" = 'SENDING' AND "lockedUntil" < ${now} AND "attempts" < ${MAX_ATTEMPTS})
      ORDER BY "nextAttemptAt"
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING *`;
}

/** Rows that crashed on their last allowed attempt will never be claimed again: close them. */
async function failAbandoned(now: Date): Promise<number> {
  const { count } = await prisma.notificationOutbox.updateMany({
    where: { status: "SENDING", lockedUntil: { lt: now }, attempts: { gte: MAX_ATTEMPTS } },
    data: { status: "FAILED", error: "abandoned mid-send", lockedUntil: null, secret: null },
  });
  return count;
}

async function purgeOldPayloads(now: Date): Promise<number> {
  const { count } = await prisma.notificationOutbox.updateMany({
    where: { status: { in: ["SENT", "FAILED", "SKIPPED"] }, createdAt: { lt: new Date(now.getTime() - PURGE_AFTER_MS) }, payload: { not: {} } },
    data: { payload: {} },
  });
  return count;
}

/** Render and hand to the channel. Anything thrown (a bad secret, a render error) is retried, then fails for good. */
async function attemptSend(row: NotificationOutbox, channels: Record<string, Channel>, now: Date): Promise<SendOutcome> {
  if (row.expiresAt && row.expiresAt <= now) return { kind: "skipped", error: "expired" };
  try {
    // Checked again here: the recipient may have unsubscribed, or the business switched it off, since it was queued.
    const skip = (await skipReasons(prisma, [{ businessId: row.businessId, event: row.event, recipient: row.recipient }])).get(0);
    if (skip) return { kind: "skipped", error: skip };
    const payload = row.secret ? { ...(row.payload as object), secret: decryptSecret(row.secret) } : row.payload;
    const brand = row.businessId ? await loadBrand(row.businessId) : undefined;
    const links = row.businessId && OPTIONAL_EVENTS.has(row.event) ? unsubscribeLinks(row.businessId, row.recipient) : undefined;
    const message = await renderTemplate(row.template, payload, brand, links);
    return await channels[row.channel](message, row.recipient, row.id);
  } catch (err) {
    return { kind: "retry", error: err instanceof Error ? err.message : "send error" };
  }
}

/** Write the result of one attempt. Keyed on `attempts`, so a run whose lock lapsed cannot overwrite a newer one. */
async function settle(row: NotificationOutbox, outcome: SendOutcome, now: Date): Promise<"sent" | "retried" | "failed" | "skipped"> {
  const where = { id: row.id, status: "SENDING" as const, attempts: row.attempts };
  if (outcome.kind === "sent") {
    await prisma.notificationOutbox.updateMany({ where, data: { status: "SENT", sentAt: now, providerId: outcome.providerId ?? null, error: null, lockedUntil: null, secret: null } });
    return "sent";
  }
  const error = short(outcome.error);
  if (outcome.kind === "skipped") {
    await prisma.notificationOutbox.updateMany({ where, data: { status: "SKIPPED", error, lockedUntil: null, secret: null } });
    return "skipped";
  }
  const next = outcome.kind === "retry" ? nextAttemptAt(row.attempts, now) : null;
  if (next) {
    await prisma.notificationOutbox.updateMany({ where, data: { status: "PENDING", nextAttemptAt: next, error, lockedUntil: null } });
    return "retried";
  }
  await prisma.notificationOutbox.updateMany({ where, data: { status: "FAILED", error, lockedUntil: null, secret: null } });
  logger.error("notification failed for good", { id: row.id, event: row.event, error });
  return "failed";
}

/** The immediate attempt after enqueue. Never throws; whatever is left is for the scheduler. */
export async function attemptNow(ids: string[], channels: Record<string, Channel> = CHANNELS): Promise<void> {
  for (const id of ids) {
    try {
      const now = new Date();
      const { count } = await prisma.notificationOutbox.updateMany({
        where: { id, status: "PENDING", nextAttemptAt: { lte: now } },
        data: { status: "SENDING", attempts: { increment: 1 }, lockedUntil: new Date(now.getTime() + LOCK_MS) },
      });
      if (count !== 1) continue;
      const row = await prisma.notificationOutbox.findUnique({ where: { id } });
      if (row) await settle(row, await attemptSend(row, channels, now), now);
    } catch (err) {
      logger.error("notification immediate attempt failed", { id, err });
    }
  }
}

export interface RunResult { claimed: number; sent: number; retried: number; failed: number; skipped: number; reclaimedDead: number; purged: number }

/** One scheduler pass: close abandoned rows, send due rows in paced batches, clear old payloads. */
export async function runOutbox(channels: Record<string, Channel> = CHANNELS, pause: (ms: number) => Promise<void> = sleep): Promise<RunResult> {
  const started = Date.now();
  const result: RunResult = { claimed: 0, sent: 0, retried: 0, failed: 0, skipped: 0, reclaimedDead: await failAbandoned(new Date()), purged: 0 };

  while (result.claimed < MAX_PER_RUN && Date.now() - started < BUDGET_MS) {
    const rows = await claimDue(Math.min(BATCH, MAX_PER_RUN - result.claimed), new Date());
    if (!rows.length) break;
    result.claimed += rows.length;
    for (const row of rows) {
      const now = new Date();
      result[await settle(row, await attemptSend(row, channels, now), now)]++;
      await pause(PACE_MS);
    }
  }

  result.purged = await purgeOldPayloads(new Date());
  return result;
}
