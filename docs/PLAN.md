# Calvy v2 — prioritised backlog

Built from the audit reports: [01 frontend/UX](audit/01-frontend-ux.md), [02 backend](audit/02-backend.md), [03 product](audit/03-product.md). Written 2026-10-15 on branch `audit/phase-1`. No app code has been changed yet; this file only plans the work.

Conventions
- **Severity:** Critical / High / Medium / Low (as used in the reports).
- **Effort:** S = up to half a day, M = 1 to 3 days, L = more than 3 days (one developer, including tests).
- **Source:** report section that contains the evidence (`01` = frontend, `02` = backend, `03` = product).
- Each item names the files to touch and acceptance criteria that can be checked by a person or a test.
- Payments are in **Deferred** (last section) per the brief. Nothing in Phase A/B depends on them, except that the "MUST" list says payments stay switched off until the deferred review is done.

---

## MUST be done before v2 goes live (regardless of phase)

If any of these is open, v2 should not take real customers. Items are cross-referenced to the phase where they are specified in full.

| # | Must-do | Why it blocks launch | Item |
|---|---|---|---|
| 1 | Remove fabricated social proof and unverifiable claims; fix Stripe/Razorpay and free/trial copy | Misleading-advertising and consumer-protection exposure, and destroys trust the moment someone checks | A-01, A-02 |
| 2 | Rotate the credentials in `.claude/settings.json` (Neon DB URL, test password) and remove them from git history/working tree; add `.env.example` and boot-time env validation | Secrets are in the repo; app silently misbehaves without env vars | B-01, B-02 |
| 3 | Fix import-time crashes (`new Resend`, `new Razorpay`) and the `/booking/success` 500 | One missing key takes down pages | B-03 |
| 4 | Prevent double bookings (transaction/lock/constraint) | A booking product that double-books is not a product | B-04 |
| 5 | Add `Business.timezone` and store/format real UTC instants | Wrong slots, reminders and emails outside a UTC server | B-05 |
| 6 | Enforce plan limits/active-plan and active-service checks on **public** bookings; bound `slotInterval`; validate `availabilityJson` | Free tier unlimited; one tenant setting can hang the platform | B-06, B-07 |
| 7 | Password reset, resend verification, lowercase emails | Users are permanently locked out today | B-08, B-09 |
| 8 | Cron: fail closed without `CRON_SECRET`; correct reminder window; do not mark failed reminders as sent | Open endpoint; reminders silently lost | B-10 |
| 9 | Update `next` and `next-auth` (and run `npm audit fix`) | 2 critical advisories in the auth/framework layer | B-11 |
| 10 | Replace `prisma db push` in the build with `prisma migrate deploy`; baseline migration from the current schema | Schema changes are applied unreviewed on every deploy; migrations are stale | B-12 |
| 11 | A messaging path that actually delivers: WhatsApp templates or click-to-chat fallback; verified sending domain (not `onboarding@resend.dev`) | Confirmations and reminders will not reach customers | B-13, B-14 |
| 12 | `error.tsx`, `global-error.tsx`, `not-found.tsx`; fix 375px hero clipping | Default Next error pages and a broken first impression on phones | A-03, A-04 |
| 13 | Per-staff scheduling **only if** you market to salons/spas/clinics at launch; otherwise state clearly "one calendar per business" | Multi-staff businesses get one booking per slot today | B-15 |
| 14 | Keep Razorpay/prepaid booking, wallet and withdrawals **disabled** (feature flag off, UI hidden) until the Deferred review (D-01…D-08) is complete | Money flows were out of audit scope | D-00 |

---

## Phase A — Frontend

### A1. Trust, copy and legal (do first, mostly S)

