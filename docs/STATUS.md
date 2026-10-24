# Calvy v2 status audit, 2026-10-24

Read-only audit of `origin/main` @ 9e0e678 (118 commits). No code, DB or remote changes were made. Checks ran in a temp worktree.

## 1. Git state

| Item | Result |
|---|---|
| Current branch / dirty / stashes | `main`, clean, no stashes (report branch: `docs/status-2026-10-24`) |
| Open PRs | none |
| Remote branches | 14 on origin; `step-3/packs-onboarding`, `step-3/website-extras`, `design/packs-extras` already pruned |
| `step-3/theme-colour`, `step-3/website-extras` | **merged** (PR #14 contains chunk 4 and 4b) |

**Unmerged local work (not on origin, would be lost if the laptop dies):**

| Branch | Ahead / behind main | What it holds |
|---|---|---|
| `step-3/terms-rollout` | +8 / -3 | **Chunk 3** (`t()` rollout across dashboard, booking page, website defaults, emails), staff-role fixes, and the new **CONSULTANT pack** (enum migration). Merge with main **conflicts in `lib/email.tsx`**. |
| `step-3/pack-demo-appointments` | +1 / -5 | Seed: clients and appointments per pack demo business |

All other local branches (`audit/phase-1`, `chore/team-setup`, `docs/*`, `step-1/*`, `step-2/*`, `step-3/packs-terms-engine`, `step-3/theme-colour`) are fully merged: safe to delete.

**Worktrees:** 8 leftovers in `C:\Users\qadri\calvy-wt\{b1,b2,b3,b4,c1,c2,c3,ci}` (all clean, all branches merged). Safe to remove with `git worktree remove`. A temp worktree `..\calvy-status-wt` was created for this audit; remove it too.

## 2. Main health (clean checkout of origin/main)

| Check | Result |
|---|---|
| `npm ci` | pass (deprecation and allow-scripts warnings only) |
| `npm run lint` | pass: 0 errors, **17 warnings** (react-hooks, e.g. `static-components`; S1-47 open) |
| `npx tsc --noEmit` | pass |
| `npm test` | pass: **35 files, 552 tests** |
| `npm run build` | **FAIL** at static generation of `/blog/[slug]` (`prisma.post.findFirst` in `generateMetadata`, `app/blog/[slug]/page.tsx:25`): "Can't reach database server" (Neon pooler, us-east-2, parallel workers). Compile and TypeScript stages passed. Ran once, not retried. Build depends on a reachable DB, so a flaky or suspended DB breaks deploys |

CI (`.github/workflows/ci.yml`) runs lint, tsc, tests and build against a throwaway Postgres. No Playwright in CI. Its comment says dummy `RAZORPAY_*` and `RESEND_API_KEY` values are "needed until lazy clients merge" but those merged (S1-03); harmless.

## 3. Database (dev Neon, `neondb`, us-east-2)

- `npm run db:status`: **9 migrations found, database schema is up to date.** All 9 on main are applied.
- No migration is applied in the DB that is missing from main.
- **Pending risk:** `step-3/terms-rollout` adds a CONSULTANT enum migration that is not applied. Merging it needs `npm run db:migrate` afterwards.
- Seed: idempotent upserts, test accounts skipped when `NODE_ENV=production` unless `SEED_TEST_ACCOUNTS=1`. Not executed (it writes). It compiles under tsc. A true dry run needs a Neon branch.

## 4. Progress vs plan

Note: `docs/PLAN.md` ticks lag reality (e.g. S1-28 Next 16 is done, `proxy.ts` replaced middleware, but S1-28 is not ticked).

| Step | Status |
|---|---|
| 1 Foundation and security | Done and merged (all step-1 branches in main, Next 16.4.1). Open: round-3 Medium/Low items S1-33 to S1-47, S1-10/11/16/24/25/30/31 unticked, S1-01 credential rotation (owner) |
| 2 Booking engine | Done and merged (timezone, locked booking, per-staff, time off, plan limits, manage link, reschedule/delete, walk-ins). Open: S2-08..S2-10 unticked, S9-18 narrow re-check |
| 3 chunk 1 packs/terms engine | Done and merged |
| 3 chunk 2 pack picker, defaults | Done and merged (PR #12) |
| 3 chunk 3 `t()` rollout | **Done but NOT merged** (`step-3/terms-rollout`, conflicts) |
| 3 chunk 4 theme colour | Done and merged |
| 3 chunk 4b logo/social/map/hours | Done and merged (PR #14) |
| 3 rest (design system S3-05..S3-09, S3-10..S3-15) | Not started |
| 4 Token mode (chunks 5 to 8) | Not started |
| 5 Payments / Cashfree (chunks 9 to 13) | Not started |
| 6 Messaging, 7 Intl payments, 8 Team and mobile | Not started |
| 9 Deployment and ops | Partial: CI (S9-01), storage adapter (S9-07 in `lib/storage.ts`); rest not started |
| 10 Launch prep | Not started (marketing claims untouched by design) |

## 5. Risks

**Open findings and TODOs.** `grep TODO/FIXME` in code: none. Open in PLAN.md: S1-33 to S1-47 (OAuth auto-link, session invalidation after password change, token hashing, push ownership, CSP enforcement, etc.), S1-01 secrets rotation (`.claude/settings.json` still holds a Neon URL and test password per CLAUDE.md).

**Feature flags** (all OFF by default, `docs/feature-flags.md`): `FEATURE_PAYMENTS`, `FEATURE_WALLET`, `FEATURE_BROADCASTS`, `FEATURE_CHAT_WIDGET`, `FEATURE_DEMO_BOOKING`, `FEATURE_REMOVE_BRANDING`. Reason: payments stay off until the Step 5 security review. Doc still says `middleware.ts` (now `proxy.ts`) and "Prepaid is handled in Step 8".

**Payments.** Still Razorpay: `lib/razorpay.ts`, `app/api/{razorpay,billing,wallet}`, `bookings/confirm`, `settings/payout`, `/dashboard/{billing,wallet,payments}`, admin withdrawals. Wallet and withdrawals still present. Retirement is Step 5 chunk 13.

**Works only on this laptop / needs setup for production.** Required: `DATABASE_URL`, `NEXTAUTH_SECRET` (both set). Names unset in `.env.local` (checked with the app's own names-only `checkEnv`; values never read):

| Group | Unset vars | Effect |
|---|---|---|
| Email | `RESEND_API_KEY`, `EMAIL_FROM`, `NOTIFY_EMAIL` | No emails: verification, reset, booking confirmations all silent. Sandbox sender must be replaced (S6-03) |
| Cron | `CRON_SECRET` | `/api/cron/reminders` returns 401 in prod (fail closed). Only a **daily** 06:00 UTC cron in `vercel.json` |
| WhatsApp | `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN` | Disabled; not template-based yet (S6-04) |
| Uploads | `BLOB_READ_WRITE_TOKEN`, **and** `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_PUBLIC_URL` | `lib/storage.ts` defaults to **s3 in production**; logos are on local disk (`public/uploads`) now. The S3 vars are not listed in `lib/env.ts`, so startup never warns |
| Rate limit | `UPSTASH_REDIS_REST_URL/TOKEN` | In-memory limiter: ineffective across Vercel instances |
| Login | `GOOGLE_*`, `FACEBOOK_*` | Google and Facebook login unavailable |
| Push | `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | No web push |
| Razorpay | `RAZORPAY_*` (9 vars) | Fine while payments are off |
| Ops | `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`, `ADMIN_SETUP_SECRET` | No error tracking |
| Also check in Vercel | `NEXTAUTH_URL`, `NEXT_PUBLIC_ROOT_DOMAIN`, `NEXT_PUBLIC_APP_URL`, `SUPER_ADMIN_EMAIL`, `DIRECT_URL` | Needed for subdomain routing, admin, migrations |

**Latency.** Dev Neon is us-east-2 from India: each query is slow, which already broke a reschedule at Prisma's 5 s limit. Booking lock now uses `BOOKING_TX_OPTIONS` (maxWait 10 s, **timeout 20 s**, `lib/booking.ts:107`), a workaround. S9-17 (prod DB in an Asia region, no autosuspend) and S9-18 (narrow re-check) are planned, not done.

**Would break or mislead a production deploy today:**
1. `next build` needs a reachable database (blog pages prerender from the DB and failed in this audit); give the build a DB or make blog prerender tolerant. 2. No S3/R2 config: uploads (logos) fail in production because the driver defaults to s3.
2. No Resend key and sandbox sender: no emails at all, so signup verification and password reset never arrive.
3. Reminders only run once a day, and need `CRON_SECRET`.
4. Chunk 3 (`t()`) is unmerged: dashboard, booking page and emails still use hard-coded customer/staff words while the website uses pack terms.
5. In-memory rate limiting on serverless.
6. The credentials in `.claude/settings.json` are still unrotated (S1-01).
7. README and Documentation.md still say Stripe, Next 14.
8. Landing-page claims are untouched (S10-01), so a public launch would show fabricated numbers.
9. No production environment exists yet (no prod Neon project, Vercel env set or domain documented; S9-02, S9-16).

## 6. Next actions

1. **Push both unmerged branches** to origin now (`step-3/terms-rollout`, `step-3/pack-demo-appointments`) so the work is backed up.
2. Resolve the `lib/email.tsx` conflict, rebase `step-3/terms-rollout` on main, run lint, tsc and tests, click-test, then ship chunk 3 (+ CONSULTANT pack). Run `npm run db:migrate` after merge.
3. Rotate the Neon password and test password; remove the entries from `.claude/settings.json` (S1-01).
4. Clean up: remove the 8 `calvy-wt` worktrees and the temp `calvy-status-wt`, delete the merged local branches, tick PLAN.md items that are done.
5. Add the six `S3_*` vars to `lib/env.ts` and `.env.example`, and decide the production storage (R2) before deploy.
6. Create the production Neon project in an Asia region with autosuspend off and one Vercel project; set the env table above (S9-02, S9-17).
7. Start Step 4 chunk 5 (`step-4/token-sessions`) once chunk 3 is merged.
8. Plan the Resend domain (SPF/DKIM) and a reminder schedule faster than daily before beta (S6-03, S9-06).
