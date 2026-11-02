# Notifications design (ROADMAP-v2 item 3)
Flow: caller runs `notify(event, data, tx?)` → one outbox row per recipient + channel (inside the caller's transaction when it has one) → immediate attempt in `after()` → scheduler retries whatever is left. Code: `lib/notifications/`; adding WhatsApp means adding a channel adapter, not new events or templates.
## Schema (migration only; `;` is shorthand for a new line)
```prisma
enum NotifStatus { PENDING SENDING SENT FAILED SKIPPED };  enum NotifChannel { EMAIL WHATSAPP }
model NotificationOutbox {
  id String @id @default(cuid());  idempotencyKey String @unique  // {event}:{subjectId}:{version}:{recipient}:{channel}; version = new time, status or lead
  businessId String?;  appointmentId String?                       // no FKs: the log outlives hard-deleted appointments; null business = platform mail
  event String;  audience String;  channel NotifChannel;  recipient String;  template String
  payload Json;  secret String?                                    // secret = AES-GCM auth link (new env NOTIFY_SECRET_KEY), nulled once final; never raw in payload
  status NotifStatus @default(PENDING);  attempts Int @default(0);  error String?;  providerId String?
  nextAttemptAt DateTime @default(now());  lockedUntil DateTime?;  expiresAt DateTime?;  sentAt DateTime?;  createdAt DateTime @default(now())
  @@index([status, nextAttemptAt]);  @@index([businessId, createdAt]);  @@index([appointmentId])
}
model NotificationOptOut { businessId String;  recipient String;  createdAt DateTime @default(now());  @@id([businessId, recipient]) }
// Business.notificationPrefs Json?  zod + code defaults: alerts per event, reminderLeadMinutes (60/120/180/1440/2880, default [1440]), dailySummary (off)
```
## Events and triggers (B = business, C = customer; * = ON by default, C can unsubscribe)
| Event | To | Trigger today |
|---|---|---|
| `account.created`, `business.live` | B | `createBusinessForUser` lib/createBusiness.ts:44; no "live" flag exists, so for now it sends the website link at creation; moves to "onboarding wizard completed" in the identity step (roadmap 6) |
| `booking.created` | B, C | `sendConfirmationFor` lib/onlinePayment.ts:121 (token, paid); api/bookings/route.ts:318; api/appointments/route.ts:233 |
| `booking.rescheduled` | B, C | api/appointments/[id]/route.ts:198; lib/customerAppointments.ts:142 |
| `booking.cancelled` | B, C | api/appointments/[id]/route.ts:196; lib/customerAppointments.ts:175; lib/queueDb.ts:279 |
| `booking.paid` (receipt) | B, C | api/appointments/[id]/route.ts:201; `settlePaidPayment` lib/onlinePayment.ts:235. Razorpay paths stay on direct `lib/email` (see Existing code) |
| `booking.status` (no-show, completed*, queue moves) | B, C | api/appointments/[id]/route.ts:155 (no mail today); `runQueueAction` lib/queueDb.ts:277 |
| `booking.meeting_link` | C | api/appointments/[id]/route.ts:223 |
| `booking.reminder`* | C | scheduler sweep |
| `booking.review_request`* | C | status becomes completed and `safeReviewLink(googleReviewUrl)` is set; `nextAttemptAt` +2h |
| `summary.daily` | B | scheduler, 08:00 business time, opt-in |
| `auth.verify`, `auth.reset` | B, C | api/signup:62, api/auth/{forgot-password,resend-verification}, api/customer/{signup,forgot-password,resend-verification} |
| `platform.lead`, `platform.form` | Calvy | api/leads:50, :54; api/signup:56; api/onboarding:50 |
Kept rules: `suppressContactMessages` skips C rows; `emailReminders`/`whatsappReminders` plan limits gate reminders. B defaults: new booking, cancelled, rescheduled, paid ON; other status changes OFF.
## Templates: one registry, `{ subject(ctx), Email(ctx), text(ctx) }`; email and WhatsApp render the same `ctx`
Context: payload + `t()` pack terms + `TenantBrand` logo/colour (read at render). Existing, moved: confirmation (.ics, token, tracking and meeting links), reminder (drop the hard-coded "tomorrow"; say the date), reschedule, cancellation, meeting link, queue moved back, queue closed, invoice, verify and reset (owner, customer), lead, form. New: welcome, business live, B booking alert (one, by event), status change, review request, daily summary.
## Preferences and unsubscribe
Settings page edits `notificationPrefs`; alerts go to `Business.email`, else the owner. Reminders, review requests and "completed" emails are ON by default and carry a signed footer link and `List-Unsubscribe` one-click headers, on the root domain; opt-out is per business + recipient, checked at enqueue and send. Everything else always sends.
## Scheduler
Vercel docs (checked): Hobby runs once a day ±59 min and rejects more frequent crons at deploy; Pro runs per minute. The reminder route comment says we are on Hobby (account not checked). Decision: cron-job.org (free, 1-min minimum, custom headers, 30s timeout) calls `GET /api/cron/notifications` every 2 min with `Authorization: Bearer CRON_SECRET` and, because Deployment Protection is on, `x-vercel-protection-bypass`; the daily Vercel cron points at the same URL as backstop. Exact steps: docs/notifications-setup.md. On Pro: set `*/2 * * * *` in vercel.json, drop the external job.
Each run (25s budget): (1) `releaseExpiredHolds`, moved from the old cron; (2) enqueue due reminders; (3) enqueue summaries; (4) claim 25 rows with `FOR UPDATE SKIP LOCKED` (PENDING and due, or SENDING with stale `lockedUntil`), set SENDING, attempts+1, lock 5 min; (5) send paced to Resend's limit; (6) null payloads of rows final for 90+ days. Retries: 1m, 5m, 30m, 2h, 6h, then FAILED. Provider 4xx except 429 fails at once; unconfigured channel = SKIPPED. Resend `idempotencyKey` = row id, so a crash after sending does not double-send.
Reminders: no rows until due, so lead changes and reschedules just work. Due when `now >= date - lead`, key includes date + lead; skip if `createdAt` is after the due time (confirmation just went). At send, re-check status and date, else SKIPPED; `expiresAt` = appointment time. Cutover: `reminderSent = true` counts as sent; drop the column later.
## Delivery log
The outbox is the log. Owner: Dashboard page filtered by session `businessId` (time, event, recipient, status, short error; never payload or secret). Admin: all businesses plus platform rows, with a retry button.
## Existing code replaced or merged
`lib/email.tsx`: `dispatch` → email adapter; `icsAttachment`, `tenantBrand` → render; `send*` removed except `sendBookingConfirmation`, `sendInvoice` and `sendBookingConfirmationWhatsApp`, which stay for the untouched Razorpay paths (webhook, booking/success), so those sends log to `EmailLog`, not the outbox, until Razorpay is removed. `[id]/payment` and bookings/confirm stay untouched too: still no receipt from manual mark-paid. `emails/templates.tsx`, `EmailLayout.tsx` → registry. `lib/whatsapp.ts`: confirmation and reminder senders → `text()`; `sendWhatsApp` must separate unconfigured from failed; broadcasts unchanged. `app/api/cron/reminders` removed. `EmailLog` stays while Razorpay does (nothing reads it). `sendPushToBusiness` and `Notification` stay direct, outside the outbox.
## Chunks (each `step-3/...`, from latest main)
1. `outbox-core`: schema, `notify`, processor, email adapter, cron endpoint, shared `lib/cronAuth.ts`. 2. `templates`: registry, text variants, new templates.
3. `customer-events`: move callers, including Cashfree/payment-core (`settlePaidPayment`, `sendConfirmationFor`); Razorpay paths untouched (owner decision). 4. `scheduler-reminders`: sweep, holds, cron-job.org setup, remove old cron. 5. `business-events-prefs`: B events, settings, summary, unsubscribe, review request. 6. `delivery-log`: owner + admin pages, WhatsApp adapter.
## Tests (Vitest, mocked adapter and prisma)
Pure: backoff, error classes, key builder, reminder due logic (timezone, reschedule re-arms, `createdAt` skip), prefs defaults, unsubscribe token, every template renders both variants with pack terms and no raw secret. Flow: duplicate webhook = one row, stale lock reclaimed, permanent failure stops retrying, cancelled booking's reminder SKIPPED, opt-out blocks non-essential only, cron 401 without secret, log scoped to `businessId`. Update the 9 test files mocking `@/lib/email`. `SKIP LOCKED` needs a real DB: one run on dev only.
