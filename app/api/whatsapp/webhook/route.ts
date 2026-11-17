import { safeRoute } from "@/lib/api";
import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { rateLimit } from "@/lib/ratelimit";
import { metaEnv } from "@/lib/whatsapp/embedded";
import { verifyMetaSignature } from "@/lib/whatsapp/signature";
import { addressedConfigs, handleCalvyWebhook } from "@/lib/whatsapp/calvyWebhook";
import { tryDecrypt } from "@/lib/whatsapp/store";
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
  const sig = req.headers.get("x-hub-signature-256");
  let payload: WebhookPayload | null = null;
  try { payload = JSON.parse(raw) as WebhookPayload; } catch { /* decided below, after the signature */ }

  // 1. Calvy's own app secret: every business connected through (or running on) the Calvy app.
  if (secret && verifyMetaSignature(raw, sig, secret)) {
    if (!payload) return NextResponse.json({ error: "Bad JSON" }, { status: 400 });
    await handleCalvyWebhook(payload);
    return NextResponse.json({ received: true });
  }
  // 2. A manual number from another Meta app: signed with that business's OWN stored app secret. The body is read only to find
  // which businesses it is addressed to; it is acted on only for a business whose own secret verifies, and for no one else.
  if (payload) {
    const allowed = new Set<string>();
    for (const cfg of await addressedConfigs(payload)) {
      const own = cfg.source === "MANUAL" ? tryDecrypt(cfg.appSecretEnc) : null;
      if (own && verifyMetaSignature(raw, sig, own)) allowed.add(cfg.businessId);
    }
    if (allowed.size) {
      await handleCalvyWebhook(payload, undefined, (cfg) => allowed.has(cfg.businessId));
      return NextResponse.json({ received: true });
    }
  }
  return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
}

export const GET = safeRoute(GET_handler);
export const POST = safeRoute(POST_handler);
