# Calvy — Codebase Audit

Read-only review of `c:\Users\qadri\calvy.io` (branch `main`, 160 commits). Generated 2026-10-14. Nothing in the app was changed; this file is the only artifact. Secrets found are **redacted** here on purpose.

Scope note: I read the schema, auth, booking/availability, Razorpay, billing webhook, cron, email/WhatsApp libs, signup/onboarding/upload/leads/wallet/admin routes, middleware and config. I did **not** read every one of the ~57 API routes or every dashboard page, so the "tenant isolation" findings below are sampled, not exhaustive.

---

## 1. Stack

| Layer | Tech |
|---|---|
| Framework | Next.js 14.2.5 App Router, React 18, TypeScript (strict) |
| Styling/UI | Tailwind 3, Radix UI, framer-motion, lucide-react, recharts |
| DB / ORM | PostgreSQL (Neon) via Prisma 5.22 |
| Auth | NextAuth v4, JWT sessions; Credentials + optional Google/Facebook OAuth |
| Payments | **Razorpay** (Payment Links for bookings, Subscriptions for SaaS billing, Route linked accounts for tenant payouts). README/Documentation.md still say Stripe — outdated. |
| Email | Resend (`lib/email.tsx`, templates in `emails/`) |
| WhatsApp | Meta WhatsApp Business Cloud API, Graph v19.0 (`lib/whatsapp.ts`) |
| Push | `web-push` (VAPID) + service worker `public/sw.js` |
| Files | Vercel Blob (public) |
| Content | `marked` for blog/help markdown; blog posts live in DB (`Post`) |
| Tests | Vitest (4 files, pure logic only) |
| Hosting | Vercel only (see §10) |

## 2. Folder structure

```
app/
  page.tsx, login/, signup/, verify-email/, onboarding   # public + auth
  [slug]/ (+ book-now/)      # tenant public site, reached via subdomain rewrite
  b/[slug]/                  # legacy booking page
  booking/success/           # post-payment landing (verifies Razorpay link)
  blog/, help/               # SEO content (DB posts / lib/helpArticles.ts)
  dashboard/*                # tenant app (appointments, clients, calendar, payments,
                             #   expenses, analytics, services, staff, wallet, website,
                             #   broadcasts, support, settings, billing)
  admin/*                    # super-admin (tenants, plans, support, blog, withdrawals)
  crm/                       # lead CRM
  api/*                      # 57 route handlers
components/                  # ui/, chatbot/ChatWidget, dashboard/, landing/
emails/                      # react-email templates
lib/                         # auth, booking, plans, razorpay, email, whatsapp, push, ratelimit, geo, ...
prisma/                      # schema.prisma, seed.ts, migrations/, dev.db (!)
middleware.ts                # subdomain rewrite + auth guard
tests/                       # booking, currency, plans, ratelimit
scripts/update-slugs.ts      # one-off migration
vercel.json                  # single daily cron
```

Non-code files in the root: `Documentation.md` (1.2k lines), `README.md`, `KEYWORD-PLAN.md`, `Calvy-AI-Marketing-Brief.md`, a blog-titles CSV.

## 3. Running locally

```bash
npm install                       # runs prisma generate
# create .env.local (no .env.example exists in the repo — README references one that is missing)
npx prisma db push                # sync schema to the DB in DATABASE_URL
npm run db:seed                   # optional: demo@calvy.io / password123 + sample data
npm run dev                       # http://localhost:3000
npm test                          # vitest
```

