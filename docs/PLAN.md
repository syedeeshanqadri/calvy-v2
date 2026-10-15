# Calvy v2 — Delivery plan (9 steps)

This replaces the earlier phase-based backlog. It keeps every item from the audit (reports `01-frontend-ux`, `02-backend`, `03-product`, on branch `audit/phase-1`) and regroups them into the approved 9 steps, adds the items the audit did not cover, and says which items can run in parallel and which agent owns each.

**Status:** planning only. No app code has been changed by this document.

## How to read this plan

- **ID** is `S{step}-{nn}`. The audit's original ID is shown in brackets, for example `[B-04]`, so findings stay traceable. `[new]` marks items the audit did not list.
- **Eff** (effort): **S** up to half a day, **M** 1 to 3 days, **L** more than 3 days, for one developer including tests.
- **Agent** is the owner defined in `.claude/agents/`: `backend-engineer` (BE), `frontend-designer` (FE), `qa-tester` (QA), `security-auditor` (SEC, read-only). `owner` means a manual step only the product owner can do.
- **Lane / depends** controls parallelism inside a step. **Items in different lanes can run at the same time. Items in the same lane run one after another.** `after X` means it cannot start until X is merged. Lanes are drawn so that parallel items never edit the same file; if a task turns out to need a file owned by another lane, stop and re-plan, never edit it at the same time.
- Every item names a branch pattern `step-N/short-name` (see CLAUDE.md "How we work"). Non-trivial items need a plan shown to the owner first.
- **Scope rules that apply to every step:** payment gateway code is untouched until an item explicitly says so (only Step 8 items, plus the two explicitly authorised exceptions `S1-03` and `S1-20`); landing-page marketing claims are untouched until Step 9; schema changes are migrations only, never `db push`; every query is scoped to `businessId`; every input is validated with Zod; times are UTC plus the business timezone.
- Each step ends with a **QA** item (tests with evidence) and a **SEC** item (read-only review of the step's diff). A step is done when its exit criteria pass: lint, typecheck, tests and build, reported honestly.

## Must be done before v2 goes live

If any of these is open, v2 should not take real customers. Where each one lives:

| # | Must-do | Step / item |
|---|---|---|
| 1 | Rotate the credentials in `.claude/settings.json` (Neon URL, test password) and purge them from the repo | S1-01 |
| 2 | Lazy third-party clients; no import-time crash (`/booking/success` 500) | S1-03 |
| 3 | Validation on every route, tenant-isolation fixes, cron fail-closed, dependency security updates, migrations instead of `db push` | S1-04 to S1-08, S1-18, S1-19, S1-21 |
| 4 | Password reset, resend verification, lowercase emails | S1-09 |
| 5 | Business timezone, no double bookings, plan limits enforced on public bookings | S2-01, S2-02, S2-05 |
| 6 | Per-staff scheduling (only if salons and clinics are in the launch audience; otherwise state "one calendar per business") | S2-03 |
| 7 | A messaging path that actually delivers (WhatsApp templates or click-to-chat) and a verified email domain | S5-03, S5-04, S5-06 |
| 8 | Error pages, mobile fixes (375px hero, calendar), labelled inputs | S1-16, S3-03, S3-04 |
| 9 | Payments stay switched off until the Step 8 review passes | S1-20, then S8-01 |
| 10 | Remove fabricated marketing claims, fix the offer and pricing copy, dead links | S9-01 to S9-04 |
| 11 | Backups, monitoring and a tested rollback | S7-04, S7-05 |

---

## Step 1 — Foundation & security

**Goal:** a safe base to build on: no leaked secrets, nothing crashes on a missing key, every input validated, tenants cannot see each other, auth is complete, schema changes go through migrations.
**Exit criteria:** security-auditor finds no Critical or High open in this step's scope; test infrastructure exists; the app starts and every page renders with all optional keys unset; `npm audit --omit=dev` has no critical or high issue that is reachable.

**Parallel plan.** Start `S1-01` (owner), `S1-19` (migrations baseline) and `S1-24` (test infrastructure) first. After `S1-04` (validation foundation) merges, lanes C, D and E run in parallel.

| Lane | Agent | Items (in order) |
|---|---|---|
| A: platform | BE | S1-02, S1-03, S1-18, S1-19, S1-20 |
| B: auth lifecycle | BE (then FE) | S1-09 (BE) → S1-10 (FE), S1-11 |
| C: validation, route group 1 (public + auth) | BE | S1-04 → S1-05 |
| D: validation, route group 2 (dashboard CRUD) | BE | after S1-04 → S1-06, S1-08 |
| E: validation, route group 3 (admin, cron, upload, broadcasts) | BE | after S1-04 → S1-07, S1-13, S1-21, S1-22, S1-23 |
| F: edge and headers | BE | S1-12, S1-14, S1-15, S1-17 |
| G: frontend | FE | S1-16 |
| H: tests | QA | S1-24 → S1-25; SEC S1-26 last |

| ID | Title | Eff | Agent | Lane / depends | Files | Acceptance criteria |
|---|---|---|---|---|---|---|
| S1-01 | Rotate leaked credentials and purge them [B-01] | S | owner | start immediately | `.claude/settings.json` (owner only; agents never read it), Neon console, git history | Neon password and the test login password rotated; the secrets removed from tracked files and from history (rewrite or recreate the repository); `.gitignore` covers `.claude/settings.local.json`; old credentials confirmed dead |
| S1-02 | Central env config, `.env.example`, boot-time validation [B-02] | M | BE | A | new `lib/env.ts`, `.env.example`, `instrumentation.ts`, `README.md` | Starting without `DATABASE_URL` or `NEXTAUTH_SECRET` fails with a clear message that does not print values; optional services (email, WhatsApp, blob, push) log "disabled" instead of crashing; README table matches `.env.example`; no `process.env` reads outside `lib/env.ts` for new code |
| S1-03 | Lazy third-party clients; fix `/booking/success` 500 [B-03] | S | BE | A, after S1-02 | `lib/email.tsx:16`, `app/api/broadcasts/send/route.ts:10`, `lib/razorpay.ts:3` (**explicitly authorised: change only the client construction to lazy**, nothing else in payment code), `app/booking/success/page.tsx` | With every key unset, `/booking/success`, `/api/broadcasts/send` and all pages load without a 500; `getResend()` and `getRazorpay()` are created on first use; a test imports every module with an empty environment |
| S1-04 | Validation and API wrapper foundation [B-07, B-17] | M | BE | C (first) | new `lib/validation/*` (shared schemas: email, phone E.164, id, money, pagination, timezone), `lib/api.ts` (`withApi`: auth, Zod parse, error mapping, request id, safe logging), `package.json` (add `zod`) | `withApi` returns 400 `{error, details}` for invalid and malformed JSON, 401/403/404 consistently, 500 without leaking internals; schemas unit-tested; documented in a short `docs/api-conventions.md` |
| S1-05 | Apply validation: signup, login helpers, leads, verify, onboarding, availability, public bookings (input only) [B-07] | M | BE | C, after S1-04 | `app/api/signup`, `leads`, `onboarding`, `auth/verify-email`, `availability`, `bookings` (not `bookings/confirm`) | Every handler parses params, query and body with Zod; emails trimmed and lowercased; `slotInterval`/`duration`/`date`/`time` bounded; length limits on all strings; tests for valid, invalid, oversized and malformed input |
| S1-06 | Apply validation: dashboard CRUD routes [B-07] | M | BE | D, after S1-04 | `app/api/appointments`, `clients`, `services`, `staff`, `expenses`, `settings`, `website`, `notifications`, `push`, `support` | Same standard as S1-05; `settings` validates `availabilityJson`, `currency` (allow-list), `primaryColor` (hex), `slotInterval` (integer 5 to 240); `website` validates `websiteJson` against a schema; no raw `req.json()` left in these routes |
| S1-07 | Apply validation: admin, CRM and blog routes [B-07, B-39] | M | BE | E, after S1-04 | `app/api/admin/**`, `app/api/crm/**` | Plan and status values validated against known values; pagination on list routes; tenant delete requires a confirmation token and writes a log line; tests |
| S1-08 | Tenant-isolation fixes [B-06 part] | M | BE | D, after S1-06 | `bookings/route.ts:150,266`, `appointments/route.ts:131`, `appointments/[id]`, any lookup by id without `businessId` | `staffId`, `serviceId`, `clientId` from requests are verified to belong to the business; cross-tenant ids return 404; one test per route proves it |
| S1-09 | Auth lifecycle: password reset, resend verification, email normalisation [B-08, B-09, B-23] | L | BE | B | `lib/auth.ts`, `app/api/auth/forgot-password`, `reset-password`, `resend-verification`, `signup/route.ts`, `emails/templates.tsx`, migration to lowercase and merge duplicate emails/clients | One-time hashed tokens, 1h expiry, single use, rate limited; no account enumeration; reset ends old sessions (token version); all emails lowercased on write and lookup; migration merges existing duplicates safely; OAuth no longer auto-verifies an existing unverified credentials account without proof; tests |
| S1-10 | Auth screens: forgot password, reset, resend, show-password toggle, auth-flow copy [A-23, A-27] | M | FE | B, after S1-09 | `app/forgot-password`, `app/reset-password`, `app/login/page.tsx`, `app/signup/page.tsx`, `app/verify-email/page.tsx` | Flows work end to end on 375px and 1440px; every input labelled; errors announced and next to the field; expired link offers "send a new link"; screenshots attached |
| S1-11 | Session freshness, brute-force limits, enumeration [B-29, B-30] | S | BE | B, after S1-09 | `lib/auth.ts`, `app/api/signup/route.ts` | Role and business re-read at a fixed interval or on a version bump (a demoted admin loses access without waiting 30 days); per-IP and per-email limits on the shared limiter; signup answers identically for existing emails |
| S1-12 | Shared rate limiter [B-18] | M | BE | F | `lib/ratelimit.ts`, routes: `availability`, `bookings`, `leads`, `signup`, `upload`, `support`, `broadcasts`, forgot/reset | Redis-backed (Upstash or equivalent) with an in-memory fallback in dev; limits survive cold starts and multiple instances; availability, upload and broadcasts are limited; `x-forwarded-for` handling documented; tests updated |
| S1-13 | Unify admin authorisation, harden `make-admin` [B-19] | S | BE | E | `lib/adminAuth.ts`, nine `app/api/admin/**` files, `app/admin/layout.tsx` | One `isAdminSession()` everywhere; an unset `SUPER_ADMIN_EMAIL` can never match; bootstrap secret compared in constant time and rate limited |
| S1-14 | Reserved slugs and slug rules [B-20] | S | BE | F | `lib/createBusiness.ts` | `admin`, `www`, `api`, `app`, `dashboard`, `login`, `signup`, `blog`, `help`, `b`, `crm`, `onboarding` and other fixed routes can never become a slug; unit test |
| S1-15 | Security headers and cookie settings [B-16] | S | BE | F | `next.config.mjs`, `lib/auth.ts` | CSP in report-only mode, HSTS, `X-Content-Type-Options`, `Referrer-Policy`, `frame-ancestors`; `poweredByHeader: false`; session `maxAge` chosen deliberately |
| S1-16 | Error boundaries and not-found [A-03] | S | FE | G | `app/error.tsx`, `app/global-error.tsx`, `app/not-found.tsx`, `app/b/[slug]/loading.tsx`, `app/[slug]/loading.tsx` | Unknown URL shows a branded 404 with a way home; a thrown error shows a branded retry page; no default Next.js error screen appears with the database unreachable; screenshots at 375px and 1440px |
| S1-17 | Logging, error tracking, health endpoint [B-17] | M | BE | F | `lib/logger.ts`, Sentry setup, `app/api/health/route.ts` | Structured logs with request id; no PII or secrets in logs; server and client errors reach Sentry; `/api/health` checks database reachability and returns no secrets |
| S1-18 | Dependency security updates [B-11] | M | BE | A | `package.json`, lockfile | `next` and `next-auth` on patched versions (stay on 14.x unless deliberately upgrading); `npm audit --omit=dev` shows no reachable critical or high; build, lint, typecheck, tests and a manual booking pass |
| S1-19 | Prisma migrations baseline; remove `db push` from the build [B-12] | M | BE | A, **blocks every schema change in Steps 2 to 8** | `package.json` (`build`), `prisma/migrations/*` | Baseline migration generated from the live schema and marked applied (`migrate resolve`); build runs `prisma generate` + `next build` only; deploys run `prisma migrate deploy`; CI check that the schema matches the migrations |
| S1-20 | Feature flag: payments off [D-00] | S | BE | A, **explicit authorisation: touches payment entry points only to hide them** | `lib/plans.ts` (flag), `app/dashboard/{billing,wallet,payments}`, `app/api/{razorpay,billing,wallet}`, `app/api/bookings` prepaid branch, pricing page | Env flag `PAYMENTS_ENABLED` (default false in production); prepaid mode, wallet, withdrawals and upgrade are hidden in the UI and return 404 or 503 from the API when off; documented; nothing else in payment code changes |
| S1-21 | Cron endpoint fails closed [B-10 part] | S | BE | E | `app/api/cron/reminders/route.ts` | Returns 401 in production when `CRON_SECRET` is unset or wrong; failed sends are not marked as sent; (full reminder rewrite is S5-02) |
| S1-22 | Upload hardening [B-36 part] | M | BE | E | `app/api/upload/route.ts`, `app/api/admin/blog/upload/route.ts`, `next.config.mjs` | Magic-byte check, allow-list jpg/png/webp (no SVG), extension derived from the verified type, size limit, per-tenant quota, plan check in the API, errors do not leak `err.message`; blob host added to `images.remotePatterns` |
| S1-23 | Broadcast safety quick fixes [B-33 part] | S | BE | E | `app/api/broadcasts/send/route.ts` | Business name and subject HTML-escaped; per-month limit enforced from `PlanConfig`; request capped to a safe batch size; (full rewrite is S5-10) |
| S1-24 | Test infrastructure and tenant-isolation suite [B-37 start] | M | QA | H | `tests/helpers/*`, `tests/api/*`, `vitest.config.ts` | Disposable test database and seed helper; helper to call route handlers with a fake session; for every dashboard route a cross-tenant test proves 404; tests run in CI-ready form; tests do not touch the dev database |
| S1-25 | Auth and validation regression tests | M | QA | H, after S1-05, S1-06, S1-09 | `tests/api/auth.test.ts`, `tests/api/validation.test.ts` | Mixed-case login, reset flow, resend, rate limits, malformed JSON, oversized input, unauthenticated access; evidence of pass counts |
| S1-26 | Security review of Step 1 | S | SEC | H, last | n/a (read-only) | Report by severity with file:line; no Critical or High open before Step 2 merges |

---

## Step 2 — Core booking engine

**Goal:** a booking engine salons and clinics can trust: correct under concurrency, correct in the business's timezone, per-staff, with time off and rules.
**Exit criteria:** 20 parallel requests for one slot yield exactly one booking; the same tests pass under `TZ=UTC` and `TZ=Asia/Kolkata`; two staff can be booked at the same time; time off and holidays block slots; plan limits apply on public bookings.

**Parallel plan.** The backend items share `lib/booking.ts` and the two booking routes, so they run mostly in sequence (lane A). Schema work for time off (S2-04) runs in lane B but merges before S2-03 finishes. All frontend items run in lanes C and D against the API contracts the BE publishes first.

| Lane | Agent | Items (in order) |
|---|---|---|
| A: engine | BE | S2-01 → S2-02 → S2-03 → S2-05 → S2-07 |
| B: data model | BE | S2-04, S2-08, S2-09, S2-10, S2-11 (each is its own migration; merge one at a time) |
| C: owner screens | FE | S2-13 → S2-14 → S2-16 (after their APIs) |
| D: calendar and booking page | FE | S2-15 → S2-17 |
| E: side effects | BE | S2-12 (after S2-02) |
| F: tests | QA | S2-18; SEC S2-19 last |

| ID | Title | Eff | Agent | Lane / depends | Files | Acceptance criteria |
|---|---|---|---|---|---|---|
| S2-01 | Business timezone; store UTC instants [B-05] | L | BE | A, after S1-19 | `prisma/schema.prisma` (`Business.timezone`), new `lib/time.ts`, `app/api/availability`, `app/api/bookings`, `app/api/appointments`, `app/api/cron/reminders`, `lib/email.tsx` (`.ics`, date labels), dashboard date formatting | Timezone chosen at signup (default `Asia/Kolkata`); `Appointment.date` is a true UTC instant; slot generation, display, emails, reminders and `.ics` use the business zone; migration converts existing rows; the same tests pass under `TZ=UTC` and `TZ=Asia/Kolkata`; DST case tested with a non-India zone |
| S2-02 | Atomic booking with locking [B-04] | M | BE | A, after S2-01 | `app/api/bookings/route.ts:67-141,243-253`, `app/api/appointments/route.ts`, `app/api/appointments/[id]/route.ts`, `lib/booking.ts` | Conflict check and insert in one `$transaction` with an advisory lock (or serialisable with retry); side effects run after commit; a concurrency test fires 20 requests at one slot and exactly one succeeds; owner-created bookings use the same check (with an explicit "allow overlap" option for the owner) |
| S2-03 | Per-staff availability engine [B-15] | L | BE | A, after S2-02 | `lib/booking.ts`, `app/api/availability`, `app/api/bookings`, `Staff.workingHours` schema and Zod, `StaffService` use | Availability and conflicts computed per staff; staff working hours and `StaffService` links enforced; "any available" picks a free staff member deterministically; two staff can be booked at 11:00; services only offer staff who perform them; unit tests for multi-staff, overlaps and capacity |
| S2-04 | Time off, holidays, breaks, notice, buffers, advance window [B-21] | L | BE | B (schema first), before S2-03 finishes | `prisma/schema.prisma` (`TimeOff`/`BlockedDate`, break fields, `minNoticeMinutes`, `maxAdvanceDays`, `Service.bufferMinutes`), `lib/booking.ts`, `app/api/availability`, new `app/api/time-off` | Owner can block dates or ranges for the business or a staff member, add a lunch break, set minimum notice and maximum advance days, set a per-service buffer; availability respects all of them; migration backwards compatible; tests |
| S2-05 | Public booking honours plan, active status, service state [B-06] | S | BE | A, after S2-03 | `app/api/bookings/route.ts:37-48`, `lib/plans.ts`, `lib/getFeatures.ts` | Expired or limit-exceeded business returns 402 with a friendly message on public bookings; inactive services rejected; limits read from the database (`getBusinessFeatures`), not code defaults; tests |
| S2-06 | Bound slot generation and settings inputs [B-07] | S | BE | A (with S2-01) | `app/api/availability/route.ts:6-18,36-41`, `lib/booking.ts` | `generateSlots` guards `step > 0` and a maximum slot count; malformed stored JSON falls back to defaults instead of 500; `slotInterval: 0` cannot hang the endpoint (regression test) |
| S2-07 | Reschedule and cancel rules on the server [B-22] | M | BE | A, after S2-05 | `app/api/appointments/[id]/route.ts:43-49`, `lib/booking.ts` | Reschedule to a past or conflicting time returns 409 or 400; elapsed slots today are not offered; cancel and no-show free the slot; transitions covered by tests |
| S2-08 | Phone-only clients and client dedupe [B-24] | M | BE | B | `prisma/schema.prisma` (`Client.email` optional, unique on phone), booking and appointment routes, validation | A booking works with phone only; clients de-duplicated by normalised email or phone within a business; mixed-case emails merge; migration safe; tests |
| S2-09 | Proper multi-service model [B-25] | M | BE | B | `prisma/schema.prisma` (`AppointmentService`), booking and appointment routes, dashboard queries, migration from `notes` `__services__:` | Services stored as rows with price and duration snapshots; old notes migrated; no code parses `notes` for services; analytics and exports use the new rows |
| S2-10 | Money and status types [B-26] | M | BE | B, after S2-09 | `prisma/schema.prisma`, all price/amount code, `lib/currency.ts` | Prices stored as integer minor units (or `Decimal`); `status`, `paymentStatus`, `paymentMode` as enums; migration converts data; no float arithmetic on money; tests (wallet code is Step 8 and is not touched here beyond type adaptation, which the owner must approve first) |
| S2-11 | Database indexes [B-27] | S | BE | B | `prisma/schema.prisma` | Indexes on `Appointment(businessId, date)`, `(staffId, date)`, `(date, reminderSent)`, `Client(businessId)`, `Notification(businessId, createdAt)`, `VerificationToken(email)`, `(expiresAt)`; `EXPLAIN` on availability and dashboard queries shows index use |
| S2-12 | Non-blocking side effects [B-28] | M | BE | E, after S2-02 | `app/api/bookings/route.ts:160-192`, `lib/email.tsx`, `lib/whatsapp.ts`, `lib/push.ts` | Email, WhatsApp and push run after the response using `after()`; failures are recorded in `EmailLog` and visible to the owner; booking response time no longer depends on providers (groundwork for the Step 5 outbox) |
| S2-13 | Staff working hours editor and service assignment [new] | M | FE | C, after S2-03 API | `app/dashboard/staff/StaffClient.tsx`, `app/dashboard/services/ServicesClient.tsx`, `components/ui/*` | Owner sets each staff member's weekly hours and which services they perform; the booking page only offers matching staff; works at 375px; labelled inputs; screenshots |
| S2-14 | Time off, holidays, breaks, notice and buffer settings [new] | M | FE | C, after S2-04 API | `app/dashboard/settings/SettingsClient.tsx`, new `app/dashboard/time-off` | Owner can add a holiday, staff leave and a lunch break in under a minute on a phone; set notice and advance rules; empty states explain each; screenshots |
| S2-15 | Calendar usable on a phone [A-13 + new] | M | FE | D | `app/dashboard/calendar/*` | Default to Day view at 375px with readable event cards; week view horizontally scrollable with a sticky time column; staff filter; month view; tap an empty slot to create a booking; screenshots |
| S2-16 | Appointment management screens: reschedule, delete, confirm, no-show [new] | M | FE | C, after S2-07 | `app/dashboard/appointments/AppointmentsClient.tsx` | Owner can reschedule from the booking window (conflicts shown), cancel with a reason, mark no-show or complete in one tap, and delete from the list with confirmation; client email behaviour unchanged from the API |
| S2-17 | Booking page polish [A-28, A-29] | M | FE | D, after S2-01 and S2-03 | `app/b/[slug]/BookingClient.tsx` | Step names visible at 375px; "Taken" badge no longer overlaps the time; helper text explains a disabled Continue; timezone shown; elapsed times today hidden; group spots shown; screenshots |
| S2-18 | Booking-engine test suite [B-37] | L | QA | F | `tests/booking/*`, `tests/e2e/booking.spec.ts` | Concurrency, per-staff, time-off, notice and buffer, plan limit and tenant-isolation tests; every test passes under both time zones; Playwright journey at 375px and 1440px; pass counts reported |
| S2-19 | Security review of Step 2 | S | SEC | F, last | n/a | No Critical or High open; special attention to lock misuse, IDOR on staff and time-off routes |

---

## Step 3 — Industry Packs + design system

**Goal:** one consistent, accessible design system, and **Industry Packs**: a business picks one of the six launch packs (**Salon, Clinic (with a Dental variant), Spa, Fitness / Trainer, Consultant / Lawyer / Coach, Other (generic)**) and gets sensible services in INR, working hours, slot spacing, website copy, message templates and sample data in English and Hindi, ready in minutes.
**Exit criteria:** no hard-coded colours or arbitrary font sizes outside tokens; DOM checks report zero unlabelled inputs, zero nameless buttons, titles unique; a new owner completes the "get live" checklist in under 5 minutes on a phone; screenshots at 375px and 1440px for every page.

**Parallel plan.** The design-system work (lane A) must land its tokens and component kit before page-by-page accessibility (lane B) starts, because both touch `components/ui/*`. The Industry Pack engine (lane C) is backend-first and independent; pack content (lane D) runs after the engine.

| Lane | Agent | Items (in order) |
|---|---|---|
| A: tokens and kit | FE | S3-01 → S3-02 |
| B: accessibility and states (after A) | FE (split by area so files do not overlap: B1 auth + booking, B2 dashboard, B3 admin + marketing structure) | S3-03, S3-04, S3-05 |
| C: pack engine | BE | S3-06, S3-13 |
| D: pack content and onboarding (after C) | FE | S3-07 to S3-10, S3-19, S3-20 (one per pack, parallel with each other, separate files), then S3-11, S3-12 |
| E: i18n | BE then FE | S3-14 |
| F: tests | QA | S3-16, S3-17; SEC S3-18 |

| ID | Title | Eff | Agent | Lane / depends | Files | Acceptance criteria |
|---|---|---|---|---|---|---|
| S3-01 | Design tokens and type scale [A-18, A-19, A-21] | M | FE | A | `app/globals.css`, `tailwind.config.ts`, `app/layout.tsx`, tokens doc | One documented token set (ink, muted, border, surface, accent, status, radius, shadow, type scale); platform accent vs per-tenant colour separated; font variables renamed to match the fonts loaded; hard-coded `#6b6b80`, `#e8e6e0`, `#f8f7f4` replaced by tokens; arbitrary `text-[Npx]` removed |
| S3-02 | Component kit consolidation [A-20] | L | FE | A, after S3-01 | `components/ui/*`, the 53 files with raw `<button>`, stat tiles, modals, admin `Field` | One `Button`, `Input` (label and id generated by default), `Card`, `StatCard`, `Modal` (focus trap, Escape), `Select`, `Badge`, plus new `EmptyState`, `ErrorState`, `Toast`; duplicates removed; before/after screenshots show no regressions |
| S3-03 | Accessibility pass [A-09, A-10, A-11, A-12, A-15, A-16, A-17] | L | FE | B1/B2/B3, after S3-02 | auth + booking pages; dashboard pages; admin pages | `DOM-CHECKS`: zero unlabelled inputs, zero nameless icon buttons, tap targets under 44px reduced to documented decorative exceptions, no content text under 12px, contrast at least 4.5:1 verified with a tool, visible focus, unique titles, one `<h1>`; hydration warnings fixed (`ClientsClient.tsx:76-99`, `PlansClient.tsx:283`) |
| S3-04 | Mobile layout fixes [A-04, A-14] | M | FE | B3, after S3-02 | `components/landing/Hero.tsx` and `PhoneMockups.tsx` (layout only, no copy or claims), `app/dashboard/settings/SettingsClient.tsx`, `app/signup/page.tsx` | No horizontal scroll or clipped content at 375px on any audited page; settings tabs scroll or stack; signup fields stack below `sm`; screenshots |
| S3-05 | Loading, empty and error states everywhere [A-26, A-03 extension] | L | FE | B2, after S3-02 | all `app/dashboard/**`, `app/admin/**`, `app/blog`, `app/help`, tenant site | Every data view has loading, empty and error states; zero values read "No data yet"; KPI tiles never show misleading `$0`/`100%`; verified with a brand-new account that has a business |
| S3-06 | Industry Pack engine with variants [new] | L | BE | C | new `lib/packs/index.ts`, `lib/packs/schema.ts` (Zod), `lib/createBusiness.ts`, `app/api/onboarding`, `app/api/signup` | A pack is a validated config with optional **variants** that extend it (Clinic has a Dental variant, picked at onboarding): id, label (en/hi), services (name, duration, price in INR, category, colour, capacity), default hours and slot interval, buffers, website copy and image keys, message template keys, expense categories, sample staff roles; applying a pack at signup is idempotent and runs in one transaction; unit tests; packs never overwrite existing data |
| S3-07 | Pack: Salon (hair, barber, beauty) [new] | M | FE | D, after S3-06 | `lib/packs/salon.ts`, images | 8 to 12 realistic services with INR prices and durations, hours, buffers, website copy in English and Hindi, template keys; reviewed for plausibility with the owner |
| S3-08 | Pack: Clinic, with a Dental variant [new] | M | FE | D, after S3-06 | `lib/packs/clinic.ts`, `lib/packs/clinic-dental.ts` | Same standard; the base clinic pack covers consultation, follow-up and common general-practice and physiotherapy style services; the dental variant adds check-up, cleaning, filling, root canal consult and orthodontic consult with dental-appropriate durations and buffers; wording avoids medical claims; privacy note placeholder |
| S3-09 | Pack: Spa and wellness [new] | M | FE | D, after S3-06 | `lib/packs/spa.ts` | Same standard; packages placeholder for Step 4 |
| S3-10 | Pack: Fitness / Trainer (personal training, yoga, group classes) [new] | M | FE | D, after S3-06 | `lib/packs/fitness.ts` | Same standard; one-to-one and group-class oriented services; recurring and class placeholders for Step 4 |
| S3-11 | Onboarding wizard and "get live" checklist [A-24, A-25, A-26 part] | M | FE | D, after S3-06 and S3-07 | `app/onboarding/*`, `app/dashboard/page.tsx`, `components/dashboard/GetLiveChecklist.tsx`, `app/dashboard/booking-page/BookingPageClient.tsx` | After signup the owner chooses one of the six packs (and the Dental variant under Clinic), confirms services and hours, and sees share tools (copy link, WhatsApp share, QR download); checklist hides when complete; works at 375px; a fresh account reaches a shareable booking page in under 5 minutes |
| S3-12 | Tenant website defaults and imagery [A-08, A-30] | M | FE | D, after S3-06 | `lib/website.ts:95-102`, `app/[slug]/page.tsx` | "Professional services services" bug fixed (unit test); imagery and copy come from the pack; opaque nav on photo hero; tenant colour chosen at onboarding, not a hard-coded red |
| S3-13 | India defaults [A-33, C17] | S | BE | C | `prisma/schema.prisma` (`Business.currency` default INR), signup REGIONS, phone validation, formatting | INR, IST, `+91` and Indian number formatting preselected; 10-digit validation; migration only changes the default, not existing rows |
| S3-14 | i18n scaffolding and Hindi [A-32] | L | BE then FE | E | new `lib/i18n/*`, `app/b/[slug]`, `app/[slug]`, `emails/templates.tsx` | Strings externalised; English and Hindi for the public booking page, tenant website and client emails; language set per business and selectable by the client; Devanagari renders correctly; missing keys fall back to English; tests |
| S3-15 | One lead form component [A-20 part] | M | FE | B3 | `components/landing/*` (structure only; claims and pricing copy untouched) | Eight lead-capture components replaced by one configurable `LeadForm`; no change to wording of claims; page weight and mobile height reduced |
| S3-16 | Visual baselines and DOM budget [new] | M | QA | F, after S3-03 | `tests/e2e/visual.spec.ts`, `scripts/audit-checks.ts` | Playwright screenshots at 375px and 1440px for all audited pages with baselines; DOM-check budget (unlabelled inputs 0, nameless buttons 0, no horizontal scroll) fails the run when exceeded |
| S3-17 | Pack and onboarding tests | M | QA | F, after S3-11 | `tests/packs/*`, `tests/e2e/onboarding.spec.ts` | All six packs and the dental variant validate; applying a pack twice is harmless; onboarding journey passes at both widths; pass counts reported |
| S3-18 | Security review of Step 3 | S | SEC | F, last | n/a | Tenant-controlled values (colour, copy, images) cannot inject CSS or HTML; no Critical or High open |
| S3-19 | Pack: Consultant / Lawyer / Coach [new] | M | FE | D, after S3-06 | `lib/packs/consultant.ts` | Same standard; initial consultation, follow-up and hourly-session style services with INR fees, longer buffers, phone and video-call friendly wording; for legal use the pack provides scheduling only (no legal-advice wording) and a confidentiality note placeholder |
| S3-20 | Pack: Other (generic) [new] | S | FE | D, after S3-06 | `lib/packs/other.ts` | A neutral pack with one editable starter service, default hours and neutral website copy in English and Hindi; used when no other pack fits; never claims an industry |

---

## Step 4 — Booking modes

**Goal:** booking works the way different businesses actually run: instant confirm, request-and-approve, walk-in and queue, classes, recurring sessions and packages, rooms and chairs, and clients can manage their own booking.
**Exit criteria:** each mode works end to end on 375px, is selectable per business or per service, and has tests; clients can cancel or reschedule from a signed link.

**Parallel plan.** `S4-01` (mode model) goes first. After it, lane A (request flow), lane B (classes), lane C (walk-in/queue) and lane D (client manage link) can run in parallel because each owns separate routes and tables; the shared booking route is edited only by lane A. Frontend items follow their APIs.

| Lane | Agent | Items |
|---|---|---|
| A: modes core | BE | S4-01 → S4-02 → S4-04 |
| B: classes and recurring | BE | S4-06 → S4-07 (after S4-01) |
| C: walk-in and queue | BE | S4-05 (after S4-01) |
| D: client self-service | BE | S4-03 (after S4-04 for the policy values) |
| E: resources | BE | S4-08 (after S4-01) |
| F: screens | FE | S4-10 (settings), S4-09 (widget), then per-mode screens as APIs land |
| G: tests | QA, SEC | S4-12, S4-13 |

| ID | Title | Eff | Agent | Lane / depends | Files | Acceptance criteria |
|---|---|---|---|---|---|---|
| S4-01 | Booking mode model [new] | M | BE | A (first) | `prisma/schema.prisma` (`bookingMode` enum on business and service: INSTANT, REQUEST, WALK_IN, CLASS), `lib/booking.ts`, validation | Mode stored per business with optional per-service override; default INSTANT keeps today's behaviour; migration backwards compatible; unit tests for mode resolution |
| S4-02 | Request-to-book with owner approval [new] | L | BE | A, after S4-01 | `app/api/bookings`, `app/api/appointments/[id]`, notification code | Client request creates a PENDING booking that holds the slot for a configurable time; owner approve or decline (reason) frees or confirms; client is told by email at each step; unanswered requests expire; tests |
| S4-03 | Client manage link: cancel and reschedule [B-34] | L | BE | D, after S4-04 | new `app/m/[token]/page.tsx`, `app/api/manage/*`, email templates | Every confirmation and reminder contains a signed, expiring link; client sees the booking and can cancel or reschedule within the policy; owner is notified; token tampering, expiry and reuse tested; no account needed |
| S4-04 | Cancellation and reschedule policy [new] | M | BE | A, after S4-02 | `prisma/schema.prisma`, settings, `app/api/appointments/[id]` | Per business and per service: cut-off hours, maximum reschedules, free vs not-allowed after cut-off (fee mechanics are Step 8); enforced on the manage link and shown to the client before booking |
| S4-05 | Walk-in and queue [new] | L | BE | C, after S4-01 | `app/api/walk-ins/*`, schema (`QueueEntry`), `lib/booking.ts` | Owner adds a walk-in in two taps (name and phone only); estimated wait computed from current queue; "now serving" and "next" states; optional queue token message to the client; converts to a normal appointment; tests |
| S4-06 | Classes and group sessions with attendance and waitlist [C7] | L | BE | B, after S4-01 | schema (`Session`, `Enrollment`, `WaitlistEntry`), `app/api/classes/*` | Fixed-schedule sessions with capacity, enrol and cancel, automatic waitlist promotion, attendance marking; replaces the "same start time capacity" shortcut; migration keeps existing group bookings working; tests |
| S4-07 | Recurring appointments and packages [C6] | L | BE | B, after S4-06 | schema (`RecurrenceRule`, `Package`, `PackageUse`), `app/api/recurring/*` | Weekly or custom recurrence with conflict handling per occurrence; packages as session credits that decrement on completion; package purchase is recorded manually (online payment is Step 8); tests |
| S4-08 | Resources: rooms and chairs [C5] | M | BE | E, after S4-01 | schema (`Resource`, service-resource links), `lib/booking.ts` | Optional per-service resource requirement; availability considers resource conflicts as well as staff; tests |
| S4-09 | Chat and embeddable widget parity [A-31] | M | FE | F | `components/chatbot/ChatWidget.tsx`, `app/b/[slug]/BookingClient.tsx` | One shared booking core component; widget includes provider choice and uses the same validation and modes; an embed snippet works on an external site; copyable from the dashboard; screenshots |
| S4-10 | Mode and policy settings screens [new] | M | FE | F, after S4-01 and S4-04 | `app/dashboard/settings/*` | Owner chooses the mode and cancellation policy in plain language with examples; per-service override; works at 375px |
| S4-11 | Per-mode owner screens [new] | L | FE | F, after S4-02, S4-05, S4-06 | `app/dashboard/requests`, `queue`, `classes`, `packages` | Requests inbox with approve and decline; queue board; class schedule and attendance; package balances; empty and error states |
| S4-12 | Booking-mode test suites | L | QA | G | `tests/modes/*`, `tests/e2e/modes.spec.ts` | Every mode: happy path, edge cases, concurrency (last class seat, queue ordering), expiry, token security; pass counts reported |
| S4-13 | Security review of Step 4 | S | SEC | G, last | n/a | Signed-token handling, enumeration of booking ids, abuse of request mode, rate limits on public manage routes; no Critical or High open |

---

## Step 5 — Messaging with an OpenWA adapter

**Goal:** messages that actually arrive, in the client's language, with consent and a record of what was sent, over a provider interface so WhatsApp can be delivered by the official Cloud API, by a self-hosted OpenWA session, or by click-to-chat links.
**Exit criteria:** confirmations and reminders go through one outbox with retries and delivery status; the provider is selectable per business; opt-out works; owners can see what was sent.

**Decision (OpenWA).** OpenWA is **opt-in per business**. **Each business connects its own WhatsApp number by scanning a QR code; there is no shared Calvy number.** Calvy recommends a **separate business number, not a personal one**, and says so on the connect screen. Each business gets its own isolated OpenWA session.

**Risk note (OpenWA).** OpenWA drives a normal WhatsApp account through WhatsApp Web. It is an unofficial route: it can break when WhatsApp changes, and WhatsApp can ban numbers that automate messages, which would hit the business's own number. The adapter is therefore **optional, per business, off by default, opt-in messages only, with strict throttling**; the official Cloud API with approved templates remains the recommended default, and click-to-chat links remain the always-available fallback. This is documented in the owner screens and in `docs/messaging.md`.

**Parallel plan.** `S5-01` (provider interface and outbox) goes first. After it, the providers (lanes A, B, C) are independent files and run in parallel; the reminder scheduler (lane D) and consent (lane E) follow. Frontend items follow their APIs.

| Lane | Agent | Items |
|---|---|---|
| A: core | BE | S5-01 → S5-02 |
| B: email | BE | S5-03 (after S5-01) |
| C: WhatsApp Cloud API | BE | S5-04 (after S5-01) |
| D: OpenWA | BE | S5-05 (after S5-01) |
| E: consent and broadcasts | BE | S5-07 → S5-10 (after S5-01) |
| F: screens | FE | S5-06, S5-08, S5-09, S5-11, S5-17 (after their APIs) |
| G: optional SMS | BE | S5-14 (only if the owner wants SMS) |
| H: tests | QA, SEC | S5-15, S5-16 |

| ID | Title | Eff | Agent | Lane / depends | Files | Acceptance criteria |
|---|---|---|---|---|---|---|
| S5-01 | Messaging core: provider interface, outbox, retries, status [new, extends B-28] | L | BE | A (first), after S2-12 | new `lib/messaging/{provider.ts,outbox.ts,dispatcher.ts}`, schema (`MessageJob`, generalised `MessageLog`), `lib/email.tsx`, `lib/whatsapp.ts` | One `MessageProvider` interface (`send`, `status`, `healthCheck`, supported channels); all outgoing messages are queued in an outbox with idempotency keys, retry with backoff, dead-letter state and delivery status; a fake provider for tests; existing email and WhatsApp code moved behind it with unchanged behaviour |
| S5-02 | Reminder scheduler rewrite [B-10, C11] | L | BE | A, after S5-01 and S2-01 | `app/api/cron/reminders/route.ts`, schema (`reminderSentAt`, send-time rules), `lib/messaging/*` | Reminders at configurable offsets (24h and 2h) computed in the business timezone; row claimed before send so concurrent runs never double-send; failures retried, never marked sent; bounded concurrency and batching; plan flags respected; runs more often than daily via the scheduler from S7-06 |
| S5-03 | Email deliverability and identity [B-14] | M | BE | B, after S5-01 | `lib/email.tsx:16-17`, env, `app/api/webhooks/resend`, DNS notes | Production refuses to start with the sandbox sender; verified domain with SPF, DKIM, DMARC; `Reply-To` is the business email and the display name is the business; bounce and complaint webhooks mark the log and suppress the address |
| S5-04 | WhatsApp Cloud API provider with templates [B-13] | L | BE | C, after S5-01 | new `lib/messaging/providers/whatsapp-cloud.ts`, template registry, `app/api/webhooks/whatsapp` | Template messages (`type: "template"`) for confirmation, reminder, cancel, reschedule, with language variants; E.164 normalisation with `+91` default; delivery-status webhook stored; verification of the webhook signature; no phone numbers in logs; per-business sender number supported |
| S5-05 | OpenWA provider adapter: one session per business [new] | L | BE | D, after S5-01 | new `lib/messaging/providers/openwa.ts`, `docs/messaging.md`, schema (`MessagingProviderConfig` with per-business `sessionId`, status, `connectedNumber`) | Implements `MessageProvider` against a self-hosted OpenWA service (URL and token from validated config, SSRF-safe allow-list) with **a separate session per business**: create a session, return the pairing QR, report status (waiting for scan, connected, disconnected), disconnect and delete the session; a business's messages only ever go out through that business's own session and number, with no fallback to a shared Calvy number; per-session throttle and daily cap; opt-in only; automatic fallback to click-to-chat when the session is unhealthy; the connect screen recommends a separate business number rather than a personal one and states the ban risk; off by default; contract tests against a fake OpenWA server, including isolation between two businesses |
| S5-06 | Click-to-chat and share tools [A-25] | S | FE | F | `app/dashboard/booking-page/BookingPageClient.tsx`, `app/dashboard/appointments/*` | One tap opens WhatsApp with a prefilled confirmation or reminder to the client; copy-link and QR share; works without any provider configured |
| S5-07 | Consent, opt-out and suppression [C12] | M | BE | E, after S5-01 | schema (`Consent`, `Suppression`), booking form field, manage link, message footer | Consent captured at booking (channel-specific); every marketing message carries an unsubscribe action; suppressed addresses and numbers are never messaged; transactional messages are distinguished from marketing; tests |
| S5-08 | Message template editor [new] | L | FE | F, after S5-01 and S3-06 | `app/dashboard/settings/messages`, `lib/messaging/templates.ts` | Owner edits confirmation, reminder, cancel and reschedule text with variables and live preview in English and Hindi; defaults come from the Industry Pack; WhatsApp templates show their approval status; works at 375px |
| S5-09 | Messages log and delivery UI [new] | M | FE | F, after S5-01 | `app/dashboard/messages` | Owner sees what was sent to whom, when, over which channel, delivered or failed with a plain reason, and can resend or use click-to-chat |
| S5-10 | Broadcasts rewrite [B-33] | L | BE | E, after S5-07 | `app/api/broadcasts/*`, `app/dashboard/broadcasts/*` (FE part split into S5-11) | Audience segments (all, recent, lapsed), consent respected, per-month limit enforced from the plan, sent through the outbox in chunks, business name and subject escaped, preview and test-send |
| S5-11 | Broadcasts screens [new] | M | FE | F, after S5-10 | `app/dashboard/broadcasts/*` | Segment picker, preview, scheduled send, history with delivery counts, empty and error states |
| S5-12 | Staff notifications [new] | M | BE | E, after S5-01 | `lib/messaging/*`, notification code | Staff (not only the owner) can be notified of their bookings by push, WhatsApp or email according to preference (staff logins arrive in Step 6; until then via the staff phone number) |
| S5-13 | Localised client messages [A-32 link] | M | BE | E, after S3-14 | `emails/templates.tsx`, WhatsApp templates | Client messages sent in the language chosen at booking; tests for English and Hindi rendering |
| S5-14 | SMS provider (optional, DLT) [B-35] | L | BE | E (optional, can be dropped) | `lib/messaging/providers/sms.ts` | Only if the owner decides to offer SMS; otherwise this item is closed and every SMS claim stays removed |
| S5-15 | Messaging test suite | L | QA | G | `tests/messaging/*` | Provider contract tests with the fake provider and fake OpenWA; template rendering; idempotency; retry and dead-letter; consent and suppression; timezone of reminders; pass counts reported |
| S5-16 | Security review of Step 5 | S | SEC | G, last | n/a | Webhook signature verification, SSRF through the OpenWA URL, secrets storage, PII in logs, injection in templates; no Critical or High open |
| S5-17 | WhatsApp connect screen (QR pairing) [new] | M | FE | F, after S5-05 | `app/dashboard/settings/whatsapp`, `components/ui/*` | Owner opts in and scans the QR with the WhatsApp app on **their own business number**; sees waiting, connected and disconnected states with plain-language help; can disconnect; clear text recommends a separate business number and explains the risk of automated messaging; loading, empty and error states; works at 375px; screenshots |

---

## Step 6 — Team & mobile

**Goal:** the whole team can use Calvy from a phone, each seeing only what they should; the installed app feels native.
**Exit criteria:** an owner can invite a receptionist and a stylist; the stylist sees only their own day; permission tests pass for every route; the PWA installs and opens the dashboard.

**Parallel plan.** `S6-01` (roles model) blocks the rest of the backend work. After it, authorisation sweep (lane A) and invites (lane B) run in parallel only if the sweep does not edit invite files; frontend lanes follow the APIs.

| Lane | Agent | Items |
|---|---|---|
| A: roles | BE | S6-01 → S6-02 |
| B: invites and account | BE | S6-03 (after S6-01), S6-08 |
| C: calendar feeds | BE | S6-09 |
| D: team screens | FE | S6-04, S6-05 (after S6-02) |
| E: PWA | FE (+BE for push) | S6-06, S6-07 |
| F: audit log | BE | S6-10 (after S6-02) |
| G: tests | QA, SEC | S6-12, S6-13 |

| ID | Title | Eff | Agent | Lane / depends | Files | Acceptance criteria |
|---|---|---|---|---|---|---|
| S6-01 | Staff logins and roles model [B-31] | L | BE | A (first) | `prisma/schema.prisma` (user-to-staff link, role enum: owner, manager, receptionist, staff), `lib/auth.ts`, new `lib/permissions.ts` (`can(user, action, resource)`) | Roles and a permission matrix defined once; JWT carries role and staff id; one owner per business remains; migration keeps existing owners as owners; unit tests for the matrix |
| S6-02 | Authorisation sweep [B-31] | L | BE | A, after S6-01 | every `app/api/**` route that is not admin or payment, dashboard server pages | Each route calls `can()`; staff see only their own appointments and clients' basic details; receptionist can book and manage but not billing or settings; cross-role tests per route |
| S6-03 | Invite flow [B-31] | M | BE | B, after S6-01 | `app/api/team/*`, `emails/templates.tsx` | Owner invites by email or phone; single-use expiring invite; role chosen; revoke and re-send; invited user sets a password; tests |
| S6-04 | Team screens: invites and roles [new] | M | FE | D, after S6-03 | `app/dashboard/staff/*`, `app/dashboard/team` | Owner invites, changes role, deactivates a member; role explained in plain language; works at 375px |
| S6-05 | Staff mobile experience: "My day" [new] | L | FE | D, after S6-02 | `app/dashboard/page.tsx` variant, bottom navigation by role, `app/dashboard/calendar` | A stylist opens the app to today's bookings in one screen; one-tap check-in, complete, no-show; own calendar only; owner navigation pruned per role; tap targets at least 44px; screenshots per role at 375px |
| S6-06 | PWA hardening [new] | M | FE | E | `public/manifest.json` (`start_url: /dashboard`), `public/sw.js`, install prompt, icons | Installed app opens the dashboard; update prompt when a new version ships; offline read-only view of today's schedule; Lighthouse PWA checks pass; screenshots |
| S6-07 | Push per user and preferences [new] | M | BE + FE | E, after S6-01 | `lib/push.ts`, `app/api/push/*`, notification settings screen | Push subscriptions belong to a user, not only a business; each user chooses which events they receive; permission prompt shown at a sensible moment; tests |
| S6-08 | Account export and deletion [B-32] | M | BE | B | `app/api/account/*`, settings screen (FE part under S6-04 review) | Owner exports business data (CSV and JSON) and can delete the account; a client's data can be erased on request; documented in the privacy page text for Step 9 |
| S6-09 | Calendar feeds [C20] | M | BE | C | `app/api/calendar/[token]/feed.ics` | A private, revocable iCal feed per staff member and for the owner that Google, Apple and Outlook calendars can subscribe to; times correct in the business timezone; two-way Google sync recorded as a later item |
| S6-10 | Audit log [new] | M | BE | F, after S6-02 | schema (`AuditLog`), `lib/audit.ts`, admin and owner viewing | Who changed what and when for bookings, staff, services, settings and plan changes; owner sees their own business log; no PII beyond ids |
| S6-11 | Multiple locations (optional) [C22] | L | BE | after S6-02 | schema (`Location`), booking and availability | Only if the owner chooses to support chains; otherwise deferred to after launch |
| S6-12 | Role and permission test matrix | L | QA | G | `tests/permissions/*`, `tests/e2e/team.spec.ts` | Every route tested for each role (allowed and denied); invite abuse cases; Playwright journey per role at 375px; pass counts reported |
| S6-13 | Security review of Step 6 | S | SEC | G, last | n/a | Privilege escalation, invite-token handling, push subscription ownership, feed token leakage; no Critical or High open |

---

## Step 7 — Deployment & ops

**Goal:** repeatable, observable, recoverable deployments and a tested rollback, before real customers arrive.
**Exit criteria:** CI blocks a merge that fails lint, typecheck, tests, build, smoke tests or the audit gate; staging mirrors production; a restore drill has been done; alerts reach a human.

**Parallel plan.** Mostly infrastructure and configuration, so files rarely overlap with app code. `S7-01` (CI) goes first; the rest run in parallel by area.

| Lane | Agent | Items |
|---|---|---|
| A: CI and environments | BE | S7-01 → S7-02 → S7-03 |
| B: observability and ops docs | BE | S7-04, S7-05, S7-14 |
| C: scheduling and jobs | BE | S7-06 |
| D: storage | BE | S7-07 |
| E: performance | FE + BE (separate files) | S7-08 |
| F: OpenWA hosting | BE | S7-09 |
| G: tests and review | QA, SEC | S7-13, S7-15 |

| ID | Title | Eff | Agent | Lane / depends | Files | Acceptance criteria |
|---|---|---|---|---|---|---|
| S7-01 | Continuous integration | M | BE | A (first) | `.github/workflows/ci.yml` | On every pull request: install, `npm run lint`, `npx tsc --noEmit`, `npm test`, `npm run build` against an ephemeral database with `prisma migrate deploy`, Playwright smoke at 375px and 1440px, `npm audit --omit=dev` gate, DOM-check budget; the workflow fails honestly and posts the summary |
| S7-02 | Environments: dev, staging, production | M | BE | A | Vercel project settings, Neon branches, `docs/environments.md` | Separate databases and secrets per environment; preview deployments use a Neon branch; production secrets never reach previews; staging has seeded test accounts, production never does |
| S7-03 | Migration release process | S | BE | A, after S7-02 | `docs/release.md`, CI release job | `prisma migrate deploy` runs once per release before traffic; a failed migration blocks the deploy; documented rollback (forward-fix policy, backups first) |
| S7-04 | Observability and alerting [B-17 follow-up] | M | BE | B | Sentry config, uptime monitor, log drain, cron monitor | Errors, slow queries and failed jobs alert a named person; uptime check on `/api/health` and a booking page; dashboards for outbox failures and cron runs |
| S7-05 | Backups and restore drill | M | owner + BE | B | Neon PITR settings, `docs/runbooks/restore.md` | Point-in-time recovery enabled; a restore into a scratch database is performed and verified; recovery time recorded |
| S7-06 | Scheduler for reminders and outbox | M | BE | C | `vercel.json` or an external scheduler/queue, `app/api/cron/*` | Reminder and outbox workers run at least every 5 minutes; protected by the cron secret; job health visible; no duplicate runs cause duplicate sends |
| S7-07 | Storage adapter [B-36] | M | BE | D | `lib/storage/*`, upload routes | Adapter for Vercel Blob or S3/R2 with local-disk in development; quotas; old files deleted on replace; app runs without Vercel services |
| S7-08 | Performance budget | M | FE + BE | E | `tests/perf/*`, bundle config, query review | Lighthouse performance budget on throttled mobile for the booking page and dashboard; heaviest queries explained and indexed; availability cached safely; image optimisation |
| S7-09 | OpenWA hosting for many sessions | M | BE | F, after S5-05 | `deploy/openwa/docker-compose.yml`, `docs/messaging.md` | Separate container or VM sized for one session per connected business (memory and CPU per session measured, a maximum number of sessions enforced with a clear message); isolated persistent per-business session storage; secret management; health check and restart policy with automatic session restore; never co-located with the app's database credentials |
| S7-10 | Secrets management and rotation procedure | S | BE | A | `docs/secrets.md` | Where each secret lives, who can read it, rotation steps and dates; confirms nothing sensitive remains in the repository |
| S7-11 | Dependency automation | S | BE | A | `.github/dependabot.yml` | Weekly update pull requests; security updates grouped; major framework upgrades flagged for a decision |
| S7-12 | Feature flags | S | BE | A | `lib/flags.ts` | Database or env flags for payments, OpenWA, request mode, classes; changes without redeploy; admin can view them |
| S7-13 | Load test | M | QA | G | `tests/load/*` (k6 or similar) | The booking path and availability endpoint sustain a stated number of concurrent users within latency targets; rate limits verified; no double bookings under load |
| S7-14 | Runbooks | M | BE | B | `docs/runbooks/*` | Incident response, rollback, database restore, WhatsApp number ban, email deliverability drop, leaked secret |
| S7-15 | Security review: infrastructure and headers | S | SEC | G, last | n/a | CSP moved from report-only to enforced with no regressions; transport, cookies, secrets handling, CI permissions; no Critical or High open |
| S7-16 | Domains, wildcard TLS and email DNS | S | owner + BE | A | DNS, Vercel domains | Wildcard subdomain certificate works; SPF, DKIM, DMARC verified; slug routing tested on the real domain |

---

## Step 8 — Monetization

**Goal:** charge customers correctly and safely, in rupees, with limits that match what the plans promise.
**This is the only step that works on payment gateway code, and only for the items below.**
**Exit criteria:** the payments review passes with tests in Razorpay test mode; plan limits shown are the plan limits enforced; trial, downgrade and expiry behave as documented.

**Parallel plan.** Plan-limit and trial work (lane A) does not touch gateway code and can start immediately. Gateway work (lane B) is sequential and must not overlap with lane A's files (`lib/plans.ts` is owned by lane A).

| Lane | Agent | Items |
|---|---|---|
| A: plans, limits, trial | BE | S8-03 → S8-04 → S8-05 → S8-06 |
| B: payments (explicitly authorised) | BE | S8-01 → S8-02 → S8-07 → S8-08 → S8-09 → S8-10 → S8-11 |
| C: billing screens | FE | S8-12 (after lane A and S8-07) |
| D: admin | BE then FE | S8-13 |
| E: tests and review | QA, SEC | S8-16, S8-17 |

| ID | Title | Eff | Agent | Lane / depends | Files | Acceptance criteria |
|---|---|---|---|---|---|---|
| S8-01 | Payments security review and fixes [D-01] | M | BE | B (first), **authorised** | `app/api/razorpay/webhook`, `app/api/billing/webhook` | Constant-time signature checks on the raw body, idempotency keys, replay protection, amounts verified server-side, events stored; reviewed by SEC before anything else in this lane |
| S8-02 | Slot hold during prepaid checkout [D-02] | M | BE | B, after S8-01 and S2-02 | `app/api/bookings` prepaid branch, schema | A pending booking holds the slot for N minutes; the webhook confirms or releases it; no paid booking can land on a taken slot; tests |
| S8-03 | One source of truth for plans, in INR [A-07 product side] | M | BE | A | `lib/plans.ts`, `PlanConfig`, `app/admin/plans`, seed | INR prices and limits live in the database only; code defaults used just for seeding; the plan table in the admin, billing screen and API enforcement all read the same values (fixes the code-default vs database drift) |
| S8-04 | Enforce limits and flags truthfully [new] | M | BE | A, after S8-03 | `app/api/bookings`, cron and messaging code, `app/api/broadcasts`, `app/api/support`, upload, settings | Every flag and limit shown on the plan is enforced in the API as well as the page: public bookings, email and WhatsApp reminders, broadcasts per month, image upload, slot interval, group booking, CSV export; support tickets available to every plan (priority is a speed, not access); tests per flag |
| S8-05 | Real trial or no trial [new] | M | BE | A, after S8-03 | `lib/plans.ts` (`isActivePlan`, `trialDaysLeft`), `lib/createBusiness.ts`, admin tenants | Decision recorded: either a working 14-day trial of a paid plan (start date, end date, banner, automatic move to Free) or all trial wording removed; admin "extend trial" works or is removed; tests for expiry |
| S8-06 | Downgrade and over-limit handling [new] | M | BE | A, after S8-05 | plan transition code, dashboard guards | On downgrade or expiry: grace period, over-limit items stay readable, extra staff or services are soft-locked rather than deleted, owner is told what changed and how to restore; tests |
| S8-07 | Subscription billing in INR with GST invoices [D-03] | L | BE | B, after S8-01, S8-03 | `app/api/billing/*`, invoice generation, `lib/helpArticles.ts` billing text | Razorpay plans in INR; GST invoice (number series, GSTIN, tax split) emailed and downloadable; help article "billed in USD" removed; test mode end to end |
| S8-08 | UPI-first checkout for clients [D-04] | M | BE | B, after S8-02 | booking payment link config | UPI intent and QR offered first; works on mobile; verified in Razorpay test mode |
| S8-09 | Wallet and withdrawals ledger [D-05] | L | BE | B, after S2-10 | `app/api/wallet/*`, `app/api/admin/withdrawals/*`, schema | Integer-minor-unit ledger with double entries; idempotent withdrawals; reconciliation report; admin approval audit log |
| S8-10 | Razorpay Route KYC and payload hygiene [D-06, D-07] | M | BE | B, after S8-09 | `app/api/razorpay/connect`, `app/api/settings/payout`, `bookings/route.ts:226-236` | KYC states handled with clear messages; only an internal reference travels in Razorpay notes; bank and PAN data encrypted at rest |
| S8-11 | Dunning and failed-payment flow [new] | M | BE | B, after S8-07 | webhook handlers, email templates, banner | Reminders before and after a failed charge, correct wording ("payment failed", not "trial expired"), recovery link, automatic downgrade after the grace period |
| S8-12 | Billing screens [new] | M | FE | C, after S8-04 and S8-07 | `app/dashboard/billing/*` | Plan comparison reads from the database; INR prices; clear current plan, renewal date, invoices list, cancel and resume; works at 375px |
| S8-13 | Admin revenue and tenant tools [B-39] | M | BE then FE | D | `app/admin/revenue`, `app/admin/tenants`, `app/api/admin/*` | "Revenue" shows Calvy's own subscription income (MRR) and, separately, tenant bookings per currency; plan changes validated and logged; delete requires confirmation and is logged |
| S8-14 | Deposits and no-show fees [new] | L | BE | B, after S4-04 and S8-02 | policy fields from S4-04, booking payment code | Optional deposit or fee on booking, refunded or kept per the cancellation policy; tests; disabled by default |
| S8-15 | Coupons and referrals (optional) [new] | M | BE | after S8-07 | plans and billing | Only if the owner wants them; otherwise closed |
| S8-16 | Payments and billing test suite [D-08] | L | QA | E | `tests/payments/*` | Webhook fixtures for paid, failed, refunded and duplicate events; billing state machine tests (active, past due, cancelled, expired); end-to-end in Razorpay test mode; pass counts reported |
| S8-17 | Security review of Step 8 | M | SEC | E, last | n/a (this review explicitly includes payment code) | Signature handling, replay, amount tampering, double credit, PII at third parties; no Critical or High open |

---

## Step 9 — Launch prep

**Goal:** everything the public sees is true, legal and consistent, the product is verified end to end, and a small group of real businesses has used it.
**Landing-page marketing claims are changed only in this step.**
**Exit criteria:** no claim on the site that cannot be backed by data; legal pages match real data flows; final audits pass; launch checklist signed off by the owner.

**Parallel plan.** Marketing copy items (lane A) edit different files from legal and help content (lane B), so they run together. The final security audit and final QA (lane D) start only after A and B are merged.

| Lane | Agent | Items |
|---|---|---|
| A: marketing site | FE | S9-01 → S9-02 → S9-03 → S9-04 → S9-05 |
| B: content and legal | FE (copy) with owner review | S9-06, S9-07, S9-08, S9-09 |
| C: trust | FE + BE | S9-10 (optional) |
| D: verification | QA, SEC | S9-11, S9-12 (after A and B) |
| E: operations | owner + BE | S9-13, S9-14, S9-15 |

| ID | Title | Eff | Agent | Lane / depends | Files | Acceptance criteria |
|---|---|---|---|---|---|---|
| S9-01 | Remove fabricated claims and testimonials [A-01] | S | FE | A (first) | `components/landing/Hero.tsx:25,80,82`, `StatsBar.tsx`, `Testimonials.tsx`, `CTA.tsx:22`, `InlineCTABand.tsx:33`, `LeadMagnet.tsx:34`, `ProblemStatement.tsx` | No customer count, appointment count, rating, review count, named testimonial or third-party "verified" label unless backed by real, permissioned data with a link; grep for `12,000`, `3.2M`, `4.9`, `2,400`, `Trustpilot`, `Capterra` finds nothing; the page still reads well using true product facts |
| S9-02 | One honest offer, consistent copy [A-02] | S | FE | A, after S9-01 | `Hero.tsx:53`, `HeroLeadForm.tsx:50`, `CTA.tsx:33`, `Features.tsx:14,21`, `app/signup/page.tsx`, `PricingClient.tsx`, `Footer.tsx` | Free plan and trial stated once and identically, matching what S8-05 built; no "Stripe" or "SMS" unless true; "60 seconds" versus "10 minutes" resolved to the measured onboarding time; copyright year computed |
| S9-03 | Pricing section from real data [A-07 marketing side] | M | FE | A, after S8-03 | `components/landing/Pricing.tsx`, `PricingClient.tsx` | Prices in INR read from the database; discount badge computed; features grouped into about eight highlights and a comparison table; matches the billing screen |
| S9-04 | Hero call to action and dead links [A-05, A-06] | S | FE | A, after S9-02 | `components/landing/HeroLeadForm.tsx`, `Footer.tsx` | "Start free" goes to `/signup?email=…`; no `href="#"`; About, Contact, Changelog pages exist or links are removed; social links only if real profiles exist; "Razorpay setup" removed from the public footer |
| S9-05 | Shorter landing page [A-22] | M | FE | A, after S9-04 | `app/page.tsx`, `components/landing/*` | Fewer than four lead-capture surfaces; mobile page height under about 9,000px; floating CTA never overlaps the chat bubble; Lighthouse mobile within budget |
| S9-06 | Legal pages match reality [new] | M | FE + owner review | B | `app/privacy`, `app/terms`, `app/refund-policy`, `components/legal/*` | Privacy notice reflects the real data, processors and retention (including Indian data-protection requirements and messaging consent); terms and refund policy match the real plans and billing; cookie notice if cookies are used; reviewed by a qualified person before launch |
| S9-07 | Help center rewrite [new] | M | FE | B | `lib/helpArticles.ts` | Articles describe what the product actually does (no Stripe, no USD, no missing features); new articles for packs, booking modes, messaging, team roles; each article tested by following it on a phone |
| S9-08 | SEO, demo page removal, metadata [new] | S | FE | B | `app/booking/page.tsx` (remove the static demo), `app/sitemap.ts`, page metadata | The fake `/booking` demo page is removed or clearly labelled and not indexed; unique titles and descriptions; sitemap correct; canonical addresses per page (not in the root layout) |
| S9-09 | Onboarding emails and sequence [new] | M | FE | B, after S5-13 | `emails/templates.tsx` | Welcome and "get live" emails in English and Hindi; consistent offer; unsubscribe for marketing messages |
| S9-10 | Real social proof and reviews [C24] | L | FE + BE | C (optional) | new reviews feature, `components/landing/Testimonials.tsx` | Post-visit review request with a Google review link; testimonials shown only from real, permissioned customers with a source link |
| S9-11 | Final full security audit | L | SEC | D, after A and B | n/a | Whole application reviewed (including payments); every Critical and High closed; Medium items have owners and dates; written report |
| S9-12 | Final regression and acceptance test | M | QA | D, after A and B | `tests/e2e/*` | Full Playwright regression at 375px and 1440px across all journeys and roles; DOM-check budget met; load test rerun; honest pass or fail counts |
| S9-13 | Launch checklist and rollback rehearsal | M | owner + BE | E | `docs/launch-checklist.md` | Environment variables, DNS, backups, monitoring, support inbox, status page, rollback rehearsal, announcement plan all ticked and dated |
| S9-14 | Support readiness | S | owner | E | support process | Response targets, canned answers, escalation path; support tickets open to every plan (decided in S8-04) |
| S9-15 | Beta with real businesses | M | owner | E | n/a | Five to ten real businesses (a mix of the four industries) run for two weeks; every issue triaged; real feedback collected for testimonials only with permission |

---

## Dependencies across steps

- `S1-19` (migrations) blocks every schema change in Steps 2 to 8.
- `S1-04` (validation foundation) blocks the rest of Step 1's route work.
- `S2-01` (timezone) blocks `S5-02` (reminders) and `S2-17`.
- `S2-12` (non-blocking side effects) leads into `S5-01` (outbox).
- `S3-06` (Industry Pack engine) blocks pack content, onboarding and `S5-08` (template defaults).
- `S3-14` (i18n) blocks `S5-13` (localised messages) and `S9-09`.
- `S4-04` (policies) blocks `S4-03` (manage link) and `S8-14` (fees).
- `S5-05` (OpenWA adapter) blocks `S7-09` (hosting).
- `S6-01` and `S6-02` (roles) block `S5-12` full behaviour and all of Step 6's screens.
- `S8-03` blocks `S8-04`, `S8-05`, `S8-12` and `S9-03`.
- `S9-01` to `S9-05` must wait for Steps 3 and 8 so the site describes what exists.

## Audit coverage check

Every audit item is accounted for: B-01 → S1-01; B-02 → S1-02; B-03 → S1-03; B-04 → S2-02; B-05 → S2-01; B-06 → S1-08, S2-05; B-07 → S1-04 to S1-07, S2-06; B-08/B-09 → S1-09; B-10 → S1-21, S5-02; B-11 → S1-18; B-12 → S1-19, S7-03; B-13 → S5-04; B-14 → S5-03; B-15 → S2-03; B-16 → S1-15; B-17 → S1-17, S7-04; B-18 → S1-12; B-19 → S1-13; B-20 → S1-14; B-21 → S2-04; B-22 → S2-07; B-23 → S1-09; B-24 → S2-08; B-25 → S2-09; B-26 → S2-10; B-27 → S2-11; B-28 → S2-12, S5-01; B-29/B-30 → S1-11; B-31 → S6-01 to S6-03; B-32 → S6-08; B-33 → S1-23, S5-10; B-34 → S4-03; B-35 → S5-14; B-36 → S1-22, S7-07; B-37/B-38 → S1-24, S2-18 and each step's QA item; B-39 → S1-07, S8-13; B-40 (notification polling) → S6-07 (push replaces polling; add a `since` parameter during S1-06); A-01 to A-02 → S9-01, S9-02; A-03 → S1-16; A-04 → S3-04; A-05, A-06 → S9-04; A-07 → S8-03, S9-03; A-08 → S3-12; A-09 to A-12, A-15 to A-17 → S3-03; A-13 → S2-15; A-14 → S3-04; A-18, A-19, A-21 → S3-01; A-20 → S3-02, S3-15; A-22 → S9-05; A-23 → S1-10; A-24 to A-26 → S3-05, S3-11; A-27 → S1-10; A-28/A-29 → S2-17; A-30 → S3-12; A-31 → S4-09; A-32 → S3-14; A-33 → S3-13; D-00 → S1-20; D-01 → S8-01; D-02 → S8-02; D-03 → S8-07; D-04 → S8-08; D-05 → S8-09; D-06/D-07 → S8-10; D-08 → S8-16.