| ID | Title | Sev | Eff | Files | Acceptance criteria |
|---|---|---|---|---|---|
| A-01 | Remove fabricated metrics, ratings, testimonials and "Verified on" badges | Critical | S | `components/landing/Hero.tsx:25,80,82`, `StatsBar.tsx`, `Testimonials.tsx`, `CTA.tsx:22`, `InlineCTABand.tsx:33`, `LeadMagnet.tsx:34`, `ProblemStatement.tsx` | No number of customers/appointments/ratings/reviews appears unless it comes from a real source; no named testimonial or third-party "verified" label unless it is a real, permissioned review with a link; page still reads well (replace with product facts); grep for `12,000`, `3.2M`, `4.9`, `2,400`, `Trustpilot`, `Capterra` returns nothing in `components/` and `app/` |
| A-02 | One honest offer and consistent copy | High | S | `Hero.tsx:53`, `HeroLeadForm.tsx:50`, `CTA.tsx:33`, `Features.tsx:14,21`, `app/signup/page.tsx:92-93`, `PricingClient.tsx:14-15`, `Footer.tsx:69` | Free plan vs trial stated once and identically in hero, pricing, signup and FAQ; no "Stripe" or "SMS" claims unless implemented; "60 seconds" vs "10 minutes" resolved; footer says the current year (computed, not hard-coded) |
| A-03 | Add `error.tsx`, `global-error.tsx`, `not-found.tsx` (and `loading.tsx` for marketing/blog/tenant/booking) | High | S | `app/error.tsx`, `app/global-error.tsx`, `app/not-found.tsx`, `app/b/[slug]/loading.tsx`, `app/[slug]/loading.tsx` | Unknown URL shows a branded 404 with a way home; a thrown server error shows a branded retry page; no default Next.js error screen appears when the DB is down (test by killing the DB URL) |
| A-04 | Fix 375px homepage hero clipping | High | S | `components/landing/Hero.tsx`, `PhoneMockups.tsx` | At 375px the headline, subcopy, form and mockup are fully visible; `scrollWidth == clientWidth`; verified with `scripts/screenshot-all.ts` |
| A-05 | Hero CTA goes to signup, not a lead list | High | S | `components/landing/HeroLeadForm.tsx`, `app/signup/page.tsx` | "Start free" navigates to `/signup?email=…` with the email prefilled; lead capture remains only on newsletter/lead-magnet blocks |
| A-06 | Replace dead footer links; remove or build the pages | High | S | `components/landing/Footer.tsx:9-15,42-44` | No `href="#"` remains (`DOM-CHECKS.json` `hashLinks: 0`); social icons removed unless real profiles exist; "Razorpay setup" moved out of the public footer |
| A-07 | Pricing display: INR (or chosen currency), real annual discount badge, shorter feature lists | High | M | `components/landing/Pricing.tsx`, `PricingClient.tsx`, `lib/plans.ts:123-151`, `PlanConfig` rows | Prices shown in the chosen launch currency with GST note if applicable; the "-20%" badge is computed from actual prices; plan cards show at most ~8 grouped highlights with a "compare plans" table; matches `Documentation.md` |
| A-08 | Fix tenant default copy "Professional services services" | Medium | S | `lib/website.ts:95-102` | New `general` businesses show "Professional services" (no duplicate word); unit test for `defaultWebsiteConfig` |

### A2. Accessibility and mobile (High value, mostly M)

