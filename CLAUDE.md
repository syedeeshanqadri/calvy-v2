# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev                 # next dev on :3000
npm run build               # prisma generate && next build  (no db push; schema changes are migrations, see docs/migrations.md)
npm run lint                # eslint .
npm test                    # vitest run (tests/**/*.test.ts, node env, "@" alias -> repo root)
npx vitest run tests/booking.test.ts            # single test file
npx vitest run -t "name pattern"                # single test by name
npm run db:migrate | db:migrate:dev | db:generate | db:status | db:seed | db:studio   # migrate deploy / migrate dev / prisma generate / status / seed / studio (all load .env.local via dotenv-cli); db:deploy = plain migrate deploy for CI/hosting
```

When telling the owner to run database commands, always use these scripts (for example `npm run db:migrate`), never bare `npx prisma ...`.

Env vars are in `.env.local` (see README "Environment Variables"). Tests only cover pure lib logic (booking, currency, plans, ratelimit) — no DB or route tests.

## Architecture

Next.js 16 App Router (React 19), TypeScript, Prisma 5 on PostgreSQL (Neon), NextAuth v4 (JWT + credentials), Tailwind, Resend email, Vercel Blob uploads, Web Push. Deployed on Vercel; `vercel.json` schedules `/api/cron/reminders` daily.

### Multi-tenancy via subdomains
[proxy.ts](proxy.ts) (formerly middleware.ts) rewrites `{slug}.calvy.io/<path>` to `/{slug}/<path>` internally (never for `/api/*`), so tenant public sites live in `app/[slug]/` (incl. `book-now`). `/dashboard`, `/admin`, `/crm` are wrapped in NextAuth `withAuth`; logged-in users hitting `/login`/`/signup` are redirected to `/dashboard`. Root domain comes from `NEXT_PUBLIC_ROOT_DOMAIN`. Every tenant-scoped query must be filtered by the session user's `businessId`.

### Plan-based feature gating (DB-driven)
Plan limits/flags live in the `PlanConfig` table (editable at `/admin/plans`, no redeploy). [lib/plans.ts](lib/plans.ts) defines the `PlanLimits` shape and defaults/`getLimitsFromDB`; [lib/getFeatures.ts](lib/getFeatures.ts) `getBusinessFeatures(businessId)` resolves a business's limits. Gating is enforced in **both** the page (render `<UpgradeGate>`) and the API route — add both when introducing a gated feature. Adding a flag means touching `PlanLimits`, defaults, the admin plans UI, and the gated page/API.

### Payments
Despite README/docs saying Stripe, the live payment integration is **Razorpay** ([lib/razorpay.ts](lib/razorpay.ts), `app/api/razorpay/{connect,webhook}`; Route linked accounts for tenant payouts, wallet + `WithdrawalRequest` for withdrawals). The `stripePayments` plan flag name is legacy and still gates prepaid booking. Only `paymentStatus === "paid"` appointments count toward revenue/profit.

### Booking domain
[lib/booking.ts](lib/booking.ts) (availability/slot logic, unit-tested), `/api/availability` and `/api/bookings` are shared by the full-page `/book-now` flow and the `components/chatbot/ChatWidget`. Quirks: multi-service bookings store the first service as the FK and extras in `Appointment.notes` as `__services__:Name2|Name3`; services have `capacity` (>1 = group booking); services with appointments are soft-deleted (`isActive=false`). Prices are stored in the business's own currency (no conversion; see [lib/currency.ts](lib/currency.ts)).

### Other pieces
- Notifications: every appointment event writes a `Notification` row (header polls every 30s) and optionally sends Web Push ([lib/push.ts](lib/push.ts)).
- Email templates in `emails/` + [lib/email.tsx](lib/email.tsx) (Resend, logged in `EmailLog`); WhatsApp via [lib/whatsapp.ts](lib/whatsapp.ts).
- Marketing/SEO: `app/blog` renders `Post` rows from the DB (ISR, `revalidate = 60`); help content in [lib/helpArticles.ts](lib/helpArticles.ts); [lib/indexnow.ts](lib/indexnow.ts) pings search engines. Canonicals are set per page (a root-level canonical previously leaked to all pages — don't add one to the root layout). `KEYWORD-PLAN.md` and the blog-title CSV drive content work.
- `/crm` + `Lead` model, and `/admin` (tenants, plans, support inbox, withdrawals) are internal super-admin tooling ([lib/adminAuth.ts](lib/adminAuth.ts)).
- `Documentation.md` is a long product/architecture reference; README has the route and env-var tables.

## Repo notes
- `.claude/settings.json` contains stale allow-rules from another machine, including a hard-coded Neon `DATABASE_URL` with credentials and a test login password — those secrets should be rotated and the entries removed.
- `.env.local.example` referenced in README does not exist; use README's "Environment Variables" table.
- `AUDIT.md` is a read-only security/codebase audit (sampled, not exhaustive); read it before touching auth, tenant isolation, or payments.
- `scripts/update-slugs.ts` is a one-off tenant-slug migration script (run with `npx tsx`); it writes to the DB in `DATABASE_URL`.
- `docs/PRODUCT-SPEC.md` describes what the product actually does today; `docs/audit/` holds the audit reports (frontend, backend, product) and screenshots; `docs/PLAN.md` is the 9-step delivery plan.
- `docs/ROADMAP-v2.md` is the source for what to build next (current order of work); `docs/PLAN.md` holds the item IDs.

## How we work

Lean mode: one session, sequential work, small outputs.

- **One session, sequentially. Do NOT spawn subagents** (the files in `.claude/agents/` stay as reference) **unless the owner explicitly asks.**
- **One branch per chunk**, named `step-N/chunk-name` (for example `step-2/booking-transactions`). A chunk groups 3 to 6 related items from `docs/PLAN.md`. Never work on `main`. **Before starting any new chunk: `git switch main`, `git pull`, then branch from the latest origin/main.**
- **Non-trivial chunks: show a short plan first and wait for the owner's OK** before editing code. Trivial fixes (typos, one-line changes) can go straight in.
- **After each change run only:** `npm run lint`, `npx tsc --noEmit` and `npm test` (unit tests). Pipe each through `tail` and show only the last ~20 lines. **No Playwright and no screenshots per chunk.** Report results honestly; if a check cannot run, say so.
- **Once at the end of each step, when the owner asks:** run the Playwright smoke test, the full `npm run build`, and the `security-auditor` review (the one time a subagent is used, and only on request).
- **Do not start the dev server unless the owner asks. Never poll, sleep or wait on long commands;** run them once, in the background if they are long, and report back.
- **Never run a build or any command that pushes the schema (`prisma db push`)** against a database that is not confirmed to be the dev database. Database changes use migrations only (`prisma migrate dev`).
- **Reports: 15 lines maximum:** items done, files changed, test result, click-test steps.
- **Commit locally with clear messages.** Shipping: the owner click-tests, then says **"ship it"** (or runs `/ship`, see `.claude/commands/ship.md`). **Never ship (push, open or merge a PR) without the owner's "ship it".** Never push to `main` directly and never force-push; merges go through a PR as a merge commit, never squash. Push permissions for this flow live in the gitignored `.claude/settings.local.json`.
- **Never read or print `.env*` files or `.claude/settings.json`**, and never put secrets in code, logs, tests or commits.
- **Do not touch payment gateway code** (`lib/razorpay.ts`, `app/api/razorpay/**`, `app/api/billing/**`, wallet and withdrawal code, `app/booking/success`) unless the task says so.
- **Landing-page marketing claims are out of scope until Step 9** (customer counts, ratings, testimonials, prices shown on the marketing site). Do not add, remove or reword them in earlier steps, and never invent any.
- **`docs/PLAN.md` is not rewritten**; only tick off finished items. Reference item IDs in branch names, commits and tests.
- **The owner is on Windows: give every command the owner has to run in PowerShell syntax** (for example `$env:NAME="value"; npm run dev`, `Remove-Item Env:NAME`, `cd C:\path`).