- Subdomain testing locally: `NEXT_PUBLIC_ROOT_DOMAIN` defaults to `calvy.io`; middleware strips the port and only treats `*.calvy.io` as tenants. To test `slug.localhost:3000` you must set `NEXT_PUBLIC_ROOT_DOMAIN=localhost`. Otherwise use `/[slug]` or `/b/[slug]` directly.
- `npm run build` executes **`prisma db push`** against whatever `DATABASE_URL` is set (see risk S-8).
- Minimum to boot: `DATABASE_URL`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`. Everything else degrades (email "skipped", WhatsApp skipped, uploads 503, prepaid falls into demo mode outside production).

## 4. Environment variables (all 28 referenced in code)

Extracted by grepping `process.env.*` across app/lib/components/emails/middleware/prisma/config.

| Variable | Used for | Required? |
|---|---|---|
| `DATABASE_URL` | Postgres connection (Prisma) | **Yes** |
| `NEXTAUTH_SECRET` | JWT signing, middleware `getToken` | **Yes** |
| `NEXTAUTH_URL` | NextAuth base URL (read by NextAuth itself, not in code) | Yes in prod |
| `NEXT_PUBLIC_APP_URL` | Absolute URLs, Razorpay callback, canonicals (default `https://calvy.io`) | Yes in prod |
| `NEXT_PUBLIC_ROOT_DOMAIN` | Subdomain detection (default `calvy.io`) | Yes for multi-tenant |
| `SUPER_ADMIN_EMAIL` | Email that is always treated as admin (23 uses) | Yes for admin |
| `ADMIN_SETUP_SECRET` | One-time bootstrap of first admin via `/api/admin/make-admin` | Optional |
| `CRON_SECRET` | Bearer auth for `/api/cron/reminders` | **Should be set** (see S-3) |
| `RAZORPAY_KEY_ID` | Razorpay API (also gates prepaid mode) | For payments |
| `RAZORPAY_KEY_SECRET` | Razorpay API | For payments |
| `RAZORPAY_WEBHOOK_SECRET` | Booking-payment webhook HMAC | For payments |
| `RAZORPAY_BILLING_WEBHOOK_SECRET` | Subscription webhook HMAC | For billing |
| `RAZORPAY_PLAN_STARTER` / `_PROFESSIONAL` / `_BUSINESS` | Razorpay plan ids (`plan_...`) | For billing |
| `RESEND_API_KEY` | Email | For email |
| `EMAIL_FROM` | Sender (default `Calvy <onboarding@resend.dev>`) | Recommended |
| `WHATSAPP_PHONE_NUMBER_ID` | WhatsApp Cloud API | Optional |
| `WHATSAPP_ACCESS_TOKEN` | WhatsApp Cloud API | Optional |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Web push (client + server) | Optional |
| `VAPID_PRIVATE_KEY` | Web push | Optional |
| `VAPID_SUBJECT` | Web push `mailto:` | Optional |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob uploads | Optional |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth | Optional |
| `FACEBOOK_CLIENT_ID` / `FACEBOOK_CLIENT_SECRET` | Facebook OAuth | Optional |
| `NODE_ENV`, `PORT` | Runtime/dev fallback URL | Auto |

Docs drift: README/Documentation.md list `STRIPE_*` vars that no code reads, and omit `RAZORPAY_*`, `SUPER_ADMIN_EMAIL`, `ADMIN_SETUP_SECRET`, `CRON_SECRET`, OAuth vars, `BLOB_READ_WRITE_TOKEN`. There is also a `RAZORPAY_KEY_ID` read in a client component (`app/admin/plans/PlansClient.tsx:277`) — it will always be `undefined` in the browser (not a leak, but the "configured" indicator is wrong).

## 5. Database

PostgreSQL on Neon, 19 models, all string-typed enums (no Prisma enums), JSON stored as strings.

| Group | Models |
|---|---|
| Identity | `User` (role: user/admin, nullable password for OAuth), `VerificationToken` |
| Tenant | `Business` (slug, plan, currency, payment mode, bank + KYC fields, Razorpay ids, `availabilityJson`, `websiteJson`, `slotInterval`) |
| Scheduling | `Staff` (`workingHours` JSON), `Service` (price, duration, `capacity`), `StaffService`, `Client` (unique per business+email), `Appointment` |
| Money | `WithdrawalRequest`, `Expense`, `PlanConfig` (live pricing + feature flags) |
| Comms | `Notification`, `PushSubscription`, `Broadcast`, `EmailLog` |
| Support/CRM | `SupportTicket`, `SupportMessage`, `Lead` |
| Content/config | `Post`, `AppSetting` |

Notes:
- **Tenant key is `businessId`** on every tenant table; isolation is enforced only in application code (no RLS). Cascade deletes from `Business` are set on most children (not `Appointment.service/client/staff`).
- Money is `Float` (not Decimal/integer minor units) — rounding drift risk for totals.
- Appointment `date` is `DateTime` (UTC) but built from a naive `YYYY-MM-DDTHH:mm` string (see §7).
- `prisma/migrations/` has only 5 migrations (April 2026) and is far behind the schema; the project relies on `prisma db push`. There is no reliable migration history for prod.
- `prisma/dev.db` is a **SQLite file committed to git** (first commit), unrelated to the Postgres provider. It's leftover from an earlier SQLite phase. I could not inspect its contents (no `strings`/sqlite tooling in this shell); treat it as potentially containing real data until checked.
- Schema `binaryTargets` includes `rhel-openssl-1.0.x` and `debian-openssl-3.0.x` (Vercel/Lambda targets).

