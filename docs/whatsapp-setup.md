# WhatsApp setup (official Meta Cloud API)

Each business connects its OWN WhatsApp Business Account; the business pays Meta directly. Calvy only sends approved **template** messages through the business's own credentials. Owner-only (Settings > WhatsApp); mid and higher plans (`whatsappReminders` flag, via `applyEnforcement`).

## What the owner does (also shown in-app at Settings > WhatsApp > setup guide)
1. Meta Business account (business.facebook.com), verified if Meta asks.
2. Developer app (developers.facebook.com, type Business).
3. Add the **WhatsApp** product to the app (creates a WABA and a test number).
4. Phone number: the test number to try it, or add your own (a number on the WhatsApp/WhatsApp Business app must be removed from it first).
5. System User (Business Settings > Users > System Users, Admin), assign the app + WABA, **Generate token** with `whatsapp_business_messaging` and `whatsapp_business_management`. Never the 24-hour API Setup token.
6. Copy four values into Calvy: **Phone number ID**, **WABA ID**, **permanent token**, **App secret** (App settings > Basic). Press *Save and verify*: Calvy calls Meta and shows number, display name, quality rating and messaging limit, status CONNECTED or ERROR with the reason.
7. Webhook (App > WhatsApp > Configuration): paste the **callback URL** and **verify token** from Calvy, verify, subscribe to `messages` and `message_template_status_update`.
8. *Install Calvy templates*, refresh until APPROVED, then *Send test message*.

## How it works
- Credentials are AES-256-GCM encrypted (`lib/notifications/secret.ts`), never returned to the browser (masked to last 4), never logged.
- Webhook: `/api/whatsapp/webhook/[key]`, `key` is a random per-business value (not the business id). GET = Meta handshake with the verify token. POST **must** carry a valid `X-Hub-Signature-256` made with that business's app secret, else 401 and nothing is read. Handles message status (sent/delivered/read/failed -> `NotificationOutbox.deliveryStatus`), template approval changes, and inbound `STOP` / `UNSUBSCRIBE` (-> `WhatsAppOptOut`, per business, E.164).
- On Vercel previews the callback URL carries `?x-vercel-protection-bypass=` (same pattern as the Cashfree webhook, `docs/payments-sandbox-test.md`).
- Templates: category UTILITY, languages `en` and `hi`, names `calvy_<event>_v1`, variables only (first name, business, date/time, service, token, ETA) plus a URL button with a dynamic suffix. No email or phone number appears in any text. Definitions: `lib/whatsapp/templates.ts`.
- Health check: the existing notifications cron re-verifies each connected config about once a day. A revoked token (HTTP 401 / error 190) or quality RED sets status ERROR, WhatsApp sends pause (email fallback), and the owner gets one email to reconnect. A Meta outage (5xx) also shows ERROR but does not email.
- Graph API version: one constant, `GRAPH_VERSION` in `lib/whatsapp/graph.ts` (v26.0, released 29 Jul 2026).

## Preview / test number
Meta's test number can message only recipients added to the allowed list (WhatsApp > API Setup > To). Use the same list for the live test.
