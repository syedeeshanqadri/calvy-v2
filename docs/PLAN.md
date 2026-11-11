# Calvy v2 — Delivery plan (10 steps)

> **Current order of work: see [docs/ROADMAP-v2.md](ROADMAP-v2.md).**

This replaces the earlier phase-based backlog. It keeps every item from the audit (reports `docs/audit/01-frontend-ux.md`, `02-backend.md`, `03-product.md`; the product description is `docs/PRODUCT-SPEC.md`) and regroups them into the approved steps (10 since the 2026-10-24 re-plan; Steps 3 to 5 follow `docs/steps-3-5-design.md` and later steps were renumbered), adds the items the audit did not cover, and says which items can run in parallel and which agent owns each.

**Status:** planning only. No app code has been changed by this document.

## How to read this plan

- **ID** is `S{step}-{nn}`. The audit's original ID is shown in brackets, for example `[B-04]`, so findings stay traceable. `[new]` marks items the audit did not list.
- **Eff** (effort): **S** up to half a day, **M** 1 to 3 days, **L** more than 3 days, for one developer including tests.
- **Agent** is the owner defined in `.claude/agents/`: `backend-engineer` (BE), `frontend-designer` (FE), `qa-tester` (QA), `security-auditor` (SEC, read-only). `owner` means a manual step only the product owner can do.
- **Lane / depends** controls parallelism inside a step. **Items in different lanes can run at the same time. Items in the same lane run one after another.** `after X` means it cannot start until X is merged. Lanes are drawn so that parallel items never edit the same file; if a task turns out to need a file owned by another lane, stop and re-plan, never edit it at the same time.
- Every item names a branch pattern `step-N/short-name` (see CLAUDE.md "How we work"). Non-trivial items need a plan shown to the owner first.
- **Scope rules that apply to every step:** payment gateway code is untouched until an item explicitly says so (only Step 5 and Step 7 items, plus the two explicitly authorised exceptions `S1-03` and `S1-20`); landing-page marketing claims are untouched until Step 10; schema changes are migrations only, never `db push`; every query is scoped to `businessId`; every input is validated with Zod; times are UTC plus the business timezone.
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
| 7 | A messaging path that actually delivers (WhatsApp templates or click-to-chat) and a verified email domain | S6-03, S6-04, S6-06 |
| 8 | Error pages, mobile fixes (375px hero, calendar), labelled inputs | S1-16, S3-07, S3-08 |
| 9 | Payments stay switched off until the Step 5 review passes | S1-20, then S5-01 |
| 10 | Remove fabricated marketing claims, fix the offer and pricing copy, dead links | S10-01 to S10-04 |
| 11 | Backups, monitoring and a tested rollback | S9-04, S9-05 |

---

## Step 1 — Foundation & security

**Goal:** a safe base to build on: no leaked secrets, nothing crashes on a missing key, every input validated, tenants cannot see each other, auth is complete, schema changes go through migrations.
**Exit criteria:** security-auditor finds no Critical or High open in this step's scope; test infrastructure exists; the app starts and every page renders with all optional keys unset; `npm audit --omit=dev` has no critical or high issue that is reachable.

**Step 1 is delivered in rounds.** **Round 1** (in progress): Package A upgrade of `next` 14.2.35, `eslint-config-next` 14.2.35 and `next-auth` 4.24.15 plus the non-breaking `npm audit fix` (part of S1-18); Package A2 migrations baseline with `SHADOW_DATABASE_URL` wired in (S1-19, plus the `zod` and `@upstash/redis` dependencies); then in parallel: CI (S9-01 pulled forward), platform hardening (S1-03, S1-21, slot-interval guard, S1-02 minimal), feature flags (S1-20), auth lifecycle (S1-09 and email lowercasing), rate limiting (S1-12, in-memory fallback locally, Upstash only when its environment variables exist, activated in Step 9), error pages (S1-16), flags UI, auth screens (S1-10). **Round 2** (planned after round 1): S1-04 to S1-08, S1-13 to S1-15, S1-17, S1-22, S1-23, S1-24 to S1-26, plus the frontend fixes found by the Package A smoke test, owned by frontend-designer: S1-29, S1-30, S1-31, S1-32. **S1-01 (credential rotation) is the owner's.** **S1-28** (Next.js 15/16 migration) runs right after the Step 1 rounds and before Step 2. Feature flags default to **off in every environment** and are turned on with environment variables (documented in `docs/feature-flags.md`).

**Parallel plan.** Start `S1-01` (owner), `S1-19` (migrations baseline) and `S1-24` (test infrastructure) first. After `S1-04` (validation foundation) merges, lanes C, D and E run in parallel.

| Lane | Agent | Items (in order) |
|---|---|---|
| A: platform | BE | S1-02, S1-03, S1-18, S1-19, S1-20 |
| B: auth lifecycle | BE (then FE) | S1-09 (BE) → S1-10 (FE), S1-11 |
| C: validation, route group 1 (public + auth) | BE | S1-04 → S1-05 |
| D: validation, route group 2 (dashboard CRUD) | BE | after S1-04 → S1-06, S1-08 |
| E: validation, route group 3 (admin, cron, upload, broadcasts) | BE | after S1-04 → S1-07, S1-13, S1-21, S1-22, S1-23 |
| F: edge and headers | BE | S1-12, S1-14, S1-15, S1-17 |
| G: frontend | FE | S1-16, S1-27 |
| H: tests | QA | S1-24 → S1-25; SEC S1-26 last |

