# 02 — Backend audit

Audited 2026-10-15 on `audit/phase-1`. No app code was changed. Evidence: a scripted survey of every `app/api/**/route.ts` (55 route files), full reads of the booking, availability, auth, cron, upload, WhatsApp, rate-limit, settings and admin-authorisation code, plus `npm audit`, `tsc`, `next lint` and `npm test` runs.

Scope notes:
- **Payments are listed under "Deferred" only** (section 14). Where a payment file is also the cause of a non-payment bug (the import-time crash), it is reported in the main body.
- Routes I read in full: `bookings`, `availability`, `appointments` (both), `signup`, `leads`, `upload`, `cron/reminders`, `settings`, `website`, `broadcasts/send`, `staff` (+`[id]`), `admin/make-admin`, `auth/verify-email`, `onboarding`, `geo/rate`, and the authorisation lines of every `admin/*` route. The rest were classified from a structural scan (auth call, `businessId` filter, rate limit, parse/validation calls) and spot checks. Rows marked "scan" are lower confidence.
- "Validated?" means any server-side checking beyond "field exists". The project has **no validation library** (`zod` is not a dependency; the few `zod=1` hits in the scan were `.parse(` calls on JSON).
- Line numbers are from the current tree.

---

## Summary

**Verdict: the foundations are sound; the booking engine is not yet safe to put real salons on.** Tenant scoping and admin authorisation are generally done correctly, builds/types/lint/tests are clean. The serious problems are in the part customers touch.

### Top 12 issues

| # | Sev | Issue | Where |
|---|---|---|---|
| 1 | **Critical** | **Double-booking is not prevented.** Public booking does check-then-insert with no transaction, lock or unique constraint, and it checks the whole business, not the chosen staff member. Two simultaneous requests for one slot both succeed. | `app/api/bookings/route.ts:67-141` |
| 2 | **Critical** | **A multi-staff business can only take one appointment per time slot.** The conflict check and availability ignore `staffId`, so three stylists = one concurrent booking. The "choose your provider" step is cosmetic. | `bookings/route.ts:62-86`, `availability/route.ts:60-113` |
| 3 | **Critical** | **No timezone model.** `Business` has no `timezone`. Dates are built as `new Date("YYYY-MM-DDTHH:mm:00")` (server-local) in one place and read with `getUTCHours()` in another. It only works when the server runs in UTC; locally (IST) availability and bookings disagree by 5h30. Emails/reminders format dates in server time. | `bookings/route.ts:54`, `availability/route.ts:40-41,69-73,95-96`, `appointments/route.ts:116-117`, `cron/reminders/route.ts:21-24` |
| 4 | **Critical** | **WhatsApp messages are free-text `type: "text"`.** Meta only delivers business-initiated free text inside a 24-hour user-initiated window. Booking confirmations and reminders to a new client will be rejected in production; they need pre-approved templates. Failures are swallowed. | `lib/whatsapp.ts:26-33,56-64` |
| 5 | **High** | **Anyone can hang the server through a tenant setting.** `slotInterval` is saved as `Number(body.slotInterval)` with no bounds; `0`/negative/NaN makes `generateSlots` loop forever and grow an array until the function dies. The public, unauthenticated `/api/availability` triggers it. | `settings/route.ts:36`, `availability/route.ts:6-18` |
| 6 | **High** | **Public booking bypasses plan gating.** The dashboard route checks `isActivePlan` and `maxMonthlyAppointments`; `POST /api/bookings` does neither, so a free tenant exceeds 30 bookings/month and an expired trial keeps taking bookings. Inactive (soft-deleted) services are also bookable. | `bookings/route.ts:37-45` vs `appointments/route.ts:80-93` |
| 7 | **High** | **No password reset.** There is no forgot-password flow anywhere (no route, page or token type). A user who forgets a password is locked out permanently. | whole repo |
| 8 | **High** | **Email case is not normalised.** Signup and login use the email exactly as typed; `Alex@x.com` and `alex@x.com` are two accounts, and login is case-sensitive. The booking path creates duplicate `Client` rows the same way. | `signup/route.ts:38,45`, `lib/auth.ts:44-46`, `bookings/route.ts:131-133` |
| 9 | **High** | **Rate limiting is in-memory, per instance.** On Vercel each lambda has its own map; limits reset on cold start. Login, signup, leads and bookings are "limited", everything else (availability, support, uploads, broadcasts) has none. | `lib/ratelimit.ts` |
| 10 | **High** | **Import-time crashes:** `new Resend()` and `new Razorpay()` at module scope throw when a key is missing, 500ing every route and page that imports them. | `lib/email.tsx:16`, `lib/razorpay.ts:3`, `app/api/broadcasts/send/route.ts:10` |
| 11 | **High** | **Database schema is not under migration control.** `prisma/migrations` has 5 files (to 2026-04-28) and none create `Notification`, `EmailLog`, `Lead`, `Post`, `SupportTicket`, `PlanConfig` or `WithdrawalRequest`; production is built with `prisma db push` on every deploy. | `package.json` (`build`), `prisma/migrations/` |
| 12 | **High** | **Known-vulnerable dependencies:** `npm audit --omit=dev` reports 11 (2 critical, 6 high): `next@14.2.5` (cache poisoning, plus other advisories on that range), `next-auth` (email normalizer homoglyph bypass), axios, undici, form-data, postcss, nanoid. | `package.json` |