| ID | Title | Sev | Eff | Files | Acceptance criteria |
|---|---|---|---|---|---|
| A-09 | Associate every label with its input (`htmlFor`/`id` or wrap) | High | M | `app/signup/page.tsx`, `app/login/page.tsx`, `app/dashboard/website/WebsiteEditorClient.tsx`, `app/dashboard/settings/SettingsClient.tsx`, `components/ui/Input.tsx`, booking `BookingClient.tsx`, landing lead forms | DOM check reports `unlabeledInputs: 0` on all audited pages; clicking a label focuses its field; shared `Input` generates ids by default |
| A-10 | Accessible names for icon-only buttons/links | High | S | `app/dashboard/services/*`, `booking-page/*`, `settings/*`, `website/*`, `staff/*`, `components/dashboard/Header.tsx` | `iconBtnNoName: 0` in DOM check; each has `aria-label`/`title` |
| A-11 | Tap targets ≥ 44×44px on mobile (nav, row actions, carousel arrows, links) | High | M | `components/dashboard/*`, `components/landing/*`, `app/dashboard/**` | DOM check `smallTargets` under 5 per page on dashboard/booking pages (decorative exceptions listed); spacing between destructive and adjacent actions |
| A-12 | Minimum text size 12px for real content; remove 6–9px text from mockups (use images/`aria-hidden`) | Medium | M | `components/landing/PhoneMockups.tsx`, dashboard badges using `text-[10px]/[11px]` | No content text under 12px except `aria-hidden` decoration; contrast of footer/muted text ≥ 4.5:1 (verified with a contrast tool) |
| A-13 | Calendar usable at 375px (default to Day view on mobile, readable event cards) | High | M | `app/dashboard/calendar/*` | At 375px the default view shows event titles and times without truncation to one letter; week view is horizontally scrollable with a sticky time column |
| A-14 | Settings tabs and signup name fields stack/scroll on mobile | Medium | S | `app/dashboard/settings/SettingsClient.tsx`, `app/signup/page.tsx` | No tab hidden off-screen; fields full width below `sm` |
| A-15 | Keyboard and focus audit (visible focus rings, modal focus trap, ESC, skip link, `aria-live` for form errors) | Medium | M | `components/ui/Modal.tsx`, `Button.tsx`, global CSS, all forms | Tab-through of signup, booking, dashboard nav works; focus visible everywhere; modals trap focus; errors announced |
| A-16 | Per-page `<title>`/metadata for app, auth and booking pages; single `<h1>` per page | Medium | S | `app/login`, `app/signup`, `app/dashboard/*`, `app/b/[slug]`, `app/blog/[slug]` | Every audited page has a unique descriptive title (DOM check); blog post renders one `<h1>` (demote Markdown `#`) |
| A-17 | Fix hydration warnings | Medium | S | `app/dashboard/clients/ClientsClient.tsx:76-99` (anchor inside Link), `app/admin/plans/PlansClient.tsx:283` | No React hydration warnings in the console on these pages |

### A3. Design system consolidation (Medium, L overall; do after A1/A2)

| ID | Title | Sev | Eff | Files | Acceptance criteria |
|---|---|---|---|---|---|
| A-18 | One accent colour and token set | Medium | M | `app/globals.css:6-13`, `tailwind.config.ts`, `components/**`, tenant theme code | A single documented set of CSS variables/Tailwind tokens (ink, muted, border, surface, accent, status); `--accent` red vs `accent` blue conflict resolved (tenant colour is explicitly per-tenant, not the platform accent); hard-coded `#6b6b80`, `#e8e6e0`, `#f8f7f4` replaced by tokens (count drops from ~750 to near 0) |
| A-19 | Rename font variables to match reality | Low | S | `app/layout.tsx:8-17`, `tailwind.config.ts:11-14`, 150 usages | `font-display`/`font-sans` names (or restore Syne); no `font-syne` that loads Plus Jakarta |
| A-20 | Use the `ui/` kit everywhere; merge duplicates | Medium | L | `components/ui/*`, 53 files with raw `<button>`, stat tiles (`ui/StatCard.tsx`, `dashboard/DashboardKPIStats.tsx`, admin/dashboard inline tiles), `Modal`, admin `Field` | One `Button`, `Input`, `Card`, `StatCard`, `Modal`, `Select`, `Badge`; shared `<LeadForm>` replaces 8 lead components; shared shell for Dashboard/Admin/CRM; no visual regressions in screenshots |
| A-21 | Type scale, radius and shadow scale | Low | S | Tailwind config | Documented scale (e.g. 12/14/16/20/24/32/48), radius (lg/xl/2xl/full), shadow (sm/md/lg); arbitrary `text-[Npx]` removed |
| A-22 | Reduce homepage length and duplicate lead capture | Medium | M | `app/page.tsx`, `components/landing/*` | Fewer than 4 lead-capture surfaces; mobile page height under ~9,000px; no floating CTA overlapping the chat bubble |

### A4. Onboarding and first-run (High value, M–L)