| ID | Title | Eff | Agent | Lane / depends | Files | Acceptance criteria |
|---|---|---|---|---|---|---|
| S1-01 | Rotate leaked credentials and purge them [B-01] | S | owner | start immediately | `.claude/settings.json` (owner only; agents never read it), Neon console, git history | Neon password and the test login password rotated; the secrets removed from tracked files and from history (rewrite or recreate the repository); `.gitignore` covers `.claude/settings.local.json`; old credentials confirmed dead |
| ✅ S1-02 | Central env config, `.env.example`, boot-time validation [B-02] | M | BE | A | new `lib/env.ts`, `.env.example`, `instrumentation.ts`, `README.md` | Starting without `DATABASE_URL` or `NEXTAUTH_SECRET` fails with a clear message that does not print values; optional services (email, WhatsApp, blob, push) log "disabled" instead of crashing; README table matches `.env.example`; no `process.env` reads outside `lib/env.ts` for new code |
| ✅ S1-03 | Lazy third-party clients; fix `/booking/success` 500 [B-03] | S | BE | A, after S1-02 | `lib/email.tsx:16`, `app/api/broadcasts/send/route.ts:10`, `lib/razorpay.ts:3` (**explicitly authorised: change only the client construction to lazy**, nothing else in payment code), `app/booking/success/page.tsx` | With every key unset, `/booking/success`, `/api/broadcasts/send` and all pages load without a 500; `getResend()` and `getRazorpay()` are created on first use; a test imports every module with an empty environment; **`next build` succeeds with `RAZORPAY_*` and `RESEND_API_KEY` unset** (today it fails at `/api/billing/portal` with "`key_id` or `oauthToken` is mandatory") |
| ✅ S1-04 | Validation and API wrapper foundation [B-07, B-17] | M | BE | C (first) | new `lib/validation/*` (shared schemas: email, phone E.164, id, money, pagination, timezone), `lib/api.ts` (`withApi`: auth, Zod parse, error mapping, request id, safe logging), `package.json` (add `zod`) | `withApi` returns 400 `{error, details}` for invalid and malformed JSON, 401/403/404 consistently, 500 without leaking internals; schemas unit-tested; documented in a short `docs/api-conventions.md` |
| ✅ S1-05 | Apply validation: signup, login helpers, leads, verify, onboarding, availability, public bookings (input only) [B-07] | M | BE | C, after S1-04 | `app/api/signup`, `leads`, `onboarding`, `auth/verify-email`, `availability`, `bookings` (not `bookings/confirm`) | Every handler parses params, query and body with Zod; emails trimmed and lowercased; `slotInterval`/`duration`/`date`/`time` bounded; length limits on all strings; tests for valid, invalid, oversized and malformed input |
| ✅ S1-06 | Apply validation: dashboard CRUD routes [B-07] | M | BE | D, after S1-04 | `app/api/appointments`, `clients`, `services`, `staff`, `expenses`, `settings`, `website`, `notifications`, `push`, `support` | Same standard as S1-05; `settings` validates `availabilityJson`, `currency` (allow-list), `primaryColor` (hex), `slotInterval` (integer 5 to 240); `website` validates `websiteJson` against a schema; no raw `req.json()` left in these routes |
| ✅ S1-07 | Apply validation: admin, CRM and blog routes [B-07, B-39] | M | BE | E, after S1-04 | `app/api/admin/**`, `app/api/crm/**` | Plan and status values validated against known values; pagination on list routes; tenant delete requires a confirmation token and writes a log line; tests |
| ✅ S1-08 | Tenant-isolation fixes [B-06 part] | M | BE | D, after S1-06 | `bookings/route.ts:150,266`, `appointments/route.ts:131`, `appointments/[id]`, any lookup by id without `businessId` | `staffId`, `serviceId`, `clientId` from requests are verified to belong to the business; cross-tenant ids return 404; one test per route proves it |
| ✅ S1-09 | Auth lifecycle: password reset, resend verification, email normalisation [B-08, B-09, B-23] | L | BE | B | `lib/auth.ts`, `app/api/auth/forgot-password`, `reset-password`, `resend-verification`, `signup/route.ts`, `emails/templates.tsx`, migration to lowercase and merge duplicate emails/clients | One-time hashed tokens, 1h expiry, single use, rate limited; no account enumeration; reset ends old sessions (token version); all emails lowercased on write and lookup; migration merges existing duplicates safely; OAuth no longer auto-verifies an existing unverified credentials account without proof; tests |
| ✅ S1-10 | Auth screens: forgot password, reset, resend, show-password toggle, auth-flow copy [A-23, A-27] | M | FE | B, after S1-09 | `app/forgot-password`, `app/reset-password`, `app/login/page.tsx`, `app/signup/page.tsx`, `app/verify-email/page.tsx` | Flows work end to end on 375px and 1440px; every input labelled; errors announced and next to the field; expired link offers "send a new link"; screenshots attached |
| S1-11 | Session freshness, brute-force limits, enumeration [B-29, B-30] | S | BE | B, after S1-09 | `lib/auth.ts`, `app/api/signup/route.ts` | Role and business re-read at a fixed interval or on a version bump (a demoted admin loses access without waiting 30 days); per-IP and per-email limits on the shared limiter; signup answers identically for existing emails |
| ✅ S1-12 | Shared rate limiter [B-18] | M | BE | F | `lib/ratelimit.ts`, routes: `availability`, `bookings`, `leads`, `signup`, `upload`, `support`, `broadcasts`, forgot/reset | Redis-backed (Upstash or equivalent) with an in-memory fallback in dev; limits survive cold starts and multiple instances; availability, upload and broadcasts are limited; `x-forwarded-for` handling documented; tests updated |
| ✅ S1-13 | Unify admin authorisation, harden `make-admin` [B-19] | S | BE | E | `lib/adminAuth.ts`, nine `app/api/admin/**` files, `app/admin/layout.tsx` | One `isAdminSession()` everywhere; an unset `SUPER_ADMIN_EMAIL` can never match; bootstrap secret compared in constant time and rate limited |
| ✅ S1-14 | Reserved slugs and slug rules [B-20] | S | BE | F | `lib/createBusiness.ts` | `admin`, `www`, `api`, `app`, `dashboard`, `login`, `signup`, `blog`, `help`, `b`, `crm`, `onboarding` and other fixed routes can never become a slug; unit test |
| ✅ S1-15 | Security headers and cookie settings [B-16] | S | BE | F | `next.config.mjs`, `lib/auth.ts` | CSP in report-only mode, HSTS, `X-Content-Type-Options`, `Referrer-Policy`, `frame-ancestors`; `poweredByHeader: false`; session `maxAge` chosen deliberately |
| ✅ S1-16 | Error boundaries and not-found [A-03] | S | FE | G | `app/error.tsx`, `app/global-error.tsx`, `app/not-found.tsx`, `app/b/[slug]/loading.tsx`, `app/[slug]/loading.tsx` | Unknown URL shows a branded 404 with a way home; a thrown error shows a branded retry page; no default Next.js error screen appears with the database unreachable; screenshots at 375px and 1440px |
| ✅ S1-17 | Logging, error tracking, health endpoint [B-17] | M | BE | F | `lib/logger.ts`, Sentry setup, `app/api/health/route.ts` | Structured logs with request id; no PII or secrets in logs; server and client errors reach Sentry; `/api/health` checks database reachability and returns no secrets |
| ✅ S1-18 | Dependency security updates [B-11] | M | BE | A | `package.json`, lockfile | `next` and `next-auth` on patched versions (stay on 14.x unless deliberately upgrading); `npm audit --omit=dev` shows no reachable critical or high; build, lint, typecheck, tests and a manual booking pass |
| ✅ S1-19 | Prisma migrations baseline; remove `db push` from the build [B-12] | M | BE | A, **blocks every schema change in Steps 2 to 9** | `package.json` (`build`), `prisma/migrations/*` | Baseline migration generated from the live schema and marked applied (`migrate resolve`); build runs `prisma generate` + `next build` only; deploys run `prisma migrate deploy`; CI check that the schema matches the migrations |
| ✅ S1-20 | Feature flag: payments off [D-00] | S | BE | A, **explicit authorisation: touches payment entry points only to hide them** | `lib/plans.ts` (flag), `app/dashboard/{billing,wallet,payments}`, `app/api/{razorpay,billing,wallet}`, `app/api/bookings` prepaid branch, pricing page | Env flag `PAYMENTS_ENABLED` (default false in production); prepaid mode, wallet, withdrawals and upgrade are hidden in the UI and return 404 or 503 from the API when off; documented; nothing else in payment code changes |
| ✅ S1-21 | Cron endpoint fails closed [B-10 part] | S | BE | E | `app/api/cron/reminders/route.ts` | Returns 401 in production when `CRON_SECRET` is unset or wrong; failed sends are not marked as sent; (full reminder rewrite is S6-02) |
| ✅ S1-22 | Upload hardening [B-36 part] | M | BE | E | `app/api/upload/route.ts`, `app/api/admin/blog/upload/route.ts`, `next.config.mjs` | Magic-byte check, allow-list jpg/png/webp (no SVG), extension derived from the verified type, size limit, per-tenant quota, plan check in the API, errors do not leak `err.message`; blob host added to `images.remotePatterns` |
| ✅ S1-23 | Broadcast safety quick fixes [B-33 part] | S | BE | E | `app/api/broadcasts/send/route.ts` | Business name and subject HTML-escaped; per-month limit enforced from `PlanConfig`; request capped to a safe batch size; (full rewrite is S6-10) |
| S1-24 | Test infrastructure and tenant-isolation suite [B-37 start] | M | QA | H | `tests/helpers/*`, `tests/api/*`, `vitest.config.ts` | Disposable test database and seed helper; helper to call route handlers with a fake session; for every dashboard route a cross-tenant test proves 404; tests run in CI-ready form; tests do not touch the dev database |
| S1-25 | Auth and validation regression tests | M | QA | H, after S1-05, S1-06, S1-09 | `tests/api/auth.test.ts`, `tests/api/validation.test.ts` | Mixed-case login, reset flow, resend, rate limits, malformed JSON, oversized input, unauthenticated access; evidence of pass counts |
| ✅ S1-26 | Security review of Step 1 | S | SEC | H, last | n/a (read-only) | Report by severity with file:line; no Critical or High open before Step 2 merges |
| ✅ S1-27 | Local Windows build: `/apple-icon` prerender fails [new] (**resolved in Package A**: replaced by a static `app/apple-icon.png`) | S | FE | done | `app/apple-icon.tsx`, `public/`, possibly `package.json` (Next version via S1-18) | `next build` completes on Windows and Linux; either the icon is served as a static PNG from `public/` or the Next upgrade in S1-18 fixes the `next/og` "Invalid URL" error; no change to the icon's appearance; screenshot of the icon in the browser tab |
| ✅ S1-28 | Next.js 15/16 migration (async params, React 19, caching defaults) [new] | L | BE (then FE for visual checks) | after Step 1 round 1 and round 2, **before Step 2** | `package.json`, `app/**/page.tsx` and route handlers using `params`/`searchParams` (about 18 files), `next.config.mjs`, `eslint` config, `app/apple-icon.tsx` | **When we get there, first check which Next.js release is the current stable, well-supported target** (`npm view next dist-tags`, the Next.js upgrade guide and the security advisories) and record the choice with the reason; migrate with the official codemods (`@next/codemod`) for async request APIs; move to the React version that target requires (React 19 for the App Router); review fetch and route-handler caching defaults route by route and set explicit `cache`/`revalidate`; confirm `next-auth` v4 still works on the target (or decide on Auth.js v5 as its own item); `npm audit --omit=dev` shows no reachable critical or high advisory for `next`; lint, typecheck, tests, build and the Playwright smoke at 375px and 1440px pass; no Step 2 schema or booking work starts until this merges |
| ✅ S1-29 | Fix nested `<a>` hydration error on `/dashboard/clients` [new, from the Package A smoke test] | S | FE | round 2 | `app/dashboard/clients/ClientsClient.tsx:76-99` | No hydration error or "`<a>` cannot be a descendant of `<a>`" warning on `/dashboard/clients` at 375px and 1440px; the whole client card is still clickable; the email and phone buttons still open `mailto:` and `tel:`; a Playwright check asserts an empty console-error list on this page |
| ✅ S1-30 | Associate every form input with its label (`<label htmlFor>` / `id`), then switch tests back to `getByLabel` [new, A-09 start] | M | FE (QA follows up on the tests) | round 2 | `components/ui/Input.tsx` (generate a stable id by default), `app/login/page.tsx`, `app/signup/page.tsx`, `app/b/[slug]/BookingClient.tsx`, `app/dashboard/settings/SettingsClient.tsx`, `app/help/HelpSearch.tsx`, the appointment edit modal in `app/dashboard/appointments/AppointmentsClient.tsx`; then `tests/e2e/smoke.spec.ts` (qa-tester) | Clicking any label focuses its field; DOM check reports zero unlabelled inputs on login, signup, booking, settings and the help search; selectors in the Playwright smoke spec go back to `getByLabel` and the suite passes at 375px and 1440px |
| S1-31 | Fix server/client attribute mismatches ("Extra attributes from the server: style", "Prop `style` did not match", padding warnings) [new] | M | FE | round 2 | `app/login/page.tsx`, `app/signup/page.tsx`, `app/b/[slug]/BookingClient.tsx`, `app/blog`, `app/help`, `app/dashboard/settings`, shared layouts that use `env(safe-area-inset-*)` inline styles | Root cause identified and written down (inline `style` computed differently on server and client, or injected by a browser extension); no hydration or attribute-mismatch warnings on the audited pages in a clean browser profile; no behaviour change on iPhone safe areas |
| ✅ S1-32 | Fix the `calvy.svg` logo width/height warning [new] | S | FE | round 2 | every `next/image` use of `/calvy.svg`: `app/login`, `app/signup`, `app/verify-email`, `app/onboarding/OnboardingClient.tsx`, `app/blog/[slug]/page.tsx`, `components/landing/Navbar.tsx`, `components/landing/Footer.tsx`, `components/dashboard/Header.tsx`, `components/dashboard/Sidebar.tsx`, `components/admin/AdminLayout.tsx` | The "image has either width or height modified, but not the other" warning no longer appears on any page; the logo keeps its aspect ratio and size at 375px and 1440px; screenshots |
| S1-33 | Validate `website` URL scheme [SEC S1-26, Medium] | S | BE | round 3 | `lib/validation/settings.ts:50`, `app/b/[slug]/BookingClient.tsx:204` | `website` accepts only empty or `http(s)://` URLs; the public booking page also guards the render; test with a `javascript:` value |
| S1-34 | OAuth account linking only for verified provider emails [SEC S1-26, Medium] | S | BE | round 3 | `lib/auth.ts:85-103` | Link an existing account only when the provider asserts `email_verified` (Google) or the existing account is already verified; Facebook does not auto-link; test |
| S1-35 | Invalidate sessions after a password change [SEC S1-26, Medium; part of S1-11] | S | BE | round 3 | `lib/auth.ts` (jwt callback), `app/api/auth/reset-password/route.ts:40` | `passwordChangedAt` is stored in or compared with the JWT; tokens issued before it are rejected; role changes are picked up within a bounded time; test |
| S1-36 | Enforce feature flags inside route handlers, not only in middleware [SEC S1-26, Medium] | S | BE | round 3, **explicit authorisation: touches payment and wallet entry points** | `middleware.ts` (matcher), `lib/flags.ts`, flagged handlers | `/api/<flagged>/x.png` can no longer skip the guard (the matcher exclusion never applies to `/api`), and each flagged handler calls `isFeatureEnabled`; test |
| S1-37 | Hash email-verification tokens and rate limit verification [SEC S1-26, Medium] | S | BE | round 3 | `app/api/auth/verify-email/route.ts`, `app/api/signup/route.ts`, `lib/auth-tokens.ts` | Verification tokens are stored hashed like reset tokens (with a migration or a safe rollover); the GET is IP rate limited; test |
| S1-38 | Signup enumeration and login brute-force buckets [SEC S1-26, Low] | S | BE | round 3 | `app/api/signup/route.ts:25`, `lib/auth.ts:56-60` | Signup returns the same response for existing emails and notifies the existing owner; login also has a per-IP bucket; decision recorded on whether login must require a verified email |
| S1-39 | Push subscription ownership and host allow-list [SEC S1-26, Low] | S | BE | round 3 | `app/api/push/subscribe/route.ts:17` | Updating an existing endpoint requires the same `businessId`; endpoints must be on known push-service hosts (FCM, Mozilla, Windows, Apple); test |
| S1-40 | Defence in depth: business-scoped writes by id [SEC S1-26, Low] | S | BE | round 3 | `app/api/services/[id]`, `staff/[id]`, `appointments/[id]`, `expenses/[id]` (update and delete) | Writes use `updateMany` / `deleteMany` with `businessId` in the `where`; behaviour and responses unchanged; tests |
| S1-41 | Scope services in `bookings/confirm` by business [SEC S1-26, Low] | S | BE | round 3, **explicit authorisation: payment path** | `app/api/bookings/confirm/route.ts:39` | `service.findMany` filters on `businessId` and the signed payment metadata; cross-tenant service ids return an error; test |
| S1-42 | Proxy trust, test-token gating, make-admin atomicity [SEC S1-26, Low] | S | BE | round 3 | `lib/ratelimit.ts:249-256`, `lib/auth-http.ts:41`, `app/api/admin/make-admin/route.ts` | `clientIp` documented as Vercel-only and Upstash required in production; `devToken` also gated on `VERCEL_ENV !== "production"`; bootstrap check and update in one transaction; env-only admins counted |
| S1-43 | Enforce the Content-Security-Policy [SEC S1-26, Info] | M | BE + FE | after S1-15 console is clean | `next.config.mjs`, `middleware.ts` (nonces) | Report-only CSP is clean on all pages; switch to enforcing with nonces and without `unsafe-inline` / `unsafe-eval` for scripts |
| S1-44 | Use `isAdminUser` in the withdrawals routes and page [SEC, Low] | S | BE | round 3, **explicit authorisation: withdrawal code** | `app/api/admin/withdrawals/route.ts`, `app/api/admin/withdrawals/[id]/route.ts`, `app/admin/withdrawals/page.tsx` | Same single admin check as the other admin routes; an unset `SUPER_ADMIN_EMAIL` never matches; test |
| S1-45 | Booking and availability use the business timezone consistently [from the final smoke run] | M | BE | folds into S2 timezone work | `app/api/availability/route.ts` (UTC reads), `app/api/bookings/route.ts` (server-local writes) | Availability and booking agree when the server runs in `TZ=Asia/Kolkata` and `TZ=UTC`; smoke test 5 passes on a non-UTC machine |
| S1-46 | Smoke test hardening [from the final smoke run] | S | QA | round 3 | `tests/e2e/smoke.spec.ts`, `playwright.config.ts` | Cleans up its own QA appointments; waits for the dev server to be warm before test 1; password via `TEST_PASSWORD` documented (demo user is `password123`); `getByLabel` selectors (S1-30 follow-up) |
| S1-47 | Fix the 11 `react-hooks` lint warnings [from the Next 16 / ESLint 9 migration] | S | FE | round 3 | files reported by `npm run lint` (`react-hooks/*` rules) | `npm run lint` reports 0 `react-hooks` warnings; behaviour unchanged; no `eslint-disable` added |
| S1-48 | Re-enable the login keyboard-flow e2e test [from chore/e2e-ci, open] | S | QA | round 3 | `tests/e2e/auth-screens.spec.ts` (`test.fixme` "keyboard-only flow") | Diagnose why Enter on the password field never shows the mocked "Invalid email or password." message after the Tab order was corrected; fix the test or the app; `test.fixme` removed and the test passes |
| S1-49 | Re-enable the signup resend-cooldown e2e test [from chore/e2e-ci, open] | S | QA | round 3 | `tests/e2e/auth-screens.spec.ts` (`test.fixme` "signup: toggle, autocomplete, resend with 60s cooldown") | `page.clock.runFor(30s)` does not move the resend countdown (stays at 55s); make the countdown testable or drive it another way; `test.fixme` removed and the test passes |

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
| ✅ S2-01 | Business timezone; store UTC instants [B-05] | L | BE | A, after S1-19 | `prisma/schema.prisma` (`Business.timezone`), new `lib/time.ts`, `app/api/availability`, `app/api/bookings`, `app/api/appointments`, `app/api/cron/reminders`, `lib/email.tsx` (`.ics`, date labels), dashboard date formatting | Timezone chosen at signup (default `Asia/Kolkata`); `Appointment.date` is a true UTC instant; slot generation, display, emails, reminders and `.ics` use the business zone; migration converts existing rows; the same tests pass under `TZ=UTC` and `TZ=Asia/Kolkata`; DST case tested with a non-India zone |
| ✅ S2-02 | Atomic booking with locking [B-04] | M | BE | A, after S2-01 | `app/api/bookings/route.ts:67-141,243-253`, `app/api/appointments/route.ts`, `app/api/appointments/[id]/route.ts`, `lib/booking.ts` | Conflict check and insert in one `$transaction` with an advisory lock (or serialisable with retry); side effects run after commit; a concurrency test fires 20 requests at one slot and exactly one succeeds; owner-created bookings use the same check (with an explicit "allow overlap" option for the owner) |
| ✅ S2-03 | Per-staff availability engine [B-15] | L | BE | A, after S2-02 | `lib/booking.ts`, `app/api/availability`, `app/api/bookings`, `Staff.workingHours` schema and Zod, `StaffService` use | Availability and conflicts computed per staff; staff working hours and `StaffService` links enforced; "any available" picks a free staff member deterministically; two staff can be booked at 11:00; services only offer staff who perform them; unit tests for multi-staff, overlaps and capacity |
| ✅ S2-04 | Time off, holidays, breaks, notice, buffers, advance window [B-21] | L | BE | B (schema first), before S2-03 finishes | `prisma/schema.prisma` (`TimeOff`/`BlockedDate`, break fields, `minNoticeMinutes`, `maxAdvanceDays`, `Service.bufferMinutes`), `lib/booking.ts`, `app/api/availability`, new `app/api/time-off` | Owner can block dates or ranges for the business or a staff member, add a lunch break, set minimum notice and maximum advance days, set a per-service buffer; availability respects all of them; migration backwards compatible; tests |
| ✅ S2-05 | Public booking honours plan, active status, service state [B-06] | S | BE | A, after S2-03 | `app/api/bookings/route.ts:37-48`, `lib/plans.ts`, `lib/getFeatures.ts` | Expired or limit-exceeded business returns 402 with a friendly message on public bookings; inactive services rejected; limits read from the database (`getBusinessFeatures`), not code defaults; tests |
| ✅ S2-06 | Bound slot generation and settings inputs [B-07] | S | BE | A (with S2-01) | `app/api/availability/route.ts:6-18,36-41`, `lib/booking.ts` | `generateSlots` guards `step > 0` and a maximum slot count; malformed stored JSON falls back to defaults instead of 500; `slotInterval: 0` cannot hang the endpoint (regression test) |
| ✅ S2-07 | Reschedule and cancel rules on the server [B-22] | M | BE | A, after S2-05 | `app/api/appointments/[id]/route.ts:43-49`, `lib/booking.ts` | Reschedule to a past or conflicting time returns 409 or 400; elapsed slots today are not offered; cancel and no-show free the slot; transitions covered by tests |
| S2-08 | Phone-only clients and client dedupe [B-24] | M | BE | B | `prisma/schema.prisma` (`Client.email` optional, unique on phone), booking and appointment routes, validation | A booking works with phone only; clients de-duplicated by normalised email or phone within a business; mixed-case emails merge; migration safe; tests |
| S2-09 | Proper multi-service model [B-25] | M | BE | B | `prisma/schema.prisma` (`AppointmentService`), booking and appointment routes, dashboard queries, migration from `notes` `__services__:` | Services stored as rows with price and duration snapshots; old notes migrated; no code parses `notes` for services; analytics and exports use the new rows |
| S2-10 | Money and status types [B-26] | M | BE | B, after S2-09 | `prisma/schema.prisma`, all price/amount code, `lib/currency.ts` | Prices stored as integer minor units (or `Decimal`); `status`, `paymentStatus`, `paymentMode` as enums; migration converts data; no float arithmetic on money; tests (wallet code is Step 5 and is not touched here beyond type adaptation, which the owner must approve first) |
| ✅ S2-11 | Database indexes [B-27] | S | BE | B | `prisma/schema.prisma` | Indexes on `Appointment(businessId, date)`, `(staffId, date)`, `(date, reminderSent)`, `Client(businessId)`, `Notification(businessId, createdAt)`, `VerificationToken(email)`, `(expiresAt)`; `EXPLAIN` on availability and dashboard queries shows index use |
| S2-12 | Non-blocking side effects [B-28] | M | BE | E, after S2-02 | `app/api/bookings/route.ts:160-192`, `lib/email.tsx`, `lib/whatsapp.ts`, `lib/push.ts` | Email, WhatsApp and push run after the response using `after()`; failures are recorded in `EmailLog` and visible to the owner; booking response time no longer depends on providers (groundwork for the Step 6 outbox) |
| S2-13 | Staff working hours editor and service assignment [new] | M | FE | C, after S2-03 API | `app/dashboard/staff/StaffClient.tsx`, `app/dashboard/services/ServicesClient.tsx`, `components/ui/*` | Owner sets each staff member's weekly hours and which services they perform; the booking page only offers matching staff; works at 375px; labelled inputs; screenshots |
| S2-14 | Time off, holidays, breaks, notice and buffer settings [new] | M | FE | C, after S2-04 API | `app/dashboard/settings/SettingsClient.tsx`, new `app/dashboard/time-off` | Owner can add a holiday, staff leave and a lunch break in under a minute on a phone; set notice and advance rules; empty states explain each; screenshots |
| S2-15 | Calendar usable on a phone [A-13 + new] | M | FE | D | `app/dashboard/calendar/*` | Default to Day view at 375px with readable event cards; week view horizontally scrollable with a sticky time column; staff filter; month view; tap an empty slot to create a booking; screenshots |
| S2-16 | Appointment management screens: reschedule, delete, confirm, no-show [new] | M | FE | C, after S2-07 | `app/dashboard/appointments/AppointmentsClient.tsx` | Owner can reschedule from the booking window (conflicts shown), cancel with a reason, mark no-show or complete in one tap, and delete from the list with confirmation; client email behaviour unchanged from the API |
| S2-17 | Booking page polish [A-28, A-29] | M | FE | D, after S2-01 and S2-03 | `app/b/[slug]/BookingClient.tsx` | Step names visible at 375px; "Taken" badge no longer overlaps the time; helper text explains a disabled Continue; timezone shown; elapsed times today hidden; group spots shown; screenshots |
| S2-18 | Booking-engine test suite [B-37] | L | QA | F | `tests/booking/*`, `tests/e2e/booking.spec.ts` | Concurrency, per-staff, time-off, notice and buffer, plan limit and tenant-isolation tests; every test passes under both time zones; Playwright journey at 375px and 1440px; pass counts reported |
| S2-19 | Security review of Step 2 | S | SEC | F, last | n/a | No Critical or High open; special attention to lock misuse, IDOR on staff and time-off routes |

