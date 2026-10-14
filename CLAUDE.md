# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev                 # next dev on :3000
npm run build               # prisma generate && prisma db push && next build  (NOTE: pushes schema to the DB in DATABASE_URL)
npm run lint                # next lint
npm test                    # vitest run (tests/**/*.test.ts, node env, "@" alias -> repo root)
npx vitest run tests/booking.test.ts            # single test file
npx vitest run -t "name pattern"                # single test by name
npm run db:migrate | db:seed | db:studio        # prisma migrate dev / tsx prisma/seed.ts / studio
```

Env vars are in `.env.local` (see README "Environment Variables"). Tests only cover pure lib logic (booking, currency, plans, ratelimit) — no DB or route tests.

## Architecture

Next.js 14 App Router, TypeScript, Prisma 5 on PostgreSQL (Neon), NextAuth v4 (JWT + credentials), Tailwind, Resend email, Vercel Blob uploads, Web Push. Deployed on Vercel; `vercel.json` schedules `/api/cron/reminders` daily.

### Multi-tenancy via subdomains
[middleware.ts](middleware.ts) rewrites `{slug}.calvy.io/<path>` to `/{slug}/<path>` internally (never for `/api/*`), so tenant public sites live in `app/[slug]/` (incl. `book-now`). `/dashboard`, `/admin`, `/crm` are wrapped in NextAuth `withAuth`; logged-in users hitting `/login`/`/signup` are redirected to `/dashboard`. Root domain comes from `NEXT_PUBLIC_ROOT_DOMAIN`. Every tenant-scoped query must be filtered by the session user's `businessId`.

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