| ID | Title | Sev | Eff | Files | Acceptance criteria |
|---|---|---|---|---|---|
| A-23 | Auto sign-in after email verification; resend-verification UI | High | M | `app/api/auth/verify-email/route.ts`, `app/login/page.tsx`, new `app/api/auth/resend-verification` | Clicking the link lands in the dashboard; "resend email" works with rate limit; expired-token message offers resend (not "sign up again") |
| A-24 | Dashboard "get live" checklist and sample data | High | M | `app/dashboard/page.tsx`, `lib/createBusiness.ts`, new `components/dashboard/GetLiveChecklist.tsx` | New owner sees steps: add services, set hours, share link/QR; completes in under 5 minutes; checklist hides when done; sensible India-ready sample services and hours seeded |
| A-25 | Share tools: copy link, WhatsApp share, QR code | High | S | `app/dashboard/booking-page/BookingPageClient.tsx` | One tap copies the link or opens WhatsApp with a prefilled message; QR downloadable |
| A-26 | Empty and zero states for every dashboard section | Medium | M | `app/dashboard/**` | A brand-new owner sees explanatory empty states with a primary action in each section (verify with a fresh account that has a business); KPI tiles show "No data yet" rather than `$0` / `100%` |
| A-27 | Password UX: show/hide, inline validation, reset link | Medium | S | `app/signup/page.tsx`, `app/login/page.tsx` | Show/hide toggle; rule visible while typing; "Forgot password?" link present (depends on B-08) |

### A5. Booking-flow polish (Medium, S–M)

| ID | Title | Sev | Eff | Files | Acceptance criteria |
|---|---|---|---|---|---|
| A-28 | Step names visible on mobile; "Taken" badge fix; disabled-Continue hint; show timezone | Medium | S | `app/b/[slug]/BookingClient.tsx:217-222,513-517`, slot grid | Step labels visible at 375px (abbreviated); "Taken" no longer overlaps the time; helper text explains disabled Continue; timezone shown under the calendar |
| A-29 | Hide times earlier than now today; show spots left for group slots | Medium | S | `app/b/[slug]/BookingClient.tsx`, `app/api/availability/route.ts` | Past times do not appear; group capacity shown (depends on B-06) |
| A-30 | Tenant site defaults and branding | Medium | M | `lib/website.ts`, `app/[slug]/page.tsx` | Default imagery matches business type; opaque nav on photo hero; tenant accent chosen at onboarding rather than defaulting to red |
| A-31 | Chat widget parity | Low | M | `components/chatbot/ChatWidget.tsx` | Uses the same booking components/validation as the full page (no divergent logic) |

### A6. Localisation (India)

| ID | Title | Sev | Eff | Files | Acceptance criteria |
|---|---|---|---|---|---|
| A-32 | i18n scaffolding and Hindi for the public booking page and client emails | High | L | new `lib/i18n`, `app/b/[slug]`, `emails/templates.tsx` | Booking page and client-facing emails switch between English and Hindi by business setting; strings externalised; fonts render Devanagari |
| A-33 | India defaults across forms | Medium | S | `app/signup/page.tsx` REGIONS, booking details form | INR/India pre-selected by geo or locale; `+91` phone prefix and 10-digit validation; ₹ formatting |

---

## Phase B — Backend

### B1. Security, secrets and platform hygiene

| ID | Title | Sev | Eff | Files | Acceptance criteria |
|---|---|---|---|---|---|
| B-01 | Rotate leaked credentials and purge from the repo | Critical | S | `.claude/settings.json` (+ git history), Neon console | The Neon password and test login password are rotated; no secrets in tracked files or history (use `git filter-repo` or recreate the repo); `.gitignore` covers `.claude/settings.local.json` |
| B-02 | `.env.example` and boot-time env validation | High | S | new `.env.example`, `lib/env.ts`, `next.config.mjs` or `instrumentation.ts` | Starting the app without `DATABASE_URL`/`NEXTAUTH_SECRET` fails with a clear message; optional services (email, WhatsApp, blob) are reported as "disabled" in logs; README lists every variable |
| B-03 | Lazy third-party clients (no import-time crash) | Critical | S | `lib/email.tsx:16`, `lib/razorpay.ts:3`, `app/api/broadcasts/send/route.ts:10` | `getResend()`/`getRazorpay()` called inside functions; with all keys unset, `/booking/success`, `/api/broadcasts/send` and every page load without a 500 (verify by running with no env keys); `/booking/success` renders a helpful message |
| B-11 | Dependency security updates | High | M | `package.json`, `package-lock.json` | `next` and `next-auth` on patched versions (stay on 14.x unless upgrading deliberately); `npm audit --omit=dev` shows no critical/high that apply; app builds, tests and a manual booking run pass |
| B-12 | Move to Prisma migrations | High | M | `package.json` (`build`), `prisma/migrations/*` | Baseline migration generated from the live schema and marked applied (`migrate resolve`); build uses `prisma migrate deploy`; `db push` removed from build; CI check that `schema.prisma` matches migrations |
| B-16 | Security headers and cookie settings | Medium | S | `next.config.mjs`, `lib/auth.ts` | CSP (report-only first), HSTS, `X-Content-Type-Options`, `Referrer-Policy`, `frame-ancestors`; `poweredByHeader: false`; session `maxAge` set deliberately |
| B-17 | Central error handling, logging and monitoring | Medium | M | all `app/api/**/route.ts`, new `lib/api.ts`, Sentry (or similar) | A `withApi()` wrapper returns `{error}` with correct codes, handles invalid JSON (400), logs with request id; Sentry captures server and client errors; health endpoint `/api/health` |
| B-18 | Real rate limiting | High | M | `lib/ratelimit.ts`, routes `availability`, `bookings`, `leads`, `signup`, `upload`, `support`, `broadcasts` | Shared store (Upstash Redis or Vercel KV/Firewall); limits survive cold starts and multiple instances; availability, upload and broadcasts now limited; tests updated |
| B-19 | Unify admin authorisation | Low | S | 9 `app/api/admin/**` files, `app/admin/layout.tsx`, `lib/adminAuth.ts` | All admin checks use `isAdminSession()`; unset `SUPER_ADMIN_EMAIL` cannot match; `make-admin` uses constant-time compare and rate limit |
| B-20 | Reserved slugs | Low | S | `lib/createBusiness.ts` | `admin`, `www`, `api`, `app`, `dashboard`, `login`, `signup`, `blog`, `help`, `b`, etc. are rejected/suffixed; unit test |

