import { safeRoute } from "@/lib/api";
import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { rateLimit } from "@/lib/ratelimit";
import { metaEnv } from "@/lib/whatsapp/embedded";
import { verifyMetaSignature } from "@/lib/whatsapp/signature";
import { handleCalvyWebhook } from "@/lib/whatsapp/calvyWebhook";
import type { WebhookPayload } from "@/lib/whatsapp/webhook";

export const dynamic = "force-dynamic";

const same = (a: string, b: string) => {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

/** Meta's handshake when the callback URL is saved on the Calvy app: echo hub.challenge if the verify token matches. */
async function GET_handler(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const token = metaEnv()?.verifyToken ?? process.env.META_WEBHOOK_VERIFY_TOKEN?.trim() ?? "";
  if (!token || q.get("hub.mode") !== "subscribe" || !same(q.get("hub.verify_token") ?? "", token)) return new NextResponse("Forbidden", { status: 403 });
  return new NextResponse(q.get("hub.challenge") ?? "", { status: 200, headers: { "Content-Type": "text/plain" } });
}

/** Deliveries for every connected business. Signature over the RAW body with Calvy's app secret; wrong or missing = 401, nothing read. */
async function POST_handler(req: NextRequest) {
  const rl = await rateLimit("wa-calvy-webhook", 6000, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const secret = process.env.META_APP_SECRET?.trim();
  const raw = await req.text(); // raw text, never re-serialised JSON: the HMAC is over these exact bytes
  if (!secret || !verifyMetaSignature(raw, req.headers.get("x-hub-signature-256"), secret)) return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  let payload: WebhookPayload;
  try { payload = JSON.parse(raw) as WebhookPayload; } catch { return NextResponse.json({ error: "Bad JSON" }, { status: 400 }); }
  await handleCalvyWebhook(payload);
  return NextResponse.json({ received: true });
}

export const GET = safeRoute(GET_handler);
export const POST = safeRoute(POST_handler);
