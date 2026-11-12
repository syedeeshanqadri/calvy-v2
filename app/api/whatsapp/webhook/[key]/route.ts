import { safeRoute } from "@/lib/api";
import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/ratelimit";
import { decryptSecret } from "@/lib/notifications/secret";
import { verifyMetaSignature } from "@/lib/whatsapp/signature";
import { handleWebhook, type WebhookPayload } from "@/lib/whatsapp/webhook";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ key: string }> };

const same = (a: string, b: string) => {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

/** Meta's one-time handshake when the owner saves the callback URL: echo hub.challenge if the verify token matches. */
async function GET_handler(req: NextRequest, { params }: Ctx) {
  const { key } = await params;
  const q = req.nextUrl.searchParams;
  const cfg = await prisma.whatsAppConfig.findUnique({ where: { webhookKey: key }, select: { verifyTokenEnc: true } });
  if (!cfg || q.get("hub.mode") !== "subscribe" || !same(q.get("hub.verify_token") ?? "", decryptSecret(cfg.verifyTokenEnc))) {
    return new NextResponse("Forbidden", { status: 403 });
  }
  return new NextResponse(q.get("hub.challenge") ?? "", { status: 200, headers: { "Content-Type": "text/plain" } });
}

/** Deliveries. The signature check against this business's own app secret is mandatory: unsigned or wrong = 401, nothing read. */
async function POST_handler(req: NextRequest, { params }: Ctx) {
  const { key } = await params;
  const rl = await rateLimit(`wa-webhook:${key}`, 600, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  const cfg = await prisma.whatsAppConfig.findUnique({ where: { webhookKey: key }, select: { businessId: true, phoneNumberId: true, appSecretEnc: true } });
  const raw = await req.text();
  if (!cfg || !verifyMetaSignature(raw, req.headers.get("x-hub-signature-256"), decryptSecret(cfg.appSecretEnc))) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }
  let payload: WebhookPayload;
  try { payload = JSON.parse(raw) as WebhookPayload; } catch { return NextResponse.json({ error: "Bad JSON" }, { status: 400 }); }
  await handleWebhook(cfg.businessId, cfg.phoneNumberId, payload);
  return NextResponse.json({ received: true });
}

export const GET = safeRoute(GET_handler);
export const POST = safeRoute(POST_handler);