### B2. Booking engine correctness (the core)

| ID | Title | Sev | Eff | Files | Acceptance criteria |
|---|---|---|---|---|---|
| B-04 | Atomic, race-free booking | Critical | M | `app/api/bookings/route.ts:67-141,243-253`, `app/api/appointments/route.ts`, `app/api/appointments/[id]/route.ts`, `prisma/schema.prisma` | Conflict check + insert run in one transaction with a lock (advisory lock per staff/business day, or serialisable with retry); a test fires 20 concurrent requests for one slot and exactly one succeeds; reschedule uses the same check; add a DB-level guard where possible |
| B-05 | Timezone support | Critical | L | `prisma/schema.prisma` (`Business.timezone`), `app/api/availability/route.ts`, `app/api/bookings/route.ts`, `app/api/appointments/route.ts`, `app/api/cron/reminders/route.ts`, `lib/email.tsx`, `emails/*`, dashboard formatting | Business timezone chosen at signup (default `Asia/Kolkata`); appointment `date` is a true UTC instant; slots/availability computed in the business zone; emails, reminders, `.ics` and dashboard display in the business zone; tests run with `TZ=UTC` and `TZ=Asia/Kolkata` and give identical results; migration converts existing rows |
| B-06 | Public booking must honour plan, active status and service state | High | S | `app/api/bookings/route.ts:37-48`, `lib/plans.ts` | Expired trial or exceeded monthly limit returns 402 with a friendly error; inactive services rejected; `staffId` verified to belong to the business and (when staff scheduling lands) to the service; tests |
| B-07 | Validate and bound settings inputs | High | S | `app/api/settings/route.ts:30-40`, `app/api/availability/route.ts:6-18,36-41`, `app/api/website/route.ts` | `slotInterval` integer 5–240; `availabilityJson` validated against a schema; `currency` from allow-list; `primaryColor` hex; `generateSlots` guards `stepMin > 0`; malformed stored JSON returns defaults instead of 500; add a validation library (zod) and shared schemas |
| B-15 | Per-staff scheduling | Critical (for salons/clinics) | L | `app/api/availability/route.ts`, `app/api/bookings/route.ts`, `lib/booking.ts`, `app/b/[slug]/BookingClient.tsx`, `app/dashboard/staff/*` | Availability and conflicts evaluated per staff; "any available" assigns a free staff member; staff working hours and `StaffService` links enforced; two stylists can be booked at 11:00; unit tests for `lib/booking.ts` cover multi-staff; dashboard calendar filters by staff |
| B-21 | Time off, holidays, breaks, notice and buffers | High | L | new `TimeOff`/`BlockedDate` models, `availability`, `bookings`, dashboard settings UI | Owner can block dates/ranges per business or staff, add lunch break, set minimum notice, maximum advance days and per-service buffer; availability respects all of them; tests |
| B-22 | Hide past slots; reschedule validation | Medium | S | `availability/route.ts`, `appointments/[id]/route.ts:43-49` | Today's elapsed slots not offered; reschedule to a past or conflicting time returns 409/400 |
| B-23 | Normalise emails and client identity | High | S | `signup/route.ts`, `lib/auth.ts`, `bookings/route.ts`, `appointments/route.ts`, `clients/route.ts`, migration for existing rows | All emails trimmed + lowercased on write and lookup; existing duplicates merged by migration; tests for mixed-case login and booking |
| B-24 | Allow phone-only clients | Medium | M | `schema.prisma` (`Client.email` optional, unique on phone), booking/appointment forms and routes | Booking works with phone only; dedupe by phone; dashboard handles missing email |
| B-25 | Proper multi-service model | Medium | M | `schema.prisma` (`AppointmentService`), booking and dashboard code, migration from `notes` `__services__:` | Services stored as rows with price/duration snapshots; old notes migrated; no parsing of `notes` for services |
| B-26 | Money and status types | Low | M | `schema.prisma` | Prices as integer minor units or `Decimal`; `status`/`paymentStatus` as enums; migration and tests |
| B-27 | Add database indexes | High | S | `prisma/schema.prisma` | Indexes on `Appointment(businessId, date)`, `(staffId, date)`, `(date, reminderSent)`, `Client(businessId)`, `Notification(businessId, createdAt)`, `VerificationToken(email)`, `(expiresAt)`; `EXPLAIN` on availability/dashboard queries shows index use |
| B-28 | Make booking side effects non-blocking and reliable | Medium | M | `app/api/bookings/route.ts:160-192`, `lib/email.tsx`, `lib/whatsapp.ts`, `lib/push.ts` | Email/WhatsApp/push sent via `after()` or a queue with retry; booking response returns immediately; failures recorded and visible to the owner |