---

## Step 3 — Business type packs, terminology, theme + design system

**Goal:** a business picks one of five packs (**Clinic** with a Dental wording variant, **Salon & Spa**, **Lawyer**, **Fitness**, **Other**) and gets the right words (customer, provider, appointment, service, singular and plural), icons, default services, default booking mode and email wording everywhere through one `t(term)` helper; every plan can set a theme colour; one consistent, accessible design system. Design and chunk list: `docs/steps-3-5-design.md` (chunks 1 to 4). Hindi is deferred (L-01).
**Exit criteria:** all five packs validate and apply idempotently; no hard-coded customer/provider/appointment/service words on the website, booking page, dashboard or emails; theme colour works on every plan; no hard-coded colours outside tokens; DOM checks report zero unlabelled inputs and nameless buttons; screenshots at 375px and 1440px.

**Parallel plan (lean mode: run sequentially).** Pack chunks first (S3-01 → S3-02 → S3-03, S3-04), then the design system (S3-05 → S3-06 → S3-07 to S3-09), then the rest.

| Lane | Agent | Items (in order) |
|---|---|---|
| A: tokens and kit | FE | S3-05 → S3-06 |
| B: accessibility and states (after A) | FE | S3-07, S3-08, S3-09, S3-12 |
| C: packs and terms | BE then FE | S3-01 → S3-02 → S3-03; S3-04 |
| D: website and India defaults (after C) | FE + BE | S3-10, S3-11 |
| F: tests | QA, SEC | S3-13, S3-14; S3-15 last |