Positives worth keeping: every dashboard route filters by `session.user.businessId` (including `findFirst({ id, businessId })` ownership checks before update/delete); admin routes are guarded; `make-admin` bootstrap closes once an admin exists; verification tokens expire; passwords use bcrypt cost 12; Razorpay billing webhook verifies an HMAC signature; the prepaid path fails closed in production; `tsc --noEmit` and `next lint` are clean; 24 unit tests pass.

---

## 1. API route table

Legend. **Auth:** `S` = NextAuth session with `businessId`, `A` = admin (role `admin` or `SUPER_ADMIN_EMAIL`), `-` = public, `Sig` = webhook signature, `Cron` = `CRON_SECRET` bearer (only enforced if the env var is set). **Scoped:** filtered to the caller's business (`n/a` for admin/global). **Valid:** `none` = presence checks only or none, `manual` = hand-written checks, `enum` = allow-list. **RL:** rate limited (in-memory).

| Route | Methods | Auth | Scoped | Valid | RL | Issues |
|---|---|---|---|---|---|---|
| `admin/blog` | GET, POST | A (`isAdminSession`) | n/a | none | no | Markdown content stored unsanitised; rendered server-side (check renderer). |
| `admin/blog/[id]` | PATCH, DELETE | A | n/a | none | no | |
| `admin/blog/upload` | POST | A | n/a | manual | no | Same blob storage constraints as `/api/upload`. |
| `admin/make-admin` | POST | A, or `ADMIN_SETUP_SECRET` while no admin exists | n/a | manual | **no** | Secret compared with `===` (not constant time); no rate limit on the bootstrap path. Low. Safe once any admin exists. |
| `admin/notifications` | POST | A (inline) | n/a | none | no | Broadcast push/notification to all tenants; no length/size cap. |
| `admin/plans` | GET | A (inline copy) | n/a | none | no | `isAdmin` re-implemented in 9 files (`lib/adminAuth.ts` exists). |
| `admin/plans/[planId]` | PATCH | A | n/a | manual | no | Flag values from body written to `PlanConfig` without range checks. |
| `admin/settings` | GET, PATCH | A | n/a | none | no | Admin `/settings` page redirects to `/admin` (see 01). |
| `admin/support` | GET | A | n/a | none | no | |
| `admin/support/[id]` | GET, POST, PATCH | A | n/a | none | no | Uses a transaction for reply + status. |
| `admin/tenants` | GET | A | n/a | none | no | Unpaginated; returns owner `role` and email. |
| `admin/tenants/[id]` | PATCH, DELETE | A | n/a | none | no | `plan`/`planStatus` accepted as free strings; DELETE cascades the whole tenant with no confirmation or soft delete. |
| `admin/withdrawals` | GET | A | n/a | none | no | (payments, deferred) |
| `admin/withdrawals/[id]` | PATCH | A | n/a | none | no | (payments, deferred) |
| `appointments` | GET, POST | S | yes | manual | no | Plan limit enforced here (good). `new Date(date)` + `setHours` is server-local (`:116-117`). `staffId` looked up without a `businessId` filter (`:131`) and saved to the appointment: cross-tenant reference. No conflict check at all (owner can double-book; may be intentional). Client created with empty phone `""`. No email format check. |
| `appointments/[id]` | PATCH, DELETE | S | yes (`findFirst` ownership) | enum (status/payment) | no | Reschedule accepts any date with **no conflict or past-date check**. Good transition detection for emails. |
| `appointments/[id]/payment` | PATCH | S | yes | manual | no | Marks paid manually (payments, deferred). |
| `auth/[...nextauth]` | GET, POST | - | n/a | n/a | login only | See section 5. |
| `auth/verify-email` | GET | - (token) | n/a | token | no | Token single use; no resend endpoint exists. Expired tokens are deleted so the user cannot even see "expired" twice. |
| `availability` | GET | - | slug | manual | **no** | Unauthenticated, does 2 queries + a per-minute loop per call; `slotInterval` hang (#5); `JSON.parse(availabilityJson)` unguarded (`:36-41`) → 500 on malformed JSON; `duration` unvalidated; ignores staff, holidays, time-off, "past times today". |
| `billing/portal` | POST | S | yes | none | no | (payments, deferred) |
| `billing/status` | GET | S | yes | n/a | no | (deferred) |
| `billing/sync` | POST | S | yes | none | no | (deferred) |
| `billing/upgrade` | POST | S | yes | manual | no | (deferred) |
| `billing/webhook` | POST | Sig (HMAC) | by notes | json | no | (deferred) signature compared with `===`. |
| `bookings/confirm` | POST | - | by payload | manual | no | (payments, deferred) |
| `bookings` | POST | - (public) | by slug | manual | **10/min/IP** | See issues #1, #2, #3, #6. Also: `staffId` unscoped (`:150,266`); no email/phone/length validation; `time` and `date` format unchecked beyond `Date` parse; `notes` unbounded; confirmation email + WhatsApp awaited inline (slow, `:160-192`); postpaid, demo and prepaid branches duplicate ~50 lines; the demo branch adds unpaid price to `totalSpent` (`:259`); duplicate/invalid `serviceIds` silently dropped. |
| `broadcasts/send` | POST | S (paid plan only) | yes | manual | **no** | Business name / subject interpolated into email HTML without escaping (`:18,23`) → HTML injection in mail sent from Calvy's domain. No opt-in/unsubscribe, no per-month cap enforced (flag exists in plans), sends to *all* clients synchronously (function timeout on large lists), WhatsApp free-text issue as above. |
| `clients` | POST | S | yes | manual | no | Email not lowercased. |
| `crm/leads` | GET | A | n/a | none | no | |
| `crm/leads/[id]` | PATCH, DELETE | A | n/a | none | no | |
| `cron/reminders` | GET | Cron (optional) | all tenants | n/a | no | **Open to the world if `CRON_SECRET` is unset** (`:17`). Daily only. See section 7. |
| `expenses` | GET, POST | S | yes | none | no | |
| `expenses/[id]` | PATCH, DELETE | S | yes | none | no | |
| `features` | GET | S | yes | n/a | no | |
| `geo/rate` | GET | - | n/a | regex | no | Cached 1h; fine. |
| `leads` | POST | - | n/a | manual (email regex) | **5/min/IP** | Good: lowercases email, slugs `source`. Sends an acknowledgement email per submit (mail-bomb via a victim's address; mitigated only by the per-instance limiter). |
| `notifications` | GET, PATCH | S | yes | none | no | Polled every 30s by every open dashboard; no pagination limit seen (scan). |
| `onboarding` | POST | S | self | manual | no | OK. Slug generation not reserved-word aware (see below). |
| `push/subscribe` | POST, DELETE | S | yes | manual | no | |
| `razorpay/connect` | GET, POST | S | yes | none | no | (payments, deferred) |
| `razorpay/webhook` | POST | Sig | by notes | json | no | (payments, deferred) |
| `services` | POST | S | yes | manual | no | Plan limit enforced. |
| `services/[id]` | PATCH, DELETE | S | yes | manual | no | Soft delete when appointments exist (good). |
| `settings` | GET, PATCH | S | yes | allow-list only | no | Allow-list prevents mass assignment (good) but values are unchecked: `slotInterval` (#5), `availabilityJson` raw string, `currency`, `primaryColor` (CSS injection into inline styles on the tenant site), `businessType`, `email`. Slug cannot be changed (good). |
| `settings/payout` | GET, PATCH | S | yes | none | no | (payments, deferred) |
| `signup` | POST | - | n/a | manual | **5/min/IP** | Email not lowercased/trimmed on store (`:38,45`); creates user + business then sends verification; returns 409 "already exists" (account enumeration). Password only length-checked (min 8). User and business created in separate non-transactional calls: a failure between them leaves a user with no business. |
| `staff` | GET, POST | S | yes | manual | no | Plan limit enforced. Working hours stored as JSON string, never validated. |
| `staff/[id]` | PATCH, DELETE | S | yes | manual | no | Hard delete (appointments keep `staffId` null by relation default). |
| `support` | GET, POST | S | yes | none | no | |
| `support/[id]` | GET, POST | S | yes | none | no | |
| `upload` | POST | S | prefix by `businessId` | manual (type, 5MB) | **no** | Vercel Blob only, public access, filename extension taken from the client's filename, MIME check is the browser-supplied `file.type` (SVG allowed), no per-tenant quota, old blobs never deleted. See section 9. |
| `wallet` | GET | S | yes | n/a | no | (payments, deferred) |
| `wallet/withdraw` | POST | S | yes | manual | no | (payments, deferred) |
| `website` | PATCH | S | yes | JSON.parse only | no | Whole `websiteJson` is a client-controlled blob; rendering relies on React escaping; image URLs unchecked. |

Totals: 55 route files; 40 have no `try/catch` (invalid JSON bodies and DB errors surface as bare 500s with the default Next error output; `req.json()` is unguarded in most routes except `leads`).

---

## 2. Booking logic (the critical path)

Files: `lib/booking.ts` (pure helpers, unit tested), `app/api/availability/route.ts`, `app/api/bookings/route.ts`, `app/api/appointments/route.ts`.

| Check | Finding | Sev |
|---|---|---|
| **Per-staff availability** | `staffId` is stored but never used in availability or conflict checks. Staff `workingHours` (set in dashboard and seed) are never read by the booking code; only the business-level `availabilityJson`/defaults count. A "Color Specialist" who only works Tuesdays is still bookable Monday. | Critical (`availability/route.ts:60-113`, `bookings/route.ts:62-86`) |
| **Service ↔ staff** | `StaffService` links exist in the schema but the booking APIs do not verify the chosen staff performs the chosen service. | High |
| **Double booking** | `findMany` (`:67`) then `create` (`:141`/`:253`) with no transaction, no `SERIALIZABLE`, no advisory lock, no DB constraint. Race window = DB round trip + email work starts after, so the window is small but real, and the per-instance limiter does not stop concurrent calls. Needs a transaction with a slot lock (or a unique/exclusion constraint on `(staffId, start)` or a `Slot` table). | Critical |
| **Capacity (group)** | `capacity > 1` counts bookings starting at exactly the same time and ignores overlapping group sessions of different lengths. Capacity is read from the *first* service only (`:63`). | Medium |
| **Overlap math** | `hasBookingConflict` is correct for capacity 1 and is unit tested. It does not include buffer/travel time between appointments (no field exists). | Medium (missing feature) |
| **Past bookings** | POST rejects past start times (`isPastBooking`); availability does not hide earlier times *today*, so the UI offers slots POST then rejects (`availability/route.ts` has no `now` filter). Reschedule has no past check at all (`appointments/[id]/route.ts:43-49`). | Medium |
| **Time zones** | See issue #3. The consistent-by-accident design (store local wall-clock time as if UTC) breaks as soon as a server runs in another zone, or a business operates in a zone different from where emails are rendered (`toLocaleDateString("en-US")` with no `timeZone`, `bookings/route.ts:148,264`, `cron/reminders/route.ts:41-42`). DST is not an issue for India but is for any other region. Fix: add `Business.timezone` (IANA), store real UTC instants, format with that zone. | Critical |
| **Working hours / holidays / time off** | Availability supports one `start-end` per weekday only. No lunch break, no holidays, no staff leave, no blocked dates, no minimum notice, no maximum advance window. Weekday defaults to Mon-Fri if config is missing. | High (missing; see 03) |
| **Hours shape mismatch** | Business uses `{enabled,start,end}` keyed by `0-6`; staff use `{isWorking,start,end}` keyed by weekday name. Two formats for the same idea. | Medium |
| **Slot step / duration** | Slots start every `slotInterval`; a 45-minute service with 30-minute step leaves 15-minute gaps. `serviceDuration` for multi-service is passed by the client (`duration` query) so a modified client can request slots for a shorter duration than the booking later computes (server recomputes total at POST, so only UX). | Low |
| **Transactions** | None in booking flows. `Client.totalAppointments/lastVisit/totalSpent` are updated in separate writes; a crash after `appointment.create` leaves counters stale. The only `$transaction` uses are in admin support, appointment payment, and support reply. | High |
| **Multi-service storage** | Extra services are encoded as `__services__:A\|B` in `notes` (names, not ids). Renaming/deleting a service breaks history, and a customer note starting with the same prefix would be mis-parsed. Prices of extras are not stored separately. | Medium (data model) |
| **Money as `Float`** | `price`, `amount`, balances are `Float` (`schema.prisma` lines 110, 150, 187, 206, 245). Fine for display; wrong for ledgers (wallet). | Medium |
| **Status as strings** | `status`, `paymentStatus`, `paymentMode` are free `String`; only the PATCH route validates them. | Low |
| **Indexes** | `Appointment` has **no index** other than the primary key and FK lookups, yet every availability/dashboard/cron query filters by `(businessId, date)` / `status` / `reminderSent`. `Client`, `Notification`, `Service`, `Staff` have none beyond `@@unique([businessId,email])`. | High (see 3) |
| **Client dedupe** | `@@unique([businessId, email])` is case-sensitive (`Alex@x.com` ≠ `alex@x.com`), and clients without an email cannot exist (email is required at booking). Walk-ins and phone-only clients, common in Indian salons, are not representable. | Medium |

Positives: server re-validates price/duration from the DB (client cannot set price); Razorpay amount computed server-side; ownership checks on dashboard mutations.

---

## 3. Prisma schema review

| Item | Finding | Sev |
|---|---|---|
| Indexes | Missing: `Appointment(businessId, date)`, `Appointment(businessId, status)`, `Appointment(date, reminderSent)` (cron), `Appointment(staffId, date)`, `Client(businessId)`, `Notification(businessId, createdAt)` / read flag, `VerificationToken(email)` and `expiresAt`, `Lead(email)`. Present only on `Post`, `Lead(status,createdAt)`, `EmailLog`. | High |
| Uniques | `Business.slug`, `ownerId`, `Client(businessId,email)`, `PushSubscription.endpoint`, `razorpayCustomerId` good. Nothing prevents two appointments at the same staff+time. | High |
| FKs | `Appointment.service` has no `onDelete` (restrict): consistent with the soft-delete behaviour; `staff` optional relation sets null. OK. | OK |
| Enums | None; all state fields are strings. | Low |
| JSON-in-string | `availabilityJson`, `websiteJson`, staff `workingHours` and `Post.faq` are `String` holding JSON; no schema, parse errors become 500s (`availability/route.ts:36`). Use `Json` columns plus validation. | Medium |
| Timezone / locale | No `timezone` on `Business` (see #3); `currency` defaults to `"USD"` (`schema.prisma`, Business) even though the target market is India. | High |
| Single owner | `Business.ownerId @unique`: one owner per business, one business per user, no staff logins/roles. | Medium (feature) |
| Soft delete | Services only. Clients and staff are hard-deleted. | Low |
| Provider | PostgreSQL, no `directUrl` (fine for Neon pooled usage with Prisma 5 unless using PgBouncer for `db push`; see 8). | Low |
| Migrations | See #11 and section 8. | High |

---

## 4. Tenant isolation

Mostly good, with these gaps:

| Sev | Finding | File:line |
|---|---|---|
| Medium | `staffId` accepted from the request and used in `staff.findUnique({ id })` with no `businessId` check; a hostile caller can attach another tenant's staff to an appointment and learn their name (shown in the confirmation email). | `bookings/route.ts:150,266`, `appointments/route.ts:131` |
| Medium | `Appointment.staffId` itself is not validated to belong to the business on create or on reschedule. | same |
| Low | The tenant slug is user-derived from the business name with no reserved-word list; `admin`, `www`, `api`, `app`, `dashboard`, `login` are all valid slugs. Subdomain routing rewrites `{slug}.calvy.io/*` to `/{slug}/*`, and `/b/[slug]` and `/[slug]` share the top-level namespace with fixed routes, so a business named "Dashboard" or "Login" collides with real routes. | `lib/createBusiness.ts:4-24`, `middleware.ts:20-30` |
| Low | JWT carries `role`, `businessId` for its lifetime (30-day default `maxAge`, `lib/auth.ts` jwt callback). Demoting an admin or deleting a tenant does not take effect until the token expires. | `lib/auth.ts:96-120` |
| Info | Admin `isAdmin` is copy-pasted in ~9 files with `session?.user?.email === process.env.SUPER_ADMIN_EMAIL` without the `!!process.env.SUPER_ADMIN_EMAIL` guard that `lib/adminAuth.ts` has; if the env var is unset, a session whose `email` is `undefined` would match. Credentials users always have an email, so practical risk is low, but unify on `isAdminSession()`. | `app/api/admin/**`, `app/admin/layout.tsx:11` |

---

## 5. Authentication

| Area | Finding | Sev |
|---|---|---|
| Verification | Required for credentials login (`lib/auth.ts:56`), 24h token, single use, deleted on use. **No resend**; expired-token message says "sign up again", which then fails with "already exists". Unverified users who never receive the mail (Resend not configured, or the default `onboarding@resend.dev` sender, which delivers only to the Resend account owner, `lib/email.tsx:17`) can never log in. | High |
| Password reset | **Absent.** | High |
| Email case | Not normalised (#8). `credentials.email.toLowerCase()` is used only for the rate-limit key, not the lookup. | High |
| Brute force | 10 attempts/min per email, in memory (resets per instance); no IP limit; no lockout/CAPTCHA. | Medium |
| Account enumeration | Signup returns 409 "An account with this email already exists." | Low |
| Password policy | min 8 chars; no max (bcrypt truncates at 72 bytes), no breach check. bcryptjs cost 12 is slow on small serverless CPUs (~250ms) but acceptable. | Low |
| Sessions | JWT, default 30-day lifetime, role/business cached in token. | Medium |
| OAuth | Google/Facebook only registered if env set; account linking by email without checking `email_verified` from the provider, relying on the provider; Facebook emails are not always verified. `signIn` auto-sets `emailVerified` for any existing unverified credentials account (`lib/auth.ts:85-87`), which lets whoever controls an OAuth identity with that email take over a pre-registered unverified account. | Medium |
| next-auth advisory | `next-auth` ≤ 4.24.14: email normaliser homoglyph bypass (advisory, `npm audit`). Update. | High |
| Bootstrap admin | OK (closed after first admin). | OK |
| CSRF / cookies | Default NextAuth behaviour; `NEXTAUTH_URL`/`NEXTAUTH_SECRET` are read implicitly (`NEXTAUTH_SECRET` used in `middleware.ts:44` and by NextAuth). No startup check that the secret exists. | Medium |
| Account deletion / data export | Not implemented (privacy law requirement, see 03). | Medium |

---

## 6. Email

`lib/email.tsx` (Resend + `@react-email/render`), templates in `emails/templates`, results written to `EmailLog` (`type`, `status sent|failed|skipped`, provider id, error).

| Finding | Sev |
|---|---|
| `const resend = new Resend(process.env.RESEND_API_KEY)` at module scope (`:16`): crash when unset. The helper just below it already treats a missing/placeholder key as "disabled", so the constructor should be lazy (`getResend()`). | High |
| Default `FROM = "Calvy <onboarding@resend.dev>"` (`:17`) is Resend's sandbox sender: it only delivers to the account owner's own address. A production deploy without `EMAIL_FROM` and a verified domain silently sends nothing to customers (the `EmailLog` will show `sent` or `failed`; see below). | High |
| Sender identity is Calvy for all tenants: confirmations to a salon's client come from Calvy, not the salon; `replyTo` the business is not guaranteed. | Medium |
| Dates formatted with `toLocaleDateString("en-US")` in the server's zone; English only. | Medium |
| Booking confirmation is awaited inside the request (`bookings/route.ts:160-177`), so a slow provider delays the customer's "confirmed" screen. Use `after()`/a queue. | Medium |
| Broadcast HTML injection (see route table); no unsubscribe link, no consent record, no sending-rate or per-plan cap enforced in the route. | High |
| `Lead` acknowledgements email arbitrary addresses on request (spam amplifier mitigated only by per-instance limiter). | Medium |
| Email delivery events (bounce/complaint webhooks from Resend) are not handled. | Low |

---

## 7. Cron / reminders

`vercel.json` runs `/api/cron/reminders` once a day at 06:00 UTC (11:30 IST).

| Finding | Sev |
|---|---|
| Authentication is skipped when `CRON_SECRET` is unset (`route.ts:17`): anyone can call it. It is idempotent (`reminderSent`) but can trigger early/batch email sends and burn quota. Fail closed instead. | High |
| Window is "tomorrow, UTC midnight to midnight" (`:21-24`); an appointment at 09:00 tomorrow gets a reminder ~21h before; one at 23:00 tomorrow ~41h before. The pricing page promises "Email reminders (24h before)". For Indian businesses the UTC day boundary is 05:30 IST, so "tomorrow" is shifted. | High |
| `reminderSent = true` is written after the sends but failures are swallowed with `.catch`, so a failed email/WhatsApp still marks the appointment reminded and never retries. Conversely a crash between send and update re-sends next run (no claim/lock). | High |
| `Promise.allSettled` over all appointments at once: unbounded concurrency, no batching, a 60-second `maxDuration`; fails to scale beyond a few hundred appointments. | Medium |
| Daily cadence is the Hobby-plan limit (comment in file). Same-day bookings made after 06:00 never get a reminder, and "2h before" reminders are impossible. | Medium |
| Unscoped read of all tenants' appointments with `include: client, service, business` (large payload). | Low |
| Reminders ignore plan flags (email reminders only for paid plans per pricing page; no check). | Low |

---

## 8. WhatsApp

`lib/whatsapp.ts` uses the Meta Cloud API v19 with the platform's single `WHATSAPP_PHONE_NUMBER_ID` / token.

| Finding | Sev |
|---|---|
| **Free-text messages only** (`type: "text"`, `:30`). WhatsApp Business policy: outside an open 24h customer-service window only approved **template** messages can be sent. Confirmations/reminders to clients who have never messaged the number will fail with a 131047-style error. Needs templates (`type: "template"`) approved per language, with variables. | Critical |
| One sender number for the whole platform and every message is signed "— Calvy"; tenants cannot use their own number/brand. | High (product) |
| `normalizePhone` strips non-digits only (`:14-16`): a 10-digit Indian number (`98xxxxxx12`) is sent without `91`, so it goes to the wrong or an invalid destination. No default country code per business currency/region. | High |
| Errors are logged and swallowed; no delivery status webhooks; no `EmailLog` equivalent, so owners cannot see whether a WhatsApp was delivered. | Medium |
| Phone numbers (PII) are written to server logs on success (`console.log("[WhatsApp] Sent confirmation to", to, result)`). | Medium |
| Opt-in/consent is not captured; broadcast "WhatsApp" sends marketing free text to every client. | High (policy) |
| Plan flag naming: `whatsappReminders: config.smsReminders` (`lib/plans.ts:183`) — the DB column is called SMS but drives WhatsApp; there is no SMS code. The marketing page promises "SMS" reminders. | Medium |

---

## 9. Uploads

`app/api/upload/route.ts` → `@vercel/blob` `put(..., { access: "public" })`.

| Finding | Sev |
|---|---|
| **Works only with Vercel Blob.** Without `BLOB_READ_WRITE_TOKEN` it returns 503 (`:15-20`). There is no local-disk, S3 or R2 fallback, so it cannot run on another host or in local development without a Vercel token, and `next.config.mjs` only whitelists `images.unsplash.com` and `ui-avatars.com` for `next/image`, so blob URLs need `<img>` or a config change. | High (portability) |
| Type check trusts the browser's `file.type` (`:30`); SVG (`image/svg+xml`) is accepted. Extension taken from the user's filename (`:35`, e.g. `x.html`); blob URL is on Vercel's domain, so same-origin XSS risk is limited, but content-type spoofing is possible. Validate magic bytes, allow-list `jpg/png/webp`, and set the extension from the verified type. | Medium |
| No per-tenant quota/rate limit; unlimited uploads at 5MB each; replaced images are never deleted. | Medium |
| Errors return `err.message` to the client (`:44`). | Low |
| Admin blog image upload shares the same constraints. | Low |

---

## 10. Error handling & logging

- 40 of 55 routes have no `try/catch`; `await req.json()` throws on malformed bodies (500 instead of 400) in nearly every route except `leads`.
- 35 `console.*` calls in `app/` and `lib/`; no structured logger, no error tracker (no Sentry/Logtail/pino in `package.json`), no request ids. Production failures in email/WhatsApp/push are visible only in Vercel logs, and Resend failures only in `EmailLog` (which has no UI beyond admin tooling).
- Fire-and-forget promises are common (`sendPushToBusiness(...).catch(() => {})`); on serverless the function may be frozen before they finish. Use `after()` or await.
- Standard error shape is `{ error: string }` with sensible 4xx codes in most hand-written checks, but no error codes for the client except `PLAN_EXPIRED` / `LIMIT_REACHED`.
- No health endpoint, no startup env validation (a missing `DATABASE_URL`/`NEXTAUTH_SECRET` is discovered at first request).

---

## 11. Environment variables

Read directly via `process.env` (no central schema): `DATABASE_URL`, `NEXTAUTH_SECRET` (and implicitly `NEXTAUTH_URL`), `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_ROOT_DOMAIN`, `SUPER_ADMIN_EMAIL`, `ADMIN_SETUP_SECRET`, `CRON_SECRET`, `RESEND_API_KEY`, `EMAIL_FROM`, `GOOGLE_CLIENT_ID/SECRET`, `FACEBOOK_CLIENT_ID/SECRET`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN`, `BLOB_READ_WRITE_TOKEN`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `PORT`, and (deferred) `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `RAZORPAY_BILLING_WEBHOOK_SECRET`, `RAZORPAY_PLAN_STARTER/PROFESSIONAL/BUSINESS` (+ annual variants).

| Finding | Sev |
|---|---|
| No `.env.example` (README references `.env.local.example`, which does not exist). | Medium |
| No validation at boot; several have placeholder sentinels (`"re_REPLACE_ME"`, `"REPLACE_ME"`) checked by hand in some modules only. | Medium |
| Fail-open defaults: `CRON_SECRET` unset ⇒ open cron; `SUPER_ADMIN_EMAIL` unset ⇒ comparisons against `undefined`; `NEXT_PUBLIC_APP_URL` falls back to `localhost` / `https://calvy.io`. | High |
| `.claude/settings.json` holds a hard-coded Neon `DATABASE_URL` with credentials and a test password (noted in CLAUDE.md): rotate and remove. | Critical (secret hygiene) |
| `NEXT_PUBLIC_ROOT_DOMAIN` is used in middleware; wrong value silently disables tenant routing. | Low |

---

## 12. Build and deploy

`"build": "prisma generate && prisma db push && next build"` (`package.json`).

| Finding | Sev |
|---|---|
| Every deploy (including preview deploys, if they share `DATABASE_URL`) runs `db push` against whatever database the env points to. `db push` is unmigrated, unreviewed, and may reject or (with a destructive diff) refuse/drop data. It is also why migrations are stale (#11). Replace with `prisma migrate deploy` and a baseline migration generated from the current schema (`prisma migrate diff`). | High |
| `postinstall: prisma generate` is fine. | OK |
| `tsc --noEmit` is clean; `next lint` clean; but `next build` was not run in this audit (it would push the schema; see CLAUDE.md note). | Info |
| `vercel.json` only declares the cron; no function region (database region vs function region latency unknown), no `maxDuration` except the cron route. | Low |
| `next.config.mjs` has no security headers (CSP, HSTS, X-Frame-Options), no `poweredByHeader: false`. | Medium |

---

## 13. Dependencies, tests, quality gates

- `npm audit --omit=dev`: **11 vulnerabilities: 2 critical, 6 high, 3 moderate.** Critical: `next` (pinned `14.2.5`; advisory range 0.9.9–16.3.0-preview; upgrade within 14.2.x at minimum, ideally the latest 14.x/15 security release), `next-auth` (≤4.24.14). High: transitive `axios`, `form-data`, `nanoid`, `postcss`, `source-map-js`, `undici`; moderate: `uuid` via `svix` via `resend`. Many are fixed by `npm audit fix`; `next` needs a deliberate bump.
- Tests: 4 files, 24 tests, all pass (`booking`, `currency`, `plans`, `ratelimit`). They cover pure helpers only. **No route tests, no DB tests, no auth tests, no end-to-end tests.** The double-booking, timezone, plan-gating and tenant-isolation paths, which are the riskiest, are untested. The rate-limit test passes while the limiter is, on serverless, not effective.
- `tsc --noEmit`: passes. `next lint`: no warnings.
- Playwright was added during this audit as a dev dependency for screenshots only (`scripts/screenshot-all.ts`, `scripts/audit-checks.ts`).

---

## 14. Deferred: payments (not audited in depth)

Listed only, per the brief. Everything below needs its own review before real money moves.

- `lib/razorpay.ts`, `app/api/razorpay/{connect,webhook}`, `app/api/billing/*`, `app/api/bookings/confirm`, `app/booking/success`, `app/api/wallet/*`, `app/api/admin/withdrawals/*`, `app/api/settings/payout`, `appointments/[id]/payment`.
- Seen in passing (verify later): webhook signatures compared with `===` rather than `crypto.timingSafeEqual` (`billing/webhook/route.ts:7-9`); the prepaid flow holds no slot while the customer pays, so a paid booking can arrive for an already-taken slot; Razorpay `notes` carry the client's name, email, phone and notes (PII at a third party, plus Razorpay's per-field length limits); `paymentStatus` can be set to `paid` manually; wallet balances and withdrawals use `Float`; the `stripePayments` plan flag is a legacy name for the Razorpay-gated feature; marketing copy says Stripe in places (see 01).
- Import-time `new Razorpay()` crash is reported above (#10) because it breaks non-payment pages.

---

## 15. Severity index

**Critical:** double booking (`bookings/route.ts:67-141`); no per-staff logic (`bookings/route.ts:62-86`, `availability/route.ts:60-113`); no timezone model (`bookings/route.ts:54`, `availability/route.ts:40-41`, `cron/reminders/route.ts:21-24`); WhatsApp free-text (`lib/whatsapp.ts:26-33`); committed credentials in `.claude/settings.json`.

**High:** `slotInterval` hang (`settings/route.ts:36`, `availability/route.ts:6-18`); public booking skips plan gating (`bookings/route.ts:37-45`); no password reset; email case (`signup/route.ts:38`, `lib/auth.ts:44`); in-memory rate limiting (`lib/ratelimit.ts`); import-time crashes (`lib/email.tsx:16`, `lib/razorpay.ts:3`, `broadcasts/send/route.ts:10`); migrations out of sync + `db push` build (`package.json`); vulnerable dependencies (`next`, `next-auth`, …); cron open when `CRON_SECRET` unset (`cron/reminders/route.ts:17`); cron reminder window and failure handling; no resend verification; sandbox `FROM` address (`lib/email.tsx:17`); missing DB indexes; staff `workingHours`/service links ignored; broadcast HTML injection and consent (`broadcasts/send/route.ts:18,23`); WhatsApp phone normalisation and platform-wide sender; Vercel-Blob-only uploads.

**Medium:** cross-tenant `staffId` (`bookings/route.ts:150,266`, `appointments/route.ts:131`); reschedule has no conflict/past check (`appointments/[id]/route.ts:43-49`); unvalidated `availabilityJson`/`primaryColor`/`currency`; multi-service stored in `notes`; JSON-in-string columns; `Float` money; client dedupe case; non-transactional multi-write flows; JWT staleness; OAuth auto-verification of unverified accounts (`lib/auth.ts:85-87`); no security headers; no logger/error tracker; 40 routes without try/catch; env validation absent; reserved slugs (`createBusiness.ts`); upload MIME/extension trust; PII in logs; email dates in server zone.

**Low:** `make-admin` secret compare and no rate limit; account enumeration; string-typed statuses; `isAdmin` duplication; `geo/rate`, `leads` ack mail-bomb; hard-deleted staff/clients.