### B3. Auth and account lifecycle

| ID | Title | Sev | Eff | Files | Acceptance criteria |
|---|---|---|---|---|---|
| B-08 | Password reset | High | M | new `app/api/auth/forgot-password`, `reset-password`, `app/forgot-password`, `app/reset-password`, `emails/templates.tsx` | Request sends a one-time, 1h token (hashed in DB); reset invalidates old sessions' reliance (token version) and verifies the email; rate limited; no account enumeration in the response |
| B-09 | Resend verification; unverified account handling | High | S | new route, `lib/auth.ts:56`, signup flow | Resend endpoint rate limited; if Resend is not configured in non-production, dev auto-verifies or shows the link in logs; OAuth no longer auto-verifies an existing unverified credentials account without proof (`lib/auth.ts:85-87`) |
| B-29 | Session freshness and role changes | Medium | S | `lib/auth.ts` jwt callback | Role/business re-read at least every N minutes or on a version bump; demoted admin loses access without waiting 30 days |
| B-30 | Brute-force protection and enumeration | Low | S | `lib/auth.ts`, `signup/route.ts` | Per-IP and per-email limits on shared store; signup responds identically for existing emails (email notice instead) |
| B-31 | Staff logins and roles | High | L | `schema.prisma` (`StaffMember` ↔ `User`, role enum), `lib/auth.ts`, every `app/api/**` ownership check, dashboard nav | Owner invites staff by email; roles owner/manager/receptionist/staff; staff see only permitted pages (a stylist sees own calendar); all APIs authorise by role; tests |
| B-32 | Account deletion and data export | Medium | M | new routes under `app/api/account`, `app/dashboard/settings` | Owner can export data (CSV/JSON) and delete the account; clients' data deletion on request; documented in the privacy page |

### B4. Messaging