| ID | Title | Eff | Agent | Lane / depends | Files | Acceptance criteria |
|---|---|---|---|---|---|---|
| ✅ S3-01 | Pack engine and `t(term)` helper [new] | M | BE | C, chunk 1 `step-3/packs-terms-engine` | `prisma/schema.prisma` (`PackId`, `Business.packId`, `termsOverride`), new `lib/packs/*`, `lib/terms.ts` | Packs validated with Zod; `t(term, {plural, cap})` resolves override → pack → Other and works in server code, client components (provider) and emails; migration backfills `packId` from `businessType`; unit tests for fallback, plurals and overrides |
| ✅ S3-02 | Five packs and pack picker at onboarding [A-24, A-25] | L | BE + FE | C, chunk 2 `step-3/packs-onboarding`, after S3-01 | `lib/packs/{clinic,salon-spa,lawyer,fitness,other}.ts`, `lib/createBusiness.ts`, `app/onboarding/*`, `app/signup`, settings | Each pack has terms, icon set, default services (INR for India), default booking mode, email wording and theme presets; Dental is a wording variant inside Clinic; Lawyer wording is scheduling only (no legal advice); applying a pack is idempotent and never overwrites existing data; a fresh account reaches a shareable booking page in under 5 minutes; tests |
| ✅ S3-03 | Terminology rollout [new] | M | FE | C, chunk 3 `step-3/terms-rollout`, after S3-02 | tenant website, booking page, dashboard, `emails/*`, `lib/email.tsx` | Every customer/provider/appointment/service word on those surfaces comes from `t()`; email string snapshots per pack |
| ✅ S3-04 | Theme colour picker on all plans [A-08 part] | S | FE | C, chunk 4 `step-3/theme-colour`, after S3-01 | settings, `app/[slug]`, booking page, CSS variables | Pack presets plus hex picker; contrast-safe foreground computed; applied to website and booking page; not gated by plan; hex validated server-side (no CSS injection) |
| S3-05 | Design tokens and type scale [A-18, A-19, A-21] | M | FE | A | `app/globals.css`, `tailwind.config.ts`, `app/layout.tsx`, tokens doc | One documented token set (ink, muted, border, surface, accent, status, radius, shadow, type scale); platform accent vs per-tenant colour separated; font variables renamed to match the fonts loaded; hard-coded `#6b6b80`, `#e8e6e0`, `#f8f7f4` replaced by tokens; arbitrary `text-[Npx]` removed |
| S3-06 | Component kit consolidation [A-20] | L | FE | A, after S3-05 | `components/ui/*`, the 53 files with raw `<button>`, stat tiles, modals, admin `Field` | One `Button`, `Input` (label and id generated by default), `Card`, `StatCard`, `Modal` (focus trap, Escape), `Select`, `Badge`, plus new `EmptyState`, `ErrorState`, `Toast`; duplicates removed; before/after screenshots show no regressions |
| S3-07 | Accessibility pass [A-09, A-10, A-11, A-12, A-15, A-16, A-17] | L | FE | B1/B2/B3, after S3-06 | auth + booking pages; dashboard pages; admin pages | `DOM-CHECKS`: zero unlabelled inputs, zero nameless icon buttons, tap targets under 44px reduced to documented decorative exceptions, no content text under 12px, contrast at least 4.5:1 verified with a tool, visible focus, unique titles, one `<h1>`; hydration warnings fixed (`ClientsClient.tsx:76-99`, `PlansClient.tsx:283`) |
| S3-08 | Mobile layout fixes [A-04, A-14] | M | FE | B3, after S3-06 | `components/landing/Hero.tsx` and `PhoneMockups.tsx` (layout only, no copy or claims), `app/dashboard/settings/SettingsClient.tsx`, `app/signup/page.tsx` | No horizontal scroll or clipped content at 375px on any audited page; settings tabs scroll or stack; signup fields stack below `sm`; screenshots |
| S3-09 | Loading, empty and error states everywhere [A-26, A-03 extension] | L | FE | B2, after S3-06 | all `app/dashboard/**`, `app/admin/**`, `app/blog`, `app/help`, tenant site | Every data view has loading, empty and error states; zero values read "No data yet"; KPI tiles never show misleading `$0`/`100%`; verified with a brand-new account that has a business |
| S3-10 | Tenant website defaults and imagery [A-08, A-30] | M | FE | D, after S3-01 | `lib/website.ts:95-102`, `app/[slug]/page.tsx` | "Professional services services" bug fixed (unit test); imagery and copy come from the pack; opaque nav on photo hero; tenant colour chosen at onboarding, not a hard-coded red |
| S3-11 | India defaults [A-33, C17] | S | BE | D | `prisma/schema.prisma` (`Business.currency` default INR), signup REGIONS, phone validation, formatting | INR, IST, `+91` and Indian number formatting preselected; 10-digit validation; migration only changes the default, not existing rows |
| S3-12 | One lead form component [A-20 part] | M | FE | B3 | `components/landing/*` (structure only; claims and pricing copy untouched) | Eight lead-capture components replaced by one configurable `LeadForm`; no change to wording of claims; page weight and mobile height reduced |
| S3-13 | Visual baselines and DOM budget [new] | M | QA | F, after S3-07 | `tests/e2e/visual.spec.ts`, `scripts/audit-checks.ts` | Playwright screenshots at 375px and 1440px for all audited pages with baselines; DOM-check budget (unlabelled inputs 0, nameless buttons 0, no horizontal scroll) fails the run when exceeded |
| S3-14 | Pack, terms and onboarding tests | M | QA | F, after S3-02 | `tests/packs/*`, `tests/terms.test.ts` | All five packs and the Dental variant validate; applying a pack twice is harmless; `t()` fallbacks covered; pass counts reported |
| S3-15 | Security review of Step 3 | S | SEC | F, last | n/a | Tenant-controlled values (colour, copy, images) cannot inject CSS or HTML; no Critical or High open |

---

## Step 4 — Token mode (queues)

**Goal:** any business can switch to token mode: sessions per day with minutes per appointment, atomic token numbers with estimated times, walk-in tokens, a receptionist queue screen and a public live tracking page. Design: `docs/steps-3-5-design.md` (chunks 5 to 8). The client manage link and cancellation cutoff were delivered in Step 2 (chunks 4 and 7); request-to-book, classes, recurring, resources and widget parity are deferred (L-02 to L-07).
**Exit criteria:** token numbers never collide under concurrency; ETAs recalculate after skips; Next / Not present / Not coming follow the rules and send the emails; tracking page shows no PII; works at 375px.

| Lane | Agent | Items (in order) |
|---|---|---|
| A: token engine and screens | BE then FE | S4-01 → S4-02 → S4-03 → S4-04 |
| B: tests | QA, SEC | S4-05; S4-06 last |

| ID | Title | Eff | Agent | Lane / depends | Files | Acceptance criteria |
|---|---|---|---|---|---|---|
| S4-01 | Booking mode and token sessions [new] | M | BE + FE | A, chunk 5 `step-4/token-sessions` | `prisma/schema.prisma` (`BookingMode`, `TokenSession` with optional `staffId`), `lib/tokens.ts`, settings | Owner defines sessions (weekdays, start, end, minutes per appointment), business-wide or per staff; settings show live capacity per session and per day; overlapping sessions rejected; SLOT stays the default; tests |
| S4-02 | Atomic token booking [new] | M | BE + FE | A, chunk 6 `step-4/token-booking`, after S4-01 | `app/api/bookings`, `app/api/availability`, booking page, email template | Token number and `estimatedAt = start + (n-1) x minutes` assigned inside the booking lock per session + staff; full sessions rejected; number and time shown on screen and in the email; tests |
| S4-03 | Receptionist queue screen and walk-ins [new, replaces old walk-in/queue item] | L | BE + FE | A, chunk 7 `step-4/queue-screen`, after S4-02 | `app/dashboard/queue`, `app/api/queue/*`, email templates | Walk-in tokens from the dashboard (no fee); Next; Not present moves back 2 positions (to the end when fewer than 2 behind) and emails the new position and time, a second one closes as No-show with email and no refund; Not coming moves to the same session on the next working day at the end of the queue with the Rs 10 carried over (max one carry-over, a second closes the appointment); ETAs recalculate; tests |
| S4-04 | Public live tracking page [new] | M | BE + FE | A, chunk 8 `step-4/live-tracking`, after S4-03 | `app/[slug]/q/[code]`, `app/api/queue/track` | Signed code; "Now serving #8 · you are #12 · ~25 min"; polls every 15s; rate limited; no PII; tests |
| S4-05 | Token mode test suite | M | QA | B | `tests/tokens/*` | Numbering under concurrency, capacity, ETA after skips, queue rules, carry-over, per-staff queues; pass counts reported |
| S4-06 | Security review of Step 4 | S | SEC | B, last | n/a | Tracking-code forgery and enumeration, queue actions scoped to `businessId`, rate limits; no Critical or High open |

---

## Step 5 — India monetization (Cashfree)

**Goal:** India Free businesses pay Calvy Rs 10 per public online booking, collected before confirmation; owners choose "booking charge only" or "full fee online" with who pays the platform fee; split payouts through the gateway's marketplace feature; paid India plans billed by Cashfree subscriptions. Design: `docs/steps-3-5-design.md` (chunks 9 to 13).
**This step and Step 7 are the only steps that work on payment gateway code.** Chunks 9 to 13 are authorised by the owner (2026-10-24). Cashfree replaces Razorpay for India; wallet and withdrawals are retired; Razorpay code is removed once Cashfree works. International businesses are pay at venue until Step 7.
**Exit criteria:** fee matrix tests pass; a booking is confirmed only after payment success; holds expire and release; webhooks are idempotent; end to end in Cashfree test mode; no Razorpay code left after S5-05.

