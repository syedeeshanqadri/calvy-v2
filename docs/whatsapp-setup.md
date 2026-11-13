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

## Alerts (PR B)
**Customers.** The booking form and chat widget show an unticked "Get updates on WhatsApp" box, only when the business is CONNECTED and its plan allows it. Consent, timestamp and source (`booking_form` | `chat_widget`) are stored on the client, and only when the number typed is the number saved on that client (nobody can opt in someone else's number). STOP, or the "Stop WhatsApp updates" link in booking emails, ends it; a STOP opt-out is sticky.

**Email is never replaced.** Every customer email is still sent. When the client consented, `enqueue()` also queues a WhatsApp row (`lib/whatsapp/derive.ts`). At send time (`lib/whatsapp/send.ts`) every gate must pass: consent, not opted out, config CONNECTED, plan, the per-event switch, template APPROVED. Any failure is a SKIPPED row with the reason, so the customer simply gets the email. Meta 5xx/429 retry like email; a rejected token pauses WhatsApp for the business.

| Email event | WhatsApp template (calvy_*_v1 unless noted) | Switch (Settings > Notifications) |
|---|---|---|
| booking.created | booking_confirmed (v2) / token_issued (v2) for token bookings | Confirmations |
| booking.meeting_link | booking_meeting_link | Confirmations |
| booking.rescheduled | booking_rescheduled (v2) | Changes |
| booking.cancelled | booking_cancelled (v2) | Changes |
| booking.no_show | booking_no_show | Changes |
| booking.reminder | booking_reminder (v2) | Reminders |
| booking.queue_moved_back | token_moved_back (v2) | Token |
| booking.queue_closed | token_closed | Token |
| booking.paid | payment_received | Receipts |
| booking.completed | visit_thanks, or visit_thanks_follow_up when the visit earns a free follow-up (one message) | Thank-you (+ "Free follow-up deadline" switch) |
| booking.queue_next (new: "your turn is coming up") | token_next | Token: your turn is coming up (ON) |
| push alerts to owner/members | staff_alert | the person's own alert choices |

`booking_confirmed`, `booking_reminder` and `booking_rescheduled` are `_v2`: v1 had a "View booking" button that only token bookings have a page for. After upgrading, press **Install Calvy templates** again: it only creates what is missing.

**Owner and team.** Alerts > WhatsApp alerts (any signed-in person): enter your number, a test message (the approved `staff_alert` template, text "WhatsApp connection test for <business>") is sent to it, then switch alerts on. Rules are exactly the phone-alert rules (`lib/pushRouting.ts`): permissions decide what you MAY get (own-only members only their own bookings), your alert choices decide what you WANT; both are re-checked when the message is sent.

**Delivery log.** WhatsApp rows show Queued, Sent, Delivered, Read or Failed (with Meta's reason) from the webhook.

**Turn coming up (token queue).** After each reception action (Next, Not present, Not coming), a waiting token with N or fewer open tokens ahead of it (N = Settings > Notifications, 1 to 5, default 3; the token being served counts) gets one short email and, if they opted in, `token_next` on WhatsApp. Once per booking per move-back epoch (epoch = times moved back): a token moved back while still within N does not get a second message; one moved back beyond N and reaching N again gets one more; never more than two per booking. Skipped at send if the token is no longer waiting.

**Follow-up deadline.** When a clinic visit is marked completed and follow-ups are on (and the visit has a doctor, is not itself a follow-up, and none was used), the thank-you email and the WhatsApp `visit_thanks_follow_up` template carry the free follow-up deadline. It is never a separate message. Turn the "Free follow-up deadline" switch off to send the plain thank-you on WhatsApp.

**Visit completed (one event).** Marking an appointment completed and serving a token at reception (Next completes the previous token) both queue the same notices through `lib/notifications/completion.ts`: the thank-you (email and `visit_thanks` / `visit_thanks_follow_up` on WhatsApp, with the follow-up deadline under the same rules), the review request and the owner alert. Their keys are booking-based, so a visit completed in both places is still one message.

**WhatsApp without email.** A client with a phone number and WhatsApp consent but no email gets the thank-you, "your turn is near", moved-back and closed notices on WhatsApp only; the email row is recorded as skipped ("no email address"). Same STOP, opt-out and consent checks. The walk-in form has "Send WhatsApp updates (customer agreed verbally)" (unticked, shown only when WhatsApp is connected): consent source `DESK`, stored with the staff user id (`Client.whatsappConsentBy`) and the time. Needs `npm run db:migrate` (migration `20261114120000_whatsapp_desk_consent`).

**Template versions and Meta's verdicts.** A template Meta rejected is never edited under the same name: change its wording and bump `version` in `lib/whatsapp/templates.ts` (the name becomes `calvy_<key>_v2`, then `_v3`); en and hi move together, and Settings lists only the current names. History: `booking_confirmed`/`booking_reminder`/`booking_rescheduled` v2 (no tracking button); `token_issued`, `token_moved_back` and `booking_cancelled` v2 (Meta: INCORRECT_CATEGORY for the two token ones, "too many variables for its length" for cancelled; rewritten as plain confirmations with more fixed text, button text "Check token status"). If `token_*_v2` is recategorised again, remove the button and tracking link from all three token templates (`token_issued`, `token_moved_back`, `token_next`) in one v3.

**"Too many variables" watch list.** `tests/whatsapp.test.ts` computes fixed words per variable (weaker of en/hi, minimum 4). The templates in its `WATCH` set are only flagged (printed, never failing) while Meta reviews them: the six 4-variable ones (`booking_confirmed`, `booking_reminder`, `booking_rescheduled`, `payment_received`, `visit_thanks`, `booking_no_show`) plus `visit_thanks_follow_up`, `booking_meeting_link`, `staff_alert`, `staff_new_booking`. Any new or changed template (including a watched one after a version bump) must pass.

**Install Calvy templates.** Safe to press again: it creates what is missing and retries anything marked NOT_INSTALLED (could not be created; Meta never judged it). REJECTED means Meta's own verdict. If Meta answers 401 / error 190 (expired or revoked token), Install stops at the first call, marks the connection ERROR and writes nothing: save a new token, Save and verify, install again.

## Marketing reclassification (v2 rewrite)

Meta reclassified `connection_test`, `visit_thanks`, `visit_thanks_follow_up`, `booking_no_show` (en + hi), `review_request` (en) and `staff_alert` (hi) as MARKETING.

- **Review requests are email only.** `review_request` and its WhatsApp switch are gone.
- **Rewritten as plain transactional v2s** (en + hi): `visit_thanks`, `visit_thanks_follow_up` (adds the follow-up deadline; v3 fills "follow-up with {{4}}" with the visit's doctor/staff name, the business name only when the booking had no staff), `booking_no_show`, `connection_test`. No thank-you, no "we miss you", no invitation to return.
- **`staff_alert` is English only.** Add `languages: ["en"]` to any template whose Hindi version gets flagged.
- **Category is stored** from Meta on Refresh and from the `template_category_update` webhook field (subscribe to it next to `message_template_status_update`). A template Meta marks MARKETING is never sent (the email goes instead) and Settings shows "Reclassified as marketing by Meta".
- **`allow_category_change` is not sent:** Meta has deprecated it and reclassifies on its own, so the send gate is the protection.
- **Migration:** `20261115120000_whatsapp_template_category` (additive column). Run `npm run db:migrate` locally; `npm run db:deploy` for production before merging.

## connection_test dropped, token templates English only

- `connection_test` was reclassified as MARKETING twice. It is no longer defined, installed or listed. **Settings > WhatsApp > Send test message** and **Alerts > verify my number** now send the approved `calvy_staff_alert_v1` (English): variables are the business name and "WhatsApp connection test for <business>.", with its Open Calvy button. If `staff_alert` is not approved (or Meta marks it MARKETING) the test says so.
- `token_issued`, `token_moved_back`, `token_next` and `token_closed` are English only (`languages: ["en"]`). Hindi rows are no longer created and their rejected rows are hidden; every customer gets the English token message. Hindi rows still on Meta are harmless and unused.