| ID | Title | Sev | Eff | Files | Acceptance criteria |
|---|---|---|---|---|---|
| B-13 | WhatsApp that delivers | Critical | L | `lib/whatsapp.ts`, `app/api/bookings/route.ts`, `app/api/cron/reminders/route.ts`, `app/api/broadcasts/send/route.ts` | Template messages (`type: "template"`) with approved confirmation/reminder/cancel/reschedule templates; delivery status webhook stored; `+91` default country code and E.164 validation; per-tenant opt-in recorded; PII removed from logs; **stop-gap option:** `wa.me` click-to-chat links in dashboard until templates are approved |
| B-14 | Email deliverability and identity | High | S | `lib/email.tsx:16-17`, env, DNS | Production refuses to start with the sandbox `FROM`; verified domain with SPF/DKIM/DMARC; `Reply-To` is the business email; bounce/complaint webhooks mark `EmailLog` |
| B-10 | Reminder cron rewrite | High | M | `app/api/cron/reminders/route.ts`, `vercel.json` | Requires `CRON_SECRET` (401 when unset in production); selects appointments by the business's local time 24h (and optionally 2h) ahead; claims rows (`reminderSentAt` set before send, cleared on failure) so failures retry and concurrent runs do not double-send; batches with bounded concurrency; runs more often than daily (Vercel Pro cron, or an external scheduler/queue); respects plan flags |
| B-33 | Broadcast safety | High | M | `app/api/broadcasts/send/route.ts:13-23,63`, `schema.prisma` | Escape business name and subject; enforce per-month limit; require opt-in and add unsubscribe link; chunk and queue; WhatsApp broadcast via templates only |
| B-34 | Client self-service links | High | M | new `app/m/[token]` page, `app/api/manage/*`, email/WhatsApp templates | Confirmation includes a signed manage link; client can cancel or reschedule within the business's policy window; owner notified; tested for token tampering and expiry |
| B-35 | SMS (optional) | Low | L | `lib/sms.ts` | DLT-registered SMS provider behind a plan flag; or remove all SMS claims (A-02) |

### B5. Uploads, data and quality