| Lane | Agent | Items (in order) |
|---|---|---|
| A: payments (authorised) | BE | S5-01 → S5-02 → S5-03 → S5-04 → S5-05 |
| B: plans, limits, trial | BE | S5-06 → S5-07 → S5-08 |
| C: screens and admin | FE, BE | S5-09, S5-10 |
| D: tests | QA, SEC | S5-11; S5-12 last |

| ID | Title | Eff | Agent | Lane / depends | Files | Acceptance criteria |
|---|---|---|---|---|---|---|
| S5-01 | Payments core: provider interface, mock, ledger [D-01] | M | BE | A, chunk 9 `step-5/payments-core` | `prisma/schema.prisma` (`Payment`, `PlatformFeeEntry`, `WebhookEvent`, enums, `PlanConfig.platformFeeMinorIN`), `lib/payments/*`, `lib/fees.ts` | Provider interface (`createOrder`, `verifyWebhook`, `refund`, `createSplitAccount`) with a mock; fee calculator for India Free/paid, both modes and both payers; constant-time webhook signatures on the raw body; idempotent events; tests |
| S5-02 | Pending booking, hold and UPI-first checkout [D-02, D-04] | M | BE + FE | A, chunk 10 `step-5/pending-holds-checkout`, after S5-01 | `app/api/bookings`, checkout page, cron sweep | `pending_payment` booking holds the slot or token for 10 minutes (group holds count against capacity); confirm on payment success only; release on failure or timeout; paid after expiry is refunded; refunds: business cancel = full incl. Rs 10, customer cancel = Rs 10 kept and service fee refunded only before the cutoff; UPI shown first as recommended; tests |
| S5-03 | Country and online payment settings [new] | M | BE + FE | A, chunk 11 `step-5/online-payment-settings`, after S5-02 | `Business.country` (required, no default, backfill INR → IN else US), signup, settings, receipt | Country required at signup, pre-filled from the detected region; online payment mode and fee-payer toggle with worked examples; paid India plans waive the Rs 10; GST-inclusive receipt with Calvy/Raybit details from config; tests |
| S5-04 | Cashfree adapter and split payouts [D-06, D-07] | L | BE | A, chunk 12 `step-5/cashfree-split`, after S5-03 | `lib/payments/cashfree.ts`, `PayoutAccount`, webhook route | Cashfree test credentials; vendor (linked account) onboarding with KYC states; business share split at order creation, never manual withdrawals; bank and PAN data stay with the gateway or are encrypted; tests |
| S5-05 | Cashfree subscriptions; remove Razorpay; retire wallet [D-03, D-05] | L | BE | A, chunk 13 `step-5/subscriptions-cashfree`, after S5-04 and S5-06 | `app/api/billing/*`, webhook route, `lib/razorpay.ts`, `app/api/razorpay/**`, wallet and withdrawal code | Cashfree subscriptions for India Pro/Business (monthly and yearly); plan activation via webhook; downgrade to Free on expiry with grace and failed-payment emails; then Razorpay code, wallet and withdrawals removed; tests |
| S5-06 | One source of truth for plans, in INR [A-07 product side] | M | BE | B | `lib/plans.ts`, `PlanConfig`, `app/admin/plans`, seed | INR prices and limits live in the database only; code defaults used just for seeding; the plan table in the admin, billing screen and API enforcement all read the same values (fixes the code-default vs database drift) |
| S5-07 | Enforce limits and flags truthfully [new] | M | BE | B, after S5-06 | `app/api/bookings`, cron and messaging code, `app/api/broadcasts`, `app/api/support`, upload, settings | Every flag and limit shown on the plan is enforced in the API as well as the page: public bookings, email and WhatsApp reminders, broadcasts per month, image upload, slot interval, group booking, CSV export; support tickets available to every plan (priority is a speed, not access); tests per flag |
| S5-08 | Real trial or no trial [new] | M | BE | B, after S5-06 | `lib/plans.ts` (`isActivePlan`, `trialDaysLeft`), `lib/createBusiness.ts`, admin tenants | Decision recorded: either a working 14-day trial of a paid plan (start date, end date, banner, automatic move to Free) or all trial wording removed; admin "extend trial" works or is removed; tests for expiry |
| S5-09 | Billing screens [new] | M | FE | C, after S5-07 and S5-05 | `app/dashboard/billing/*` | Plan comparison reads from the database; INR prices; clear current plan, renewal date, invoices list, cancel and resume; works at 375px |
| S5-10 | Admin revenue and tenant tools [B-39] | M | BE then FE | D | `app/admin/revenue`, `app/admin/tenants`, `app/api/admin/*` | "Revenue" shows Calvy's own subscription income (MRR) and, separately, tenant bookings per currency; plan changes validated and logged; delete requires confirmation and is logged |
| S5-11 | Payments and billing test suite [D-08] | L | QA | D | `tests/payments/*` | Webhook fixtures for paid, failed, refunded and duplicate events; hold expiry; fee ledger totals; subscription state machine; end to end in Cashfree test mode; pass counts reported |
| S5-12 | Security review of Step 5 | M | SEC | D, last | n/a (explicitly includes payment code) | Signature handling, replay, amount tampering, double credit or refund, PII at the gateway; no Critical or High open; **payments stay off until this passes** |

---

## Step 6 — Messaging with an OpenWA adapter

**Goal:** messages that actually arrive, in the client's language, with consent and a record of what was sent, over a provider interface so WhatsApp can be delivered by the official Cloud API, by a self-hosted OpenWA session, or by click-to-chat links.
**Exit criteria:** confirmations and reminders go through one outbox with retries and delivery status; the provider is selectable per business; opt-out works; owners can see what was sent.

**Decision (OpenWA).** OpenWA is **opt-in per business**. **Each business connects its own WhatsApp number by scanning a QR code; there is no shared Calvy number.** Calvy recommends a **separate business number, not a personal one**, and says so on the connect screen. Each business gets its own isolated OpenWA session.

**Risk note (OpenWA).** OpenWA drives a normal WhatsApp account through WhatsApp Web. It is an unofficial route: it can break when WhatsApp changes, and WhatsApp can ban numbers that automate messages, which would hit the business's own number. The adapter is therefore **optional, per business, off by default, opt-in messages only, with strict throttling**; the official Cloud API with approved templates remains the recommended default, and click-to-chat links remain the always-available fallback. This is documented in the owner screens and in `docs/messaging.md`.

**Parallel plan.** `S6-01` (provider interface and outbox) goes first. After it, the providers (lanes A, B, C) are independent files and run in parallel; the reminder scheduler (lane D) and consent (lane E) follow. Frontend items follow their APIs.

| Lane | Agent | Items |
|---|---|---|
| A: core | BE | S6-01 → S6-02 |
| B: email | BE | S6-03 (after S6-01) |
| C: WhatsApp Cloud API | BE | S6-04 (after S6-01) |
| D: OpenWA | BE | S6-05 (after S6-01) |
| E: consent and broadcasts | BE | S6-07 → S6-10 (after S6-01) |
| F: screens | FE | S6-06, S6-08, S6-09, S6-11, S6-17 (after their APIs) |
| G: optional SMS | BE | S6-14 (only if the owner wants SMS) |
| H: tests | QA, SEC | S6-15, S6-16 |

| ID | Title | Eff | Agent | Lane / depends | Files | Acceptance criteria |
|---|---|---|---|---|---|---|
| S6-01 | Messaging core: provider interface, outbox, retries, status [new, extends B-28] | L | BE | A (first), after S2-12 | new `lib/messaging/{provider.ts,outbox.ts,dispatcher.ts}`, schema (`MessageJob`, generalised `MessageLog`), `lib/email.tsx`, `lib/whatsapp.ts` | One `MessageProvider` interface (`send`, `status`, `healthCheck`, supported channels); all outgoing messages are queued in an outbox with idempotency keys, retry with backoff, dead-letter state and delivery status; a fake provider for tests; existing email and WhatsApp code moved behind it with unchanged behaviour |
| S6-02 | Reminder scheduler rewrite [B-10, C11] | L | BE | A, after S6-01 and S2-01 | `app/api/cron/reminders/route.ts`, schema (`reminderSentAt`, send-time rules), `lib/messaging/*` | Reminders at configurable offsets (24h and 2h) computed in the business timezone; row claimed before send so concurrent runs never double-send; failures retried, never marked sent; bounded concurrency and batching; plan flags respected; runs more often than daily via the scheduler from S9-06 |
| S6-03 | Email deliverability and identity [B-14] | M | BE | B, after S6-01 | `lib/email.tsx:16-17`, env, `app/api/webhooks/resend`, DNS notes | Production refuses to start with the sandbox sender; verified domain with SPF, DKIM, DMARC; `Reply-To` is the business email and the display name is the business; bounce and complaint webhooks mark the log and suppress the address |
| S6-04 | WhatsApp Cloud API provider with templates [B-13] | L | BE | C, after S6-01 | new `lib/messaging/providers/whatsapp-cloud.ts`, template registry, `app/api/webhooks/whatsapp` | Template messages (`type: "template"`) for confirmation, reminder, cancel, reschedule, with language variants; E.164 normalisation with `+91` default; delivery-status webhook stored; verification of the webhook signature; no phone numbers in logs; per-business sender number supported |
| S6-05 | OpenWA provider adapter: one session per business [new] | L | BE | D, after S6-01 | new `lib/messaging/providers/openwa.ts`, `docs/messaging.md`, schema (`MessagingProviderConfig` with per-business `sessionId`, status, `connectedNumber`) | Implements `MessageProvider` against a self-hosted OpenWA service (URL and token from validated config, SSRF-safe allow-list) with **a separate session per business**: create a session, return the pairing QR, report status (waiting for scan, connected, disconnected), disconnect and delete the session; a business's messages only ever go out through that business's own session and number, with no fallback to a shared Calvy number; per-session throttle and daily cap; opt-in only; automatic fallback to click-to-chat when the session is unhealthy; the connect screen recommends a separate business number rather than a personal one and states the ban risk; off by default; contract tests against a fake OpenWA server, including isolation between two businesses |
| S6-06 | Click-to-chat and share tools [A-25] | S | FE | F | `app/dashboard/booking-page/BookingPageClient.tsx`, `app/dashboard/appointments/*` | One tap opens WhatsApp with a prefilled confirmation or reminder to the client; copy-link and QR share; works without any provider configured |
| S6-07 | Consent, opt-out and suppression [C12] | M | BE | E, after S6-01 | schema (`Consent`, `Suppression`), booking form field, manage link, message footer | Consent captured at booking (channel-specific); every marketing message carries an unsubscribe action; suppressed addresses and numbers are never messaged; transactional messages are distinguished from marketing; tests |
| S6-08 | Message template editor [new] | L | FE | F, after S6-01 and S3-01 | `app/dashboard/settings/messages`, `lib/messaging/templates.ts` | Owner edits confirmation, reminder, cancel and reschedule text with variables and live preview in English and Hindi; defaults come from the Industry Pack; WhatsApp templates show their approval status; works at 375px |
| S6-09 | Messages log and delivery UI [new] | M | FE | F, after S6-01 | `app/dashboard/messages` | Owner sees what was sent to whom, when, over which channel, delivered or failed with a plain reason, and can resend or use click-to-chat |
| S6-10 | Broadcasts rewrite [B-33] | L | BE | E, after S6-07 | `app/api/broadcasts/*`, `app/dashboard/broadcasts/*` (FE part split into S6-11) | Audience segments (all, recent, lapsed), consent respected, per-month limit enforced from the plan, sent through the outbox in chunks, business name and subject escaped, preview and test-send |
| S6-11 | Broadcasts screens [new] | M | FE | F, after S6-10 | `app/dashboard/broadcasts/*` | Segment picker, preview, scheduled send, history with delivery counts, empty and error states |
| S6-12 | Staff notifications [new] | M | BE | E, after S6-01 | `lib/messaging/*`, notification code | Staff (not only the owner) can be notified of their bookings by push, WhatsApp or email according to preference (staff logins arrive in Step 8; until then via the staff phone number) |
| S6-13 | Localised client messages [A-32 link] | M | BE | E, after L-01 | `emails/templates.tsx`, WhatsApp templates | Client messages sent in the language chosen at booking; tests for English and Hindi rendering |
| S6-14 | SMS provider (optional, DLT) [B-35] | L | BE | E (optional, can be dropped) | `lib/messaging/providers/sms.ts` | Only if the owner decides to offer SMS; otherwise this item is closed and every SMS claim stays removed |
| S6-15 | Messaging test suite | L | QA | G | `tests/messaging/*` | Provider contract tests with the fake provider and fake OpenWA; template rendering; idempotency; retry and dead-letter; consent and suppression; timezone of reminders; pass counts reported |
| S6-16 | Security review of Step 6 | S | SEC | G, last | n/a | Webhook signature verification, SSRF through the OpenWA URL, secrets storage, PII in logs, injection in templates; no Critical or High open |
| S6-17 | WhatsApp connect screen (QR pairing) [new] | M | FE | F, after S6-05 | `app/dashboard/settings/whatsapp`, `components/ui/*` | Owner opts in and scans the QR with the WhatsApp app on **their own business number**; sees waiting, connected and disconnected states with plain-language help; can disconnect; clear text recommends a separate business number and explains the risk of automated messaging; loading, empty and error states; works at 375px; screenshots |

