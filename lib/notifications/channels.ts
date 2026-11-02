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
      { from: process.env.EMAIL_FROM ?? "Calvy <onboarding@resend.dev>", to, subject: message.subject, html: message.html, text: message.text, attachments: message.attachments },
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

export const CHANNELS: Record<"EMAIL" | "WHATSAPP", Channel> = {
  EMAIL: sendEmail,
  WHATSAPP: async () => ({ kind: "skipped", error: "whatsapp channel not available yet" }),
};
