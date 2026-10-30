# Calvy v2 status audit, 2026-10-30

Read-only audit of `origin/main` @ 96d969e (221 commits). Replaces the 2026-10-24 audit. No code, DB or branch was changed to produce it.

## 1. Git

| Item | Result |
|---|---|
| Branch / dirty / stashes | `fix/live-email`; only untracked `.vscode/` and `etc/`; no stashes |
| Open PRs | none |
| **Local-only work (backup risk)** | `fix/live-email` (1 commit, a06d792: startup warning when email uses Resend's test sender). Not pushed: push or ship it |
| Remote branches | 12 old ones, all merged into main, safe to delete: `audit/phase-1`, `chore/team-setup`, `design/steps-3-5`, `docs/plan-s1-28`, `port/legacy-ui`, `step-1/{next-migration,next-upgrade,round-1}`, `step-2/{chunk-1,chunk-2,design,wrap-up}` |
| Local branches | `main` (= origin/main) and `fix/live-email` |

Last 15 merged PRs: #43 business website links right on this host; #42 customer dashboard (reschedule/cancel); #41 security audit fixes; #40 Book now links on path hosting + signup headline; #39 hero photo on phones; #38 signup asks region only; #37 home "Get started" button, popups paused; #36 park pay-links/chunks 11-12, FULL_ONLINE off; #35 online consultations; #34 JSON-LD escape, S3 quota; #33 branded booking emails; #32 hero next-available card; #31 tenant website and booking redesign; #30 design direction; #29 plans from DB, flags enforced, PLAN_ENFORCEMENT.

## 2. Main health (clean worktree of origin/main)

| Check | Result |
|---|---|
| `npm ci` | pass |
| `npm run lint` | pass: 0 errors, 17 warnings (react-hooks) |
| `npx tsc --noEmit` | pass |
| `npm test` | pass: **64 files, 953 tests** |
| `npx next build` | **pass with `DATABASE_URL` defined** (53 static pages; a dummy unreachable URL is enough). With the variable **missing** the build fails at page-data collection (`/sitemap.xml` constructs Prisma at import): a deploy without `DATABASE_URL` set breaks, as Vercel's first build did |

## 3. Database (dev Neon `neondb`, us-east-2; also used by the live test server)

- `npm run db:status` could **not connect from this laptop** (P1001, three tries; TCP to Neon works; a SELECT fallback failed the same way). The live site's `/api/health` says `db: up`, so it is a local engine/network problem. Not re-verified today.
- Inferred: main has 22 migrations, the last is `20261026040000_appointment_meeting_link`. `db:migrate` after PR #43 reported nothing pending, and no migration has merged since. No local-only migration exists, so nothing applied is missing from main.

## 4. Progress vs roadmap

| Area | Status |
|---|---|
| Steps 1-3: foundation/security, booking engine, packs/terms/theme/logo | **Done & merged.** Open: round-3 Medium/Low items (S1-34..47, partly closed since), design system S3-05..S3-15 for the dashboard |
| Token mode: sessions, atomic booking, queue screen, live tracking, queue credit | **Done & merged** (S4-06 security review not recorded) |
| Payments core + holds/checkout (chunks 9-10), booking-people | **Done & merged**, behind `FEATURE_ONLINE_PAYMENTS` (off); Cashfree adapter exists, no split |
| Plan enforcement flag | **Done & merged** (PR #29); **OFF** on live |
| Redesign (site + booking), final check, JSON-LD fix | **Done & merged** (#30-#34, #39, #40, #43) |
| Online consultations v1 | **Done & merged** (#35 plus per-appointment link and email) |
| Website editor: hero photo/focus, text sections | Done & merged |
| Website editor: gallery, offers, team photos, service images, FAQ | **Not started** (no code) |
| Customer accounts and dashboard (reschedule, cancel) | **Done & merged** (#42) |
| Google sign-in (verified email) | Code merged; **inactive** (no `GOOGLE_*` vars) |
| Onboarding wizard | Partial: country and business-type step only |
| Managers/staff logins and roles (S8-01..04), phone OTP | **Not started** |
| Admin panel | **Partly done**: tenants, plans, revenue, support, withdrawals, blog, notifications; S5-10 not ticked |
| Messaging: Resend email | Done; live sender fixed 2026-10-29 (`EMAIL_FROM` set on Vercel); warning commit unmerged |
| Messaging: WhatsApp, reminders scheduler | WhatsApp Cloud API basic, **off**; reminders **daily cron only**; outbox/retries (S6-01/02) **not started** |
| Follow-ups, credit applied at booking, clinic records | **Not started** (credit ledger and wallet screen exist; `applyCredit` unused at booking) |
| Refunds on cancel | Code merged, never exercised (payments off) |
| Parked: pay-links, chunk 11, chunk 12 (Cashfree split), chunk 13 | **Parked** (PLAN.md "Parked"). Razorpay, wallet and withdrawals still in code |
| Pre-launch: security pass | Audit done (#41); Mediums open (section 5) |
| Pre-launch: plan enforcement ON, production deploy, marketing | **Not started**: no production env; test server only; landing claims untouched (S10) |

**FULL_ONLINE is unreachable (confirmed):** `FULL_ONLINE_ENABLED = false` in `lib/fees.ts`, no route or screen sets `onlinePayMode`, and `tests/full-online-parked.test.ts` guards both.

## 5. Risks

| Risk | Severity | Note |
|---|---|---|
| Rate limits are per instance on Vercel (no Upstash vars) | Medium | SA-01: login/booking throttles advisory |
| CSP report-only, allows unsafe-inline/eval | Medium | SA-02 |
| Dev DB credentials in untracked `.claude/settings.json`; test server uses the dev DB | Low | SA-05, S1-01 |
| Markdown unsanitised (admin-only), signup enumeration | Low | SA-03, SA-04 |
| No Critical or High findings open; `npm audit` = 0 | - | after PR #41 |

**Flags** (all OFF, none set on Vercel): `FEATURE_PAYMENTS`, `_WALLET`, `_BROADCASTS`, `_CHAT_WIDGET`, `_DEMO_BOOKING`, `_REMOVE_BRANDING`, `_ONLINE_PAYMENTS`, `PLAN_ENFORCEMENT` (off = every business has every feature, no limits).

**Vercel production env present (names):** `DATABASE_URL`, `DIRECT_URL`, `SHADOW_DATABASE_URL`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_ROOT_DOMAIN`, `SUPER_ADMIN_EMAIL`, `CRON_SECRET`, `TRACKING_SECRET`, `RESEND_API_KEY`, `EMAIL_FROM`, `CASHFREE_APP_ID/SECRET_KEY/ENV`. **Missing:** `S3_*` (uploads fail), `UPSTASH_*`, `GOOGLE_*`/`FACEBOOK_*`, `VAPID_*` (no web push), `WHATSAPP_*`, `SENTRY_DSN`, `ADMIN_SETUP_SECRET`, `NOTIFY_EMAIL`, `RAZORPAY_*` (fine while payments are off).

**Known issues:** Playwright (26 Oct) had failures never investigated: several auth-screen specs, the clinic booking specs in `redesign.spec.ts`, smoke "public booking then cancel"; not in CI. Test server serves sites by path (no wildcard subdomain): the queue "moved" link assumes that. The legacy Razorpay payment-link path cannot carry the online mode (refuses online bookings). Locally, a running dev server locks Prisma's engine (`prisma generate` EPERM) and stale `.next/dev/types` can fail `next build` until cleared. Neon is us-east-2, slow from India; Vercel functions default to US East (fine live).

**Would break or mislead a production deploy today:** no production Neon/env/domain (test server runs on the dev DB with test accounts and a shared password); no `S3_*` storage; in-memory rate limits; `PLAN_ENFORCEMENT` off; landing page claims and testimonials still fabricated (S10-01); Razorpay code and wallet still present.

## 6. Next actions

1. Ship `fix/live-email` (local-only), then send one real booking email to confirm delivery in `EmailLog`.
2. Delete the 12 merged remote branches.
3. Fix local `db:status` (network/engine) and confirm 22/22 migrations applied.
4. Add Upstash (SA-01) and `S3_*`/R2 vars to Vercel; decide production storage.
5. Create the production Neon project (Asia, no autosuspend), new secrets, domain and wildcard TLS (S9-02, S9-16, S9-17).
6. Investigate the Playwright failures and add the smoke run to CI.
7. Website editor sections (gallery, offers, team photos, service images, FAQ) and managers/roles (S8-01..04).
8. Reminders: outbox with retries and a faster scheduler (S6-01/02, S9-06); then landing-page cleanup (S10-01) before any public launch.