---

## Step 7 — International payments and subscription billing

**Goal:** international businesses can take online payments and Calvy can bill international subscriptions, through Stripe Connect behind the Step 5 provider interface. Until this step, international bookings are pay at venue and carry no per-booking fee.
**Exit criteria:** Stripe Connect works in test mode end to end; split payouts; subscriptions activate and expire correctly; security review passes.

| ID | Title | Eff | Agent | Lane / depends | Files | Acceptance criteria |
|---|---|---|---|---|---|---|
| S7-01 | Stripe Connect provider [new] | L | BE | after S5-12 | `lib/payments/stripe.ts`, webhook route, `PayProvider.STRIPE` | Implements the provider interface; connected-account onboarding; FULL_ONLINE for international businesses; no per-booking fee; tests in Stripe test mode |
| S7-02 | International subscription billing and invoices [D-03 international] | L | BE + FE | after S7-01 | `app/api/billing/*`, billing screen | Monthly and yearly plans in the business's currency; invoices; dunning; downgrade on expiry; tests |
| S7-03 | Deposits and no-show fees [new] | L | BE | B, after S2-07 and S5-02 | policy fields from S2-07, booking payment code | Optional deposit or fee on booking, refunded or kept per the cancellation policy; tests; disabled by default |
| S7-04 | Coupons and referrals (optional) [new] | M | BE | after S5-05 | plans and billing | Only if the owner wants them; otherwise closed |
| S7-05 | International payments tests and security review | M | QA, SEC | last | `tests/payments/*` | Webhook fixtures, state machine, signature and replay checks; no Critical or High open |

---

## Step 8 — Team & mobile

**Goal:** the whole team can use Calvy from a phone, each seeing only what they should; the installed app feels native.
**Exit criteria:** an owner can invite a receptionist and a stylist; the stylist sees only their own day; permission tests pass for every route; the PWA installs and opens the dashboard.

**Parallel plan.** `S8-01` (roles model) blocks the rest of the backend work. After it, authorisation sweep (lane A) and invites (lane B) run in parallel only if the sweep does not edit invite files; frontend lanes follow the APIs.

| Lane | Agent | Items |
|---|---|---|
| A: roles | BE | S8-01 → S8-02 |
| B: invites and account | BE | S8-03 (after S8-01), S8-08 |
| C: calendar feeds | BE | S8-09 |
| D: team screens | FE | S8-04, S8-05 (after S8-02) |
| E: PWA | FE (+BE for push) | S8-06, S8-07 |
| F: audit log | BE | S8-10 (after S8-02) |
| G: tests | QA, SEC | S8-12, S8-13 |

| ID | Title | Eff | Agent | Lane / depends | Files | Acceptance criteria |
|---|---|---|---|---|---|---|
| S8-01 | Staff logins and roles model [B-31] | L | BE | A (first) | `prisma/schema.prisma` (user-to-staff link, role enum: owner, manager, receptionist, staff), `lib/auth.ts`, new `lib/permissions.ts` (`can(user, action, resource)`) | Roles and a permission matrix defined once; JWT carries role and staff id; one owner per business remains; migration keeps existing owners as owners; unit tests for the matrix |
| S8-02 | Authorisation sweep [B-31] | L | BE | A, after S8-01 | every `app/api/**` route that is not admin or payment, dashboard server pages | Each route calls `can()`; staff see only their own appointments and clients' basic details; receptionist can book and manage but not billing or settings; cross-role tests per route |
| S8-03 | Invite flow [B-31] | M | BE | B, after S8-01 | `app/api/team/*`, `emails/templates.tsx` | Owner invites by email or phone; single-use expiring invite; role chosen; revoke and re-send; invited user sets a password; tests |
| S8-04 | Team screens: invites and roles [new] | M | FE | D, after S8-03 | `app/dashboard/staff/*`, `app/dashboard/team` | Owner invites, changes role, deactivates a member; role explained in plain language; works at 375px |
| S8-05 | Staff mobile experience: "My day" [new] | L | FE | D, after S8-02 | `app/dashboard/page.tsx` variant, bottom navigation by role, `app/dashboard/calendar` | A stylist opens the app to today's bookings in one screen; one-tap check-in, complete, no-show; own calendar only; owner navigation pruned per role; tap targets at least 44px; screenshots per role at 375px |
| S8-06 | PWA hardening [new] | M | FE | E | `public/manifest.json` (`start_url: /dashboard`), `public/sw.js`, install prompt, icons | Installed app opens the dashboard; update prompt when a new version ships; offline read-only view of today's schedule; Lighthouse PWA checks pass; screenshots |
| S8-07 | Push per user and preferences [new] | M | BE + FE | E, after S8-01 | `lib/push.ts`, `app/api/push/*`, notification settings screen | Push subscriptions belong to a user, not only a business; each user chooses which events they receive; permission prompt shown at a sensible moment; tests |
| S8-08 | Account export and deletion [B-32] | M | BE | B | `app/api/account/*`, settings screen (FE part under S8-04 review) | Owner exports business data (CSV and JSON) and can delete the account; a client's data can be erased on request; documented in the privacy page text for Step 10 |
| S8-09 | Calendar feeds [C20] | M | BE | C | `app/api/calendar/[token]/feed.ics` | A private, revocable iCal feed per staff member and for the owner that Google, Apple and Outlook calendars can subscribe to; times correct in the business timezone; two-way Google sync recorded as a later item |
| S8-10 | Audit log [new] | M | BE | F, after S8-02 | schema (`AuditLog`), `lib/audit.ts`, admin and owner viewing | Who changed what and when for bookings, staff, services, settings and plan changes; owner sees their own business log; no PII beyond ids |
| S8-11 | Multiple locations (optional) [C22] | L | BE | after S8-02 | schema (`Location`), booking and availability | Only if the owner chooses to support chains; otherwise deferred to after launch |
| S8-12 | Role and permission test matrix | L | QA | G | `tests/permissions/*`, `tests/e2e/team.spec.ts` | Every route tested for each role (allowed and denied); invite abuse cases; Playwright journey per role at 375px; pass counts reported |
| S8-13 | Security review of Step 8 | S | SEC | G, last | n/a | Privilege escalation, invite-token handling, push subscription ownership, feed token leakage; no Critical or High open |

---

## Step 9 — Deployment & ops

**Goal:** repeatable, observable, recoverable deployments and a tested rollback, before real customers arrive.
**Exit criteria:** CI blocks a merge that fails lint, typecheck, tests, build, smoke tests or the audit gate; staging mirrors production; a restore drill has been done; alerts reach a human.

**Parallel plan.** Mostly infrastructure and configuration, so files rarely overlap with app code. `S9-01` (CI) goes first; the rest run in parallel by area.

| Lane | Agent | Items |
|---|---|---|
| A: CI and environments | BE | S9-01 → S9-02 → S9-03; S9-17 with S9-02 |
| B: observability and ops docs | BE | S9-04, S9-05, S9-14 |
| C: scheduling and jobs | BE | S9-06 |
| D: storage | BE | S9-07 |
| E: performance | FE + BE (separate files) | S9-08, S9-18 |
| F: OpenWA hosting | BE | S9-09 |
| G: tests and review | QA, SEC | S9-13, S9-15 |