## 6. Authentication & authorization

- **NextAuth v4, JWT strategy.** Credentials: bcrypt (cost 12) compare, requires `emailVerified`. Login is rate-limited 10/min per email (in-memory, see S-4). Wrong-password and missing-user return the same `null`; unverified accounts throw `EmailNotVerified` (only after a correct password — good).
- **Google/Facebook** providers register only if env vars exist. `signIn` callback auto-creates a `User` for any OAuth email and **auto-links/verifies an existing account by email** (`lib/auth.ts` signIn). That's standard "trust the IdP's email" account linking; acceptable for Google (verified emails) but **Facebook emails are not guaranteed verified** → account takeover vector if an attacker controls a Facebook account claiming a victim's unverified email (S-6).
- JWT carries `uid, role, businessId, businessSlug, businessName`. **Role is baked into the JWT at sign-in and never refreshed**: demoting/removing an admin does not take effect until the token expires (default 30 days).
- **Middleware** (`middleware.ts`) guards `/dashboard`, `/admin`, `/crm` via `withAuth` (any valid token). Admin-ness is **not** checked in middleware; each `/admin`/`/api/admin` handler must check `isAdminSession()` itself (`lib/adminAuth.ts`: role `admin` OR email == `SUPER_ADMIN_EMAIL`). Sampled routes do; confirm the rest.
- API routes authorize with `session.user.businessId` and scope queries (`findFirst({ id, businessId })` pattern seen in appointments). Sampled routes are correct; not every route was read.
- **Admin bootstrap** `/api/admin/make-admin`: allowed for an existing admin, or for anyone presenting `ADMIN_SETUP_SECRET` while zero admins exist. Reasonable design; secret comparison uses `===` (not constant-time).
- Email verification: 24h random 32-byte token in `VerificationToken`. Signup stores email as typed (case-sensitive `findUnique({email})`) → `A@x.com` and `a@x.com` can be two accounts, and login lookups are case-sensitive (login rate-limit key is lowercased but the DB lookup isn't).

## 7. Booking & slot logic

Files: `app/api/availability/route.ts` (advisory), `app/api/bookings/route.ts` (authoritative), `lib/booking.ts` (pure, unit-tested helpers), `components/chatbot/ChatWidget`, `app/[slug]/book-now`.

**Availability (GET, public):** loads `availabilityJson` (per weekday `{enabled,start,end}`; default Mon–Fri 09:00–18:00), generates slots at `slotInterval` (default 30), then:
- capacity ≤ 1: every minute covered by any non-cancelled/no-show appointment **in the whole business** is blocked (not per staff); slot must also fit before closing.
- capacity > 1 (group): counts bookings starting at the exact same HH:MM; slot is open while count < capacity; returns `spotsMap`.
- `duration` comes from the query string and is unvalidated (`Number(...)`; NaN/huge values just return no slots).

**Booking (POST, public):** rate limit 10/min/IP → validates fields → loads business + services → totals price & duration from **DB** (client can't set price — good) → rejects past times → re-runs the conflict check via `hasBookingConflict` → creates `Client` (find-or-create by business+email) and `Appointment` (status `confirmed`).
- Multiple services: first service is the FK; the rest are encoded into `notes` as `__services__:B|C` (string hack; breaks if a service name contains `|`, and the user's notes can spoof the prefix).
- **Payment modes:** `postpaid` → create appointment immediately (unpaid) + email + WhatsApp + push. `prepaid` → Razorpay Payment Link; the appointment is created **only after payment** (webhook, or the `/api/bookings/confirm` fallback).
- Prod fail-closed: prepaid with no `RAZORPAY_KEY_ID` → 503. In non-prod it creates an unpaid "prepaid" appointment (demo mode).

Issues:
- **No slot hold for prepaid.** Slot is only checked before the payment link is created; two users can both pay for the same slot and the webhook creates both appointments with no conflict re-check (B-1).
- **No transaction / DB constraint** on the conflict check → race between check and insert double-books even in postpaid (B-2).
- **Timezone:** `new Date("YYYY-MM-DDTHH:mm:00")` has no zone, so it's parsed in the server's local TZ (UTC on Vercel); availability reads/writes in UTC. Works only because the server is UTC and the business hours are implicitly treated as UTC. There is no per-business timezone field — a salon in IST sees hours shifted when anything displays in a local zone. Reminder cron also uses UTC day boundaries.
- **Staff is ignored for availability** — conflicts are business-wide, so a business with 3 staff can only have one concurrent individual booking. `staffId` is stored but not validated as belonging to the business or the service (bookings route trusts `staffId` from the body; a foreign staff id from another tenant is accepted).
- Date/time format isn't validated before `new Date(...)` beyond NaN.
- `bookings/confirm` stores `razorpayPaymentId = paymentLinkId` (`plink_…`) whereas the webhook stores the payment id (`pay_…`); their idempotency checks don't match each other, so a payment can produce **two appointments** (webhook + confirm) (B-3).

## 8. Razorpay flow

1. **Tenant onboarding for payouts** (`app/api/razorpay/connect`, `lib/razorpay.ts`): creates a Route linked account → stakeholder → requests `route` product → submits bank settlement → `routeStatus` progresses `not_started → created → needs_clarification → activated`. PAN/GST/bank details are stored on `Business`.
2. **Booking payment (prepaid):** `POST /api/bookings` → `razorpay.paymentLink.create` (amount from DB × 100, business currency, booking details in `notes`, `callback_url=/booking/success`, `notify` off) → returns `short_url`.
3. **Completion:** webhook `POST /api/razorpay/webhook` handles `payment_link.paid`: HMAC-SHA256 verify (`RAZORPAY_WEBHOOK_SECRET`) → idempotency by `razorpayPaymentId` → rebuild booking from link `notes` → if tenant `routeStatus=activated`, `payments.transfer` the full amount to the linked account and store `razorpayTransferId` → create appointment (paid) → update client stats → push + confirmation email + invoice + WhatsApp. `/booking/success` + `POST /api/bookings/confirm` is a fallback when the webhook is late.
4. **Wallet:** for non-routed paid prepaid appointments, balance = Σ price − Σ released withdrawals; tenants file `WithdrawalRequest`s (one pending at a time); admin releases manually (`/api/admin/withdrawals`). No Razorpay payout API — manual bank transfers.
5. **SaaS billing:** `/api/billing/upgrade` creates a Razorpay Subscription (`RAZORPAY_PLAN_*`); `/api/billing/webhook` (separate secret) handles `subscription.activated|charged|halted|cancelled|completed|expired`; `/api/billing/sync` and `/portal` fetch/cancel.

Issues: B-1/B-3 above; the confirm route is **unauthenticated** and trusts link `notes` (safe only because the link must be `paid`, but it skips the route transfer, emails, invoice, and push that the webhook does — and any `plink_` id can be replayed to read booking metadata); no Razorpay-side idempotency/refund handling (no `payment.failed`, refund, or `payment.captured` events handled); tenant gets **no platform fee** logic (full amount transferred); the webhook trusts `notes.businessSlug` from the link (set server-side, fine) but doesn't verify the paid amount equals the DB price at pay time.

## 9. Email & WhatsApp

**Email** (`lib/email.tsx`): Resend; `FROM = EMAIL_FROM || "Calvy <onboarding@resend.dev>"`. Types: verification, booking confirmation (with ICS-style details), reminder, cancellation, reschedule, invoice, lead acknowledgement, broadcasts. Every send writes an `EmailLog` row (`sent|failed|skipped`, provider id). With no `RESEND_API_KEY` it logs "skipped" and continues — no failure to the user. Sends are inline in request handlers (adds latency; no queue/retry).

**WhatsApp** (`lib/whatsapp.ts`): Graph API v19.0, posts **free-form `type: "text"` messages**. Meta only allows free-form text inside a 24-hour customer-service window; business-initiated booking confirmations and next-day reminders **will be rejected unless sent as approved template messages**. Also: one global sender number for all tenants, messages are signed "— Calvy", no opt-in/consent capture, and phone numbers are only digit-stripped (no country-code normalization). Failures are swallowed with `console.error`. v19.0 is an old Graph version.

**Reminders:** Vercel Cron → `GET /api/cron/reminders` once daily at 06:00 UTC; selects appointments in tomorrow's UTC day with `reminderSent=false`; email + WhatsApp + push; marks `reminderSent`. A single daily run means a 06:00 UTC cutoff — appointments booked after that for "tomorrow" never get a reminder; `reminderSent` is set even if both client channels failed.

**Push:** `lib/push.ts` stores subscriptions per business, sends via VAPID, mirrors to `Notification`.

## 10. Deployment

- **Vercel only.** `vercel.json` contains one cron (`/api/cron/reminders`, `0 6 * * *`). `.vercel` is git-ignored. Wildcard DNS `*.calvy.io` → Vercel.
- **Not present:** Dockerfile, docker-compose, PM2 `ecosystem.config.*`, nginx config, GitHub Actions/CI, `.env.example`, Vercel `headers`/`rewrites`. No VPS config exists in the repo.
- `next.config.mjs` only whitelists `images.unsplash.com` and `ui-avatars.com` for `next/image`. No security headers, no `poweredByHeader: false`.
- Build script: `prisma generate && prisma db push && next build` — **a deploy mutates the production schema** and `db push` can drop columns/data when the schema changes (it prompts, but in CI it fails or uses `--accept-data-loss` only if passed). Prefer `prisma migrate deploy` with real migrations.
- No `prisma/dev.db` use at runtime; it's dead weight in git.
- Tenant uploads go to a **public** Vercel Blob store.

## 11. Security findings

Severity is my judgment (Critical / High / Medium / Low). "Verified" = I read the code path; "Sampled" = pattern seen in some files only.

### Critical
- **S-1 Hardcoded production secrets committed to git.** `.claude/settings.json` (tracked) contains (a) a full Neon Postgres connection string including the **database password** (`postgresql://neondb_owner:<redacted>@ep-…neon.tech/neondb`) in three allow-rules, and (b) a **plaintext login email + password** for a real-looking account (`curl … email=huzuhuzair@gmail.com&password=<redacted>`). Both are in history from at least commit `d393208` / `0bd4cad` (`git log -S` confirmed), so deleting the file is not enough. **Action:** rotate the Neon password and that account's password now; check Neon for access from unknown IPs; scrub history (`git filter-repo`) if the repo is or was ever public/shared; remove the file from tracking. Verified.
- **S-2 Webhook/confirm can create duplicate paid appointments and unauthenticated `bookings/confirm`** (see B-3): financial-integrity bug, plus an unauthenticated endpoint that performs writes. Verified.

### High
- **S-3 Cron endpoint is open if `CRON_SECRET` is unset.** `if (secret) { ...check... }` — when the variable is missing, `/api/cron/reminders` is publicly callable and can be used to trigger mass email/WhatsApp/push sends (cost + spam; capped only by `reminderSent`). Make it fail closed. Verified.
- **S-4 Rate limiting is in-memory per instance** (acknowledged in `lib/ratelimit.ts`). On Vercel each lambda has its own map, so the 10/min login limit, 5/min signup, 10/min booking and 5/min lead limits are trivially bypassed by parallel requests/cold starts. Also keys on `x-forwarded-for` first hop, which is client-spoofable on some paths. Credential stuffing and booking/email spam (each booking sends email+WhatsApp) are feasible. Use Upstash/Vercel Firewall. Verified.
- **S-5 Prepaid double-booking / no slot hold / no transaction** (B-1, B-2): customers pay for slots that are already taken → refunds and chargebacks. Verified.
- **S-6 OAuth account linking by unverified-email trust** (Facebook). Verified in code (`signIn` callback auto-links by email and sets `emailVerified`).
- **S-7 Sensitive PII stored in plaintext:** `bankAccountNumber`, `bankIban`, `bankRoutingNumber`, `panNumber`, `gstNumber` on `Business`; any DB leak (or S-1) exposes them. Encrypt at rest (app-level) or at least restrict selects. Verified in schema.
- **S-8 `prisma db push` in the production build** can silently alter/destroy prod data on any deploy from any branch/preview that has the prod `DATABASE_URL`. Verified.

### Medium
- **S-9 Webhook signature check uses `===`**, not `crypto.timingSafeEqual` (both Razorpay webhooks). Low exploitability, easy fix. Verified.
- **S-10 Webhook idempotency is check-then-insert** without a unique constraint on `razorpayPaymentId`; Razorpay retries/concurrent deliveries can create duplicates. Add `@unique`. Verified.
- **S-11 Wallet withdrawal race:** balance is computed from reads, then a request created — concurrent POSTs can each pass the "no pending" check. Wrap in a transaction / unique partial index. Also `amount` isn't type-checked (strings/NaN). Verified.
- **S-12 Foreign `staffId`/`serviceIds` accepted from the public booking body:** `staffId` isn't verified to belong to the business. Cross-tenant references, data integrity, and a way to attach another tenant's staff name into emails. Verified.
- **S-13 JWT role/business info never refreshed** (demoted admins keep access up to 30 days; deleted business keeps working token). Verified.
- **S-14 No security headers/CSP** (no `headers()` in `next.config.mjs`): clickjacking of dashboard/booking pages, no HSTS from the app layer, no CSP. Verified.
- **S-15 Upload route:** accepts any `image/*` (including `image/svg+xml` → stored XSS when served from the blob domain), file extension taken from the client-supplied filename, public bucket, no per-tenant quota. Verified.
- **S-16 Account enumeration:** signup returns "An account with this email already exists." (409) vs. success. Verified.
- **S-17 Case-sensitive emails** at signup/login (duplicate accounts, lockout, bypass of per-email rate-limit key). Verified.
- **S-18 `marked` output rendered via `dangerouslySetInnerHTML` without sanitization** in blog and help pages. Content is admin/author-controlled (DB `Post` via admin API, `helpArticles.ts` static), so risk is limited to a compromised admin — but an admin compromise becomes stored XSS on the public site. Add DOMPurify/`sanitize-html`. Verified.
- **S-19 Public availability/booking endpoints leak nothing sensitive, but** `POST /api/bookings` and `/api/leads` have no CAPTCHA/honeypot, so the whole email/WhatsApp pipeline can be triggered to arbitrary addresses/phones (spam relay using the platform's Resend/WhatsApp reputation). Verified.

### Low / hygiene
- **S-20** Seed script creates `demo@calvy.io` / `password123`; fine for dev, but make sure `db:seed` can never run against prod (it has no guard).
- **S-21** `prisma/dev.db` tracked in git; `tsconfig.tsbuildinfo` also tracked. Remove and ignore.
- **S-22** `.claude/settings.json` has stale allow-rules from another machine (`/Users/aamirbashir/Downloads/slotly/...`) including broad `Bash(node -e ' *)` and `Bash(npx dotenv *)` — they widen what an agent can run without a prompt. Prune.
- **S-23** `make-admin` secret compare isn't constant-time; `SUPER_ADMIN_EMAIL` is an implicit permanent admin (an OAuth account with that email on a weak provider = admin; see S-6).
- **S-24** `Float` money, `any`-cast Razorpay calls (`as any`) hide SDK type errors; amounts are `Math.round(price*100)` for all currencies (zero-decimal currencies such as JPY/KRW would be charged 100×; 3-decimal currencies like KWD/BHD are wrong too).
- **S-25** `README.md`/`Documentation.md` describe Stripe; stale docs mislead on which webhooks/env vars matter.
- **S-26** Logging: `console.log("[WhatsApp] Sent confirmation to", to, result)` writes client phone numbers to logs.
- **S-27** No `npm audit`/dependency scanning or CI; Next.js is pinned at 14.2.5 (several security advisories have been published for 14.x since — check and upgrade within 14.2.x).

### Positive notes
- Prices/durations are computed server-side from the DB, not from the request.
- Webhooks verify HMAC signatures and fail closed when the secret is missing.
- Prod fail-closed when Razorpay isn't configured for prepaid.
- bcrypt cost 12, 32-byte verification tokens with expiry, `.env*` ignored, tenant-scoped `findFirst({id, businessId})` pattern in sampled routes.
- Plan gating is enforced server-side as well as in UI (per README; sampled).

## 12. Suggested priority order

1. Rotate the Neon DB password and the leaked account password; remove `.claude/settings.json` secrets and purge history (S-1).
2. Make cron fail closed; set `CRON_SECRET` in Vercel (S-3).
3. Replace in-memory rate limiting with a shared store; add CAPTCHA on public forms (S-4, S-19).
4. Fix prepaid flow: unique `razorpayPaymentId`, store the payment id consistently in webhook and confirm, re-check slot conflict in a transaction, ideally hold the slot before payment (S-2, S-5, S-10).
5. Remove `prisma db push` from build; baseline real migrations (S-8).
6. Verify OAuth email verification (drop Facebook linking or require verified email) (S-6).
7. Encrypt bank/PAN fields; add security headers; sanitize markdown; harden uploads (S-7, S-14, S-15, S-18).
8. Move WhatsApp to approved templates; add per-business timezone; scope availability per staff.
9. Delete `prisma/dev.db`, `tsconfig.tsbuildinfo`; refresh README/Documentation for Razorpay and the real env var list; add `.env.example`.
