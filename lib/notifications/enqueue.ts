import { after } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { attemptNow } from "@/lib/notifications/process";
import { idempotencyKey, normalizeRecipient, type NotifChannelName } from "@/lib/notifications/policy";
import { encryptSecret } from "@/lib/notifications/secret";

export interface NotificationInput {
  event: string;
  audience: "BUSINESS" | "CUSTOMER" | "PLATFORM";
  /** What the event is about (appointment id, business id...); with `version` it makes repeats idempotent. */
  subjectId: string;
  version?: string | number;
  channel?: NotifChannelName;
  recipient: string;
  template: string;
  payload: Prisma.InputJsonObject;
  /** A reset or verify link: stored encrypted, reaches the template as `payload.secret`, cleared once final. */
  secret?: string;
  businessId?: string;
  appointmentId?: string;
  /** Not before this time (a delayed review request, say). */
  notBefore?: Date;
  expiresAt?: Date;
}

/** Write the rows on `db` (a transaction, to commit with the change they announce). Repeats add nothing. Returns all their ids. */
export async function enqueue(db: Prisma.TransactionClient, items: NotificationInput[]): Promise<string[]> {
  const rows = items.map((n) => {
    const channel = n.channel ?? "EMAIL";
    return {
      idempotencyKey: idempotencyKey({ event: n.event, subjectId: n.subjectId, version: n.version, recipient: n.recipient, channel }),
      businessId: n.businessId ?? null,
      appointmentId: n.appointmentId ?? null,
      event: n.event,
      audience: n.audience,
      channel,
      recipient: normalizeRecipient(channel, n.recipient),
      template: n.template,
      payload: n.payload,
      secret: n.secret ? encryptSecret(n.secret) : null,
      expiresAt: n.expiresAt ?? null,
      ...(n.notBefore ? { nextAttemptAt: n.notBefore } : {}),
    };
  });
  if (!rows.length) return [];
  await db.notificationOutbox.createMany({ data: rows, skipDuplicates: true });
  const saved = await db.notificationOutbox.findMany({ where: { idempotencyKey: { in: rows.map((r) => r.idempotencyKey) } }, select: { id: true } });
  return saved.map((r) => r.id);
}

/** Try to send right after the response. Call only once the rows are committed. Outside a request, sends before returning. */
export async function sendSoon(ids: string[]): Promise<void> {
  if (!ids.length) return;
  try {
    after(() => attemptNow(ids));
  } catch {
    await attemptNow(ids);
  }
}

/** Enqueue and try at once, for callers with no open transaction. */
export async function notify(...items: NotificationInput[]): Promise<void> {
  await sendSoon(await enqueue(prisma, items));
}