| ID | Title | Eff | Agent | Lane / depends | Files | Acceptance criteria |
|---|---|---|---|---|---|---|
| ✅ S9-01 | Continuous integration | M | BE | A (first) | `.github/workflows/ci.yml` | On every pull request: install, `npm run lint`, `npx tsc --noEmit`, `npm test`, `npm run build` against an ephemeral database with `prisma migrate deploy`, Playwright smoke at 375px and 1440px, `npm audit --omit=dev` gate, DOM-check budget; the workflow fails honestly and posts the summary |
| S9-02 | Environments: dev, staging, production | M | BE | A | Vercel project settings, Neon branches, `docs/environments.md` | Separate databases and secrets per environment; preview deployments use a Neon branch; production secrets never reach previews; staging has seeded test accounts, production never does |
| S9-03 | Migration release process | S | BE | A, after S9-02 | `docs/release.md`, CI release job | `prisma migrate deploy` runs once per release before traffic; a failed migration blocks the deploy; documented rollback (forward-fix policy, backups first) |
| S9-04 | Observability and alerting [B-17 follow-up] | M | BE | B | Sentry config, uptime monitor, log drain, cron monitor | Errors, slow queries and failed jobs alert a named person; uptime check on `/api/health` and a booking page; dashboards for outbox failures and cron runs |
| S9-05 | Backups and restore drill | M | owner + BE | B | Neon PITR settings, `docs/runbooks/restore.md` | Point-in-time recovery enabled; a restore into a scratch database is performed and verified; recovery time recorded |
| S9-06 | Scheduler for reminders and outbox | M | BE | C | `vercel.json` or an external scheduler/queue, `app/api/cron/*` | Reminder and outbox workers run at least every 5 minutes; protected by the cron secret; job health visible; no duplicate runs cause duplicate sends |
| S9-07 | Storage adapter [B-36] | M | BE | D | `lib/storage/*`, upload routes | Adapter for Vercel Blob or S3/R2 with local-disk in development; quotas; old files deleted on replace; app runs without Vercel services |
| S9-08 | Performance budget | M | FE + BE | E | `tests/perf/*`, bundle config, query review | Lighthouse performance budget on throttled mobile for the booking page and dashboard; heaviest queries explained and indexed; availability cached safely; image optimisation |
| S9-09 | OpenWA hosting for many sessions | M | BE | F, after S6-05 | `deploy/openwa/docker-compose.yml`, `docs/messaging.md` | Separate container or VM sized for one session per connected business (memory and CPU per session measured, a maximum number of sessions enforced with a clear message); isolated persistent per-business session storage; secret management; health check and restart policy with automatic session restore; never co-located with the app's database credentials |
| S9-10 | Secrets management and rotation procedure | S | BE | A | `docs/secrets.md` | Where each secret lives, who can read it, rotation steps and dates; confirms nothing sensitive remains in the repository |
| S9-11 | Dependency automation | S | BE | A | `.github/dependabot.yml` | Weekly update pull requests; security updates grouped; major framework upgrades flagged for a decision |
| S9-12 | Feature flags | S | BE | A | `lib/flags.ts` | Database or env flags for payments, OpenWA, request mode, classes; changes without redeploy; admin can view them |
| S9-13 | Load test | M | QA | G | `tests/load/*` (k6 or similar) | The booking path and availability endpoint sustain a stated number of concurrent users within latency targets; rate limits verified; no double bookings under load |
| S9-14 | Runbooks | M | BE | B | `docs/runbooks/*` | Incident response, rollback, database restore, WhatsApp number ban, email deliverability drop, leaked secret |
| S9-15 | Security review: infrastructure and headers | S | SEC | G, last | n/a | CSP moved from report-only to enforced with no regressions; transport, cookies, secrets handling, CI permissions; no Critical or High open |
| S9-16 | Domains, wildcard TLS and email DNS | S | owner + BE | A | DNS, Vercel domains | Wildcard subdomain certificate works; SPF, DKIM, DMARC verified; slug routing tested on the real domain |
| S9-17 | Production database and app in the same region, no autosuspend [new] | S | owner + BE | A, with S9-02 | Neon project settings, Vercel function region, `docs/environments.md` | The production Neon database is created in the region closest to our users (Asia Pacific, for example Singapore) and the Vercel functions run in the same region (`regions` in `vercel.json` or project settings); autosuspend (scale to zero) is disabled on the production compute so the first request after idle is not slow or failing; staging may keep autosuspend; measured database round trip from the app is recorded in `docs/environments.md` (target: under 10 ms per query in production). Why: from a laptop to a distant region each query took long enough that a reschedule transaction exceeded Prisma's 5 s limit |
| S9-18 | Narrow slot re-check inside the booking lock [new] | M | BE | E, after S2-03 | `lib/booking.ts` (`bookExclusive`), `lib/availability.ts`, `app/api/bookings/route.ts`, `app/api/appointments/route.ts`, `app/api/appointments/[id]/route.ts` | Inside the locked transaction, re-check only the single requested slot (that staff member, that interval: overlapping appointments with buffers, time off, working hours for that day) with one or two narrow queries, instead of rebuilding the full availability for the day; the full calculation still runs once before the lock to choose candidates; locked transaction measured under about 1 s against a remote database and the 20 s timeout added in the booking-lock fix can be lowered; the concurrency test (20 parallel requests, one slot, exactly one booking) and the reschedule tests still pass; a test proves the narrow check agrees with the full engine on conflicts, time off, buffers and capacity |

### Pre-launch security checklist

Complete every item before the first real customer (see also S1-01, S9-02, S9-10).

- [ ] Fresh production Neon project with new passwords (never reuse dev credentials).
- [ ] New `NEXTAUTH_SECRET`, `CRON_SECRET` and `ADMIN_SETUP_SECRET` generated for production.
- [ ] Rotate the dev Neon password and remove any secrets from `.claude/settings.json`.
- [ ] Remove or disable seed test accounts in production (`SEED_TEST_ACCOUNTS` unset).
- [ ] Change demo and test passwords; no default passwords in production.
- [ ] Fail-closed seed passwords: use the published defaults only when `DATABASE_URL` is localhost or `ALLOW_DEFAULT_SEED_PASSWORDS=1` is set (today only the Vercel gate exists in `prisma/seed.ts`).
- [ ] Later: reset test account passwords, or start a fresh production DB with or without test accounts (write the reset script then).
- [ ] Cashfree, R2 and Resend live keys exist only in the production environment, never in the repo.
- [ ] Confirm the old calvy.io production database password was rotated by Aamir.
- [ ] **Online payments go-live (Cashfree, production).** Payments are verified in the sandbox first (`docs/payments-sandbox-test.md`). For production, in this order, with live keys that only the owner creates and never pastes into chat or the repo:
  - [ ] Cashfree production account activated and approved; live App ID and Secret Key created.
  - [ ] Vercel **Production** environment only: `CASHFREE_APP_ID`, `CASHFREE_SECRET_KEY`, `CASHFREE_ENV=production`. Sandbox keys stay in Preview/Development.
  - [ ] `NEXT_PUBLIC_APP_URL` is the real https domain; `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` set (the rate limiter is per-instance memory without them); `CRON_SECRET` set (lapsed holds are swept by the cron).
  - [ ] Cashfree dashboard: webhook URL `https://<domain>/api/payments/cashfree/webhook` registered (version 2023-08-01); the app also sends it per order.
  - [ ] Receipt details: `CALVY_LEGAL_NAME`, `CALVY_ADDRESS`, `CALVY_GSTIN`, `CALVY_GST_RATE` (default 18) set; confirm with the accountant whether the Rs 10 fee is a tax invoice.
  - [ ] `npm run db:deploy` against the production database (follow-ups, credit reversal and onboarding migrations included).
  - [ ] Super admin opens `/api/admin/payments-health`: `ready: true`, mode `production`, no problems.
  - [ ] Then `FEATURE_ONLINE_PAYMENTS=1` and redeploy; make one real Rs 10 booking and refund it; check the receipt email, the fee ledger and the webhook log.
  - [ ] Open Low items from the payments security review: public status endpoint keyed by order id, webhook timestamp freshness check.
- [ ] **Verify phone push end to end on the production domain**: VAPID variables (`NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`) set in the Production environment; test on an iPhone with the installed app and on Android.
- [ ] Turn `PLAN_ENFORCEMENT` on in production (`PLAN_ENFORCEMENT=1`). It is off by default, which gives every business every feature and no limits; see `docs/feature-flags.md`.

---

## Step 10 — Launch prep

**Goal:** everything the public sees is true, legal and consistent, the product is verified end to end, and a small group of real businesses has used it.
**Landing-page marketing claims are changed only in this step.**
**Exit criteria:** no claim on the site that cannot be backed by data; legal pages match real data flows; final audits pass; launch checklist signed off by the owner.

**Parallel plan.** Marketing copy items (lane A) edit different files from legal and help content (lane B), so they run together. The final security audit and final QA (lane D) start only after A and B are merged.

| Lane | Agent | Items |
|---|---|---|
| A: marketing site | FE | S10-01 → S10-02 → S10-03 → S10-04 → S10-05 |
| B: content and legal | FE (copy) with owner review | S10-06, S10-07, S10-08, S10-09 |
| C: trust | FE + BE | S10-10 (optional) |
| D: verification | QA, SEC | S10-11, S10-12 (after A and B) |
| E: operations | owner + BE | S10-13, S10-14, S10-15 |

| ID | Title | Eff | Agent | Lane / depends | Files | Acceptance criteria |
|---|---|---|---|---|---|---|
| S10-01 | Remove fabricated claims and testimonials [A-01] | S | FE | A (first) | `components/landing/Hero.tsx:25,80,82`, `StatsBar.tsx`, `Testimonials.tsx`, `CTA.tsx:22`, `InlineCTABand.tsx:33`, `LeadMagnet.tsx:34`, `ProblemStatement.tsx` | No customer count, appointment count, rating, review count, named testimonial or third-party "verified" label unless backed by real, permissioned data with a link; grep for `12,000`, `3.2M`, `4.9`, `2,400`, `Trustpilot`, `Capterra` finds nothing; the page still reads well using true product facts |
| S10-02 | One honest offer, consistent copy [A-02] | S | FE | A, after S10-01 | `Hero.tsx:53`, `HeroLeadForm.tsx:50`, `CTA.tsx:33`, `Features.tsx:14,21`, `app/signup/page.tsx`, `PricingClient.tsx`, `Footer.tsx` | Free plan and trial stated once and identically, matching what S5-08 built; no "Stripe" or "SMS" unless true; "60 seconds" versus "10 minutes" resolved to the measured onboarding time; copyright year computed |
| S10-03 | Pricing section from real data [A-07 marketing side] | M | FE | A, after S5-06 | `components/landing/Pricing.tsx`, `PricingClient.tsx` | Prices in INR read from the database; discount badge computed; features grouped into about eight highlights and a comparison table; matches the billing screen |
| S10-04 | Hero call to action and dead links [A-05, A-06] | S | FE | A, after S10-02 | `components/landing/HeroLeadForm.tsx`, `Footer.tsx` | "Start free" goes to `/signup?email=…`; no `href="#"`; About, Contact, Changelog pages exist or links are removed; social links only if real profiles exist; "Razorpay setup" removed from the public footer |
| S10-05 | Shorter landing page [A-22] | M | FE | A, after S10-04 | `app/page.tsx`, `components/landing/*` | Fewer than four lead-capture surfaces; mobile page height under about 9,000px; floating CTA never overlaps the chat bubble; Lighthouse mobile within budget |
| S10-06 | Legal pages match reality [new] | M | FE + owner review | B | `app/privacy`, `app/terms`, `app/refund-policy`, `components/legal/*` | Privacy notice reflects the real data, processors and retention (including Indian data-protection requirements and messaging consent); terms and refund policy match the real plans and billing; cookie notice if cookies are used; reviewed by a qualified person before launch |
| S10-07 | Help center rewrite [new] | M | FE | B | `lib/helpArticles.ts` | Articles describe what the product actually does (no Stripe, no USD, no missing features); new articles for packs, booking modes, messaging, team roles; each article tested by following it on a phone |
| S10-08 | SEO, demo page removal, metadata [new] | S | FE | B | `app/booking/page.tsx` (remove the static demo), `app/sitemap.ts`, page metadata | The fake `/booking` demo page is removed or clearly labelled and not indexed; unique titles and descriptions; sitemap correct; canonical addresses per page (not in the root layout) |
| S10-09 | Onboarding emails and sequence [new] | M | FE | B, after S6-13 | `emails/templates.tsx` | Welcome and "get live" emails in English and Hindi; consistent offer; unsubscribe for marketing messages |
| S10-10 | Real social proof and reviews [C24] | L | FE + BE | C (optional) | new reviews feature, `components/landing/Testimonials.tsx` | Post-visit review request with a Google review link; testimonials shown only from real, permissioned customers with a source link |
| S10-11 | Final full security audit | L | SEC | D, after A and B | n/a | Whole application reviewed (including payments); every Critical and High closed; Medium items have owners and dates; written report |
| S10-12 | Final regression and acceptance test | M | QA | D, after A and B | `tests/e2e/*` | Full Playwright regression at 375px and 1440px across all journeys and roles; DOM-check budget met; load test rerun; honest pass or fail counts |
| S10-13 | Launch checklist and rollback rehearsal | M | owner + BE | E | `docs/launch-checklist.md` | Environment variables, DNS, backups, monitoring, support inbox, status page, rollback rehearsal, announcement plan all ticked and dated |
| S10-14 | Support readiness | S | owner | E | support process | Response targets, canned answers, escalation path; support tickets open to every plan (decided in S5-07) |
| S10-15 | Beta with real businesses | M | owner | E | n/a | Five to ten real businesses (a mix of the four industries) run for two weeks; every issue triaged; real feedback collected for testimonials only with permission |