| ID | Title | Sev | Eff | Files | Acceptance criteria |
|---|---|---|---|---|---|
| B-36 | Portable, safer uploads | Medium | M | `app/api/upload/route.ts`, `app/api/admin/blog/upload/route.ts`, `next.config.mjs` | Storage adapter (Vercel Blob or S3/R2, local disk in dev); magic-byte type check, allow `jpg/png/webp` only, extension derived from verified type; size and per-tenant quota; old file deleted on replace; blob host added to `images.remotePatterns` |
| B-37 | Route and integration tests | High | L | `tests/**` | Test DB (Docker/Neon branch) with seeded data; tests for booking (race, plan limits, timezone), auth (verify, reset, case), tenant isolation (each dashboard route rejects another tenant's ids), cron, upload validation; CI runs lint, tsc, tests |
| B-38 | Playwright smoke tests for core journeys | Medium | M | `tests/e2e/*`, `scripts/screenshot-all.ts` | Signup→verify→login→add service→public booking→dashboard shows it, at 375px; runs in CI against a seeded DB; reuses the seed accounts |
| B-39 | Admin hardening | Low | S | `app/api/admin/tenants/[id]/route.ts`, others | `plan`/`planStatus` validated against known values; tenant DELETE requires confirmation token and writes an audit log; pagination on list routes |
| B-40 | Reduce notification and polling load | Low | S | `app/api/notifications/route.ts`, `components/dashboard/Header.tsx` | Pagination, ETag/`since` param, backoff when tab hidden |

---

## Deferred — payments (not audited; do not enable until reviewed)

All items below are placeholders from the audit's "Deferred" section. Until they are done, keep prepaid booking, wallet, withdrawals, billing/upgrade flows and the `stripePayments` flag **off** in production (D-00).

| ID | Title | Sev | Eff | Files | Acceptance criteria |
|---|---|---|---|---|---|
| D-00 | Feature-flag payments off | High | S | `lib/plans.ts`, `app/dashboard/{billing,wallet,payments}`, `app/api/{razorpay,billing,wallet,bookings}`, pricing page | Single env/DB flag `PAYMENTS_ENABLED=false`; UI hidden and APIs return 404/503 when off; documented |
| D-01 | Payment security review | High | M | `app/api/razorpay/webhook/route.ts`, `app/api/billing/webhook/route.ts` | Constant-time signature checks; idempotency keys; replay protection; amounts verified server-side; events stored |
| D-02 | Slot hold during prepaid checkout | High | M | `bookings/route.ts` prepaid branch, schema | Pending appointment holds the slot for N minutes; webhook confirms or releases; no paid booking for a taken slot |
| D-03 | Subscription billing in INR with GST invoices | High | L | `lib/plans.ts`, `app/dashboard/billing`, help article "billed in USD" | Plans priced in INR; GST invoices generated and emailed; documented tax handling |
| D-04 | UPI-first checkout for tenants' clients | High | M | `bookings`, Razorpay link config | UPI intent/QR available; test mode verified |
| D-05 | Wallet and withdrawals ledger | High | L | `app/api/wallet/*`, `app/api/admin/withdrawals/*`, schema | Double-entry ledger in integer minor units; withdrawals idempotent; reconciliation report; admin approval audit log |
| D-06 | Razorpay Route onboarding/KYC review | Medium | M | `app/api/razorpay/connect/route.ts`, `settings/payout` | KYC states handled; errors surfaced; test with sandbox linked accounts |
| D-07 | PII in payment notes | Medium | S | `bookings/route.ts:226-236` | Only an internal reference travels in Razorpay `notes`; booking data retrieved from DB by reference |
| D-08 | Payments test suite | High | M | `tests/payments/*` | Webhook fixtures for paid/failed/refunded/duplicate events; end-to-end test in Razorpay test mode |

---

## Weekly milestones

Assumes one full-time developer; adjust if the work is split. Each week ends with a screenshot re-run (`scripts/screenshot-all.ts`, `scripts/audit-checks.ts`) and a short report.

| Week | Theme | Items | Exit criteria |
|---|---|---|---|
| **1** | Stop the bleeding: trust, secrets, crashes | A-01, A-02, A-03, A-04, A-06, A-08, B-01, B-02, B-03, B-11, B-19, B-20, D-00 | No fabricated claims; secrets rotated; app starts and renders every page with all optional keys unset; critical dependency advisories closed; payments flagged off |
| **2** | Booking correctness | B-04, B-05, B-06, B-07, B-22, B-23, B-27, B-12 | Concurrency test passes; timezone tests pass under two `TZ` values; plan/limit checks on public bookings; migrations replace `db push`; indexes present |
| **3** | Auth, email, cron | B-08, B-09, B-10, B-14, B-29, B-30, A-23, A-27 | Password reset and resend verification work end to end; reminders correct and retried; verified sending domain; auth lifecycle tests |
| **4** | Phone UX and accessibility | A-05, A-07, A-09, A-10, A-11, A-12, A-13, A-14, A-15, A-16, A-17, A-28, A-29 | DOM checks: no unlabeled inputs, no nameless buttons, small targets under thresholds, titles unique; calendar usable at 375px; pricing honest |
| **5** | Onboarding and WhatsApp | A-24, A-25, A-26, A-33, B-13 (templates or `wa.me` stop-gap), B-33, B-34, B-28 | A new owner reaches a live shareable page in under 5 minutes; WhatsApp path delivers; client can cancel/reschedule by link |
| **6** | Design-system consolidation and test coverage | A-18, A-19, A-20, A-21, A-22, A-30, A-31, B-16, B-17, B-18, B-36, B-37, B-38 | One token set and component kit in use; shared rate limiter and error wrapper; route tests and Playwright smoke in CI; **Tier 1 launch candidate** |
| **7–8** | Salon/clinic readiness (Tier 2) | B-15, B-21, B-31, B-24, B-25, B-32, A-32, then B-26, B-35, B-39, B-40 | Two staff can be booked at the same time; time off and holidays; staff logins; Hindi booking page; **Tier 2 launch candidate** |
| **Later** | Payments review | D-01 … D-08 | Enable payments only after the Deferred checklist passes with tests |

Dependencies to watch: B-05 (timezone) before B-10 (cron) and B-13; B-04 before B-15; B-23 before B-08; A-23 depends on B-09; A-27 depends on B-08; B-31 touches every route, so schedule it after B-17 (shared `withApi`) and B-37 (tests).

---

## Counts

| | Critical | High | Medium | Low | Total |
|---|---|---|---|---|---|
| Phase A (frontend) | 1 | 14 | 15 | 3 | 33 |
| Phase B (backend) | 6 | 17 | 10 | 7 | 40 |
| Deferred (payments) | 0 | 7 | 2 | 0 | 9 |

B-15 is listed as Critical (for salons/clinics) and counted as Critical.
