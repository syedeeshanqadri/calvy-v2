import { Resend } from "resend";
import { isRetryableStatus } from "@/lib/notifications/policy";
import type { Rendered } from "@/lib/notifications/templates";

export type SendOutcome =
  | { kind: "sent"; providerId?: string }
  | { kind: "retry" | "permanent" | "skipped"; error: string };

/** A delivery channel. `idempotencyKey` is stable across retries, so a crash after sending cannot double-send. */
export type Channel = (message: Rendered, to: string, idempotencyKey: string) => Promise<SendOutcome>;

let resendClient: Resend | null = null;
function getResend() {
  if (!resendClient) resendClient = new Resend(process.env.RESEND_API_KEY);
  return resendClient;
}

const sendEmail: Channel = async (message, to, idempotencyKey) => {
  if (!process.env.RESEND_API_KEY || process.env.RESEND_API_KEY === "re_REPLACE_ME") {
    return { kind: "skipped", error: "email not configured" };
  }
  try {
    const result = await getResend().emails.send(
      { from: process.env.EMAIL_FROM ?? "Calvy <onboarding@resend.dev>", to, subject: message.subject, html: message.html, text: message.text, attachments: message.attachments, headers: message.headers },
      { idempotencyKey },
    );
    if (result.error) {
      return { kind: isRetryableStatus(result.error.statusCode) ? "retry" : "permanent", error: result.error.message ?? "provider error" };
    }
    return { kind: "sent", providerId: result.data?.id };
  } catch (err) {
    return { kind: "retry", error: err instanceof Error ? err.message : "send error" };
  }
};

/** Phone alerts: the recipient is a PushDevice id. A subscription the browser dropped (404/410) deletes the device. */
const sendPush: Channel = async (message, deviceId) => {
  const { prisma } = await import("@/lib/prisma");
  const { deliverPush } = await import("@/lib/push");
  const device = await prisma.pushDevice.findUnique({ where: { id: deviceId } });
  if (!device) return { kind: "skipped", error: "device removed" };
  const out = await deliverPush(device, { title: message.subject, body: message.text, url: message.push?.url, tag: message.push?.tag });
  if (out.kind === "sent") return { kind: "sent" };
  if (out.kind === "expired") {
    await prisma.pushDevice.deleteMany({ where: { id: device.id } });
    return { kind: "skipped", error: "subscription expired: device removed" };
  }
  return out;
};

/** A channel with no provider behind it yet: its rows are kept as SKIPPED so the log says why nothing went. */
const notSetUp: Channel = async () => ({ kind: "skipped", error: "channel not set up" });

/**
 * WHATSAPP rows are sent by lib/whatsapp/send.ts (it needs the whole row: consent, template, permissions), which
 * process.ts calls directly while this entry is the default. Tests may replace it with a fake channel.
 */
export const CHANNELS: Record<"EMAIL" | "WHATSAPP" | "PUSH", Channel> = {
  EMAIL: sendEmail,
  WHATSAPP: notSetUp,
  PUSH: sendPush,
};