---

## Later (unscheduled)

Items from the old Steps 3 and 4 that the 2026-10-24 re-plan deferred. Each gets a step when the owner schedules it.

| ID | Title | Was |
|---|---|---|
| L-01 | i18n scaffolding and Hindi [A-32] (blocks S6-13 and S10-09) | old S3-14 |
| L-02 | Request-to-book with owner approval | old S4-02 |
| L-03 | Classes and group sessions with attendance and waitlist [C7] | old S4-06 |
| L-04 | Recurring appointments and packages [C6] | old S4-07 |
| L-05 | Resources: rooms and chairs [C5] | old S4-08 |
| L-06 | Chat and embeddable widget parity [A-31] | old S4-09 |
| L-07 | Owner screens for L-02 to L-05 (requests inbox, classes, packages) | old S4-11 |

---

## Step 6 final-check findings (security review of the redesign, PRs #31-#33)

| ID | Item | Severity |
|---|---|---|
| R-01 | Upload quota check (`app/api/upload`, `lib/storage.ts` `usage`) is check-then-put, so parallel uploads can overshoot 50 files / 100 MB; bounded by the 10/min rate limit and 5 MB files. Recheck after put if it matters | Low |
| R-02 | Confirm `lib/ratelimit` uses the distributed (Upstash) store in production so `upload:*` limits hold across serverless instances | Low |
| R-03 | Website hero/about image URLs accept any http(s) host (`httpUrlOrEmpty`); require https and consider an allow-list of the upload host | Low |

---

## Parked (decided 2026-10-27, do not build yet)

| Item | What it is | Why parked | Condition to restart |
|---|---|---|---|
| Pay-links | "Send payment link" per unpaid appointment: editable amount (deposit/balance) and note stored on the `Payment` row, email plus Copy link and WhatsApp share, `/pay/<signed code>` valid 7 days, one active link per appointment, refused when already paid, same fee rules as FULL_ONLINE (India Free ₹10 per paid link by the payer setting, paid plans 0, international never). Needs `settlePaidPayment` to mark an already-confirmed appointment paid. Branch `step-7/pay-links` | Collects the full price, so it needs the payout account | Chunk 12 done |
| S5-03 / chunk 11 `step-5/online-payment-settings` | Country, online payment mode and fee-payer settings, GST receipt | Only matters once FULL_ONLINE can exist | Owner asks |
| S5-04 / chunk 12 `step-5/cashfree-split` | `PayoutAccount`, vendor onboarding with KYC states, split at order creation | Not built; today `businessShareMinor` is recorded but never paid out | Owner asks |

**FULL_ONLINE stays unreachable until chunk 12.** `lib/fees.ts` `FULL_ONLINE_ENABLED = false` makes any stored FULL_ONLINE behave as booking-fee-only, no screen or route sets `onlinePayMode`, and `tests/full-online-parked.test.ts` guards both. Flip the constant only together with chunk 12.

---

## Security audit 2026-10-27 (not fixed in code, for the owner)

| ID | Item | Severity |
|---|---|---|
| SA-01 | Rate limits are per server instance on Vercel until `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` are set; login, signup and booking throttles are advisory without them. Set both on the Vercel project | Medium |
| SA-02 | Content-Security-Policy is report-only and allows `unsafe-inline` and `unsafe-eval`; switch to enforcing with nonces once the console is clean | Medium |
| SA-03 | Blog and help articles render `marked` output without sanitising. Only the super admin writes posts and help is static, so low risk; add a sanitiser if posts ever come from anyone else | Low |
| SA-04 | Signup answers "An account with this email already exists" (account enumeration, rate limited). Accept or switch to a generic message plus email | Low |
| SA-05 | The Neon database credentials and test password in the local `.claude/settings.json` should be rotated and removed (the file is untracked and the repo is private, but it sits on disk); the dev database is also used by the test server | Low |

## Dependency maintenance (planned 2026-11-03, not started)

After `chore/deps-maintenance`, `npm audit` shows 21 moderate advisories (0 high or critical). They all need a major upgrade. 20 are dev-only (the eslint chain) or build-time only (Sentry's bundler plugin), and 1 is the `react-email` CLI's `glob`, which the runtime components do not import.

| ID | Item | Size | Plan |
|---|---|---|---|
| DM-01 | ESLint 9 → 10 (clears the `minimatch` < 11 chain: `eslint`, `@eslint/*`, `typescript-eslint`, `eslint-config-next`) | M | **Blocked upstream:** `eslint-config-next` 16 pulls `eslint-plugin-react` 7.37, `eslint-plugin-import` 2.32 and `eslint-plugin-jsx-a11y` 6.10, which do not list ESLint 10 as a peer and still use `minimatch` 3. Recheck monthly with `npm view eslint-plugin-react@latest peerDependencies`. When all three support 10: (1) branch `chore/eslint-10`; (2) `npm i -D eslint@^10 eslint-config-next@<matching>`; (3) migrate `eslint.config.mjs` for removed options (see the ESLint 10 migration guide) and keep every rule we have today; (4) `npm run lint` must report the same or fewer warnings, 0 errors; (5) `npm audit` must drop the eslint chain. Dev-only, no runtime risk |
| DM-02 | Prisma 5.22 → 6 → 7 (two steps, never straight to 7) | L | **6 first** (`chore/prisma-6`): `npm i prisma@^6 @prisma/client@^6`. Read the v6 upgrade guide: implicit many-to-many tables get a new primary key (a generated migration), `Buffer` → `Uint8Array` for `Bytes`, `NotFoundError` removed (use `P2025`), new reserved model names. Generate the migration with `npm run db:migrate:dev` on the dev database only, then lint/tsc/tests, `npm run build`, the Playwright smoke, and one `SKIP LOCKED` outbox run on dev. **Then 7** (`chore/prisma-7`): new `prisma-client` generator with an output path, `prisma.config.ts` (env is no longer loaded automatically, which affects the `db:*` scripts and dotenv-cli), driver adapters (`@prisma/adapter-neon` or `@prisma/adapter-pg`) in `lib/prisma.ts`, ESM output; re-check `$queryRaw` call sites (outbox claim) and the Vercel build. Each step is its own PR with the owner's click-test |
| DM-03 | `glob` ≤ 14.0.1 (AbortSignal bypass) in `@sentry/bundler-plugins` (build time) and the `react-email` CLI | S | No safe fix: even the latest `@sentry/bundler-plugins` (11.10) still pins `glob` ^13, and forcing 14 through `overrides` is a major bump inside code we don't own. Recheck when bumping Sentry; then `npm audit` should list neither |

---

## Dependencies across steps

- `S1-19` (migrations) blocks every schema change in Steps 2 to 9.
- `S1-04` (validation foundation) blocks the rest of Step 1's route work.
- `S2-01` (timezone) blocks `S6-02` (reminders) and `S2-17`.
- `S2-12` (non-blocking side effects) leads into `S6-01` (outbox).
- `S3-01` (pack engine and `t()`) blocks `S3-02` to `S3-04`, `S6-08` (template defaults) and the token emails in Step 4.
- `S2-07` (cancellation cutoff) and Step 2 chunk 7 (manage page) feed the refund rules in `S5-02`.
- `S4-02` (token booking) blocks `S5-02` token holds.
- `S5-01` (provider interface) blocks `S5-02` to `S5-05` and `S7-01`.
- `S5-06` blocks `S5-05`, `S5-07`, `S5-08`, `S5-09` and `S10-03`.
- `S6-05` (OpenWA adapter) blocks `S9-09` (hosting).
- `S8-01` and `S8-02` (roles) block `S6-12` full behaviour and all of Step 8's screens.
- `S10-01` to `S10-05` must wait for Steps 3 and 5 so the site describes what exists.

## Audit coverage check

Every audit item is accounted for: B-01 → S1-01; B-02 → S1-02; B-03 → S1-03; B-04 → S2-02; B-05 → S2-01; B-06 → S1-08, S2-05; B-07 → S1-04 to S1-07, S2-06; B-08/B-09 → S1-09; B-10 → S1-21, S6-02; B-11 → S1-18; B-12 → S1-19, S9-03; B-13 → S6-04; B-14 → S6-03; B-15 → S2-03; B-16 → S1-15; B-17 → S1-17, S9-04; B-18 → S1-12; B-19 → S1-13; B-20 → S1-14; B-21 → S2-04; B-22 → S2-07; B-23 → S1-09; B-24 → S2-08; B-25 → S2-09; B-26 → S2-10; B-27 → S2-11; B-28 → S2-12, S6-01; B-29/B-30 → S1-11; B-31 → S8-01 to S8-03; B-32 → S8-08; B-33 → S1-23, S6-10; B-34 → `step-2/manage-booking`; B-35 → S6-14; B-36 → S1-22, S9-07; B-37/B-38 → S1-24, S2-18 and each step's QA item; B-39 → S1-07, S5-10; B-40 (notification polling) → S8-07 (push replaces polling; add a `since` parameter during S1-06); A-01 to A-02 → S10-01, S10-02; A-03 → S1-16; A-04 → S3-08; A-05, A-06 → S10-04; A-07 → S5-06, S10-03; A-08 → S3-10; A-09 to A-12, A-15 to A-17 → S3-07; A-13 → S2-15; A-14 → S3-08; A-18, A-19, A-21 → S3-05; A-20 → S3-06, S3-12; A-22 → S10-05; A-23 → S1-10; A-24 to A-26 → S3-09, S3-02; A-27 → S1-10; A-28/A-29 → S2-17; A-30 → S3-10; A-31 → L-06; A-32 → L-01; A-33 → S3-11; D-00 → S1-20; D-01 → S5-01; D-02 → S5-02; D-03 → S5-05; D-04 → S5-02; D-05 → S5-05; D-06/D-07 → S5-04; D-08 → S5-11.
