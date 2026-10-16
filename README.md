# Calvy — Smart Appointment Booking SaaS

A production-ready multi-tenant appointment booking platform. Every business that signs up instantly gets a subdomain, a public website, a chatbot booking widget, a dedicated `/book-now` page, and a full management dashboard — in under 60 seconds.

**Live:** [calvy.io](https://calvy.io) · **Stack:** Next.js 14 · TypeScript · PostgreSQL · Prisma · Stripe · Resend · Vercel

---

## Getting Started

```bash
npm install
cp .env.local.example .env.local   # fill in your credentials
npx prisma db push                 # sync schema to DB
npm run dev                        # http://localhost:3000
```

---

## Project Structure

```
calvy/
├── app/
│   ├── page.tsx                        # Marketing landing page (dynamic pricing from DB)
│   ├── login/                          # Login page
│   ├── signup/                         # Registration (email verify + currency)
│   ├── verify-email/                   # Email verification handler
│   ├── [slug]/                         # Tenant public website (served via subdomain)
│   │   └── book-now/                   # Dedicated full-page booking (slug.calvy.io/book-now)
│   ├── b/[slug]/                       # Legacy booking page (still works)
│   ├── booking/success/                # Post-payment confirmation
│   ├── dashboard/
│   │   ├── page.tsx                    # Dashboard home (KPIs, charts, today's appts)
│   │   ├── appointments/               # Appointment list & management (CSV export gated)
│   │   ├── clients/                    # Client directory (grid + list views)
│   │   │   └── [id]/                   # Client detail + full appointment ledger
│   │   ├── calendar/                   # Monthly calendar view
│   │   ├── payments/                   # Payment history (CSV export gated)
│   │   ├── expenses/                   # Expense tracking & profit (plan-gated)
│   │   ├── analytics/                  # Revenue charts & KPIs (plan-gated)
│   │   ├── services/                   # Service catalog (group booking capacity gated)
│   │   ├── staff/                      # Staff management & working hours
│   │   ├── wallet/                     # Wallet balance & withdrawal requests (plan-gated)
│   │   ├── website/                    # Public website builder (image upload + SEO gated)
│   │   ├── booking-page/               # Booking page preview & share link
│   │   ├── broadcasts/                 # Broadcast message management (plan-gated)
│   │   ├── support/                    # Support tickets (plan-gated: prioritySupport)
│   │   ├── settings/                   # Business profile, availability, payout config
│   │   └── billing/                    # Plan & subscription management (dynamic, monthly/annual)
│   ├── admin/                          # Super-admin panel
│   │   ├── plans/                      # Edit all plan feature flags & limits live
│   │   └── support/                    # Admin support ticket inbox
│   └── api/                            # API routes (see docs)
├── components/
│   ├── ui/                             # Button, Card, Input, Modal, Avatar…
│   ├── chatbot/                        # ChatWidget — embedded booking bot for tenant sites
│   ├── dashboard/
│   │   ├── DashboardLayout.tsx
│   │   ├── Sidebar.tsx
│   │   ├── Header.tsx                  # Notifications bell + polling
│   │   └── UpgradeGate.tsx             # Reusable plan-gated upgrade prompt
│   ├── landing/                        # Hero, Features, Pricing sections (Pricing is dynamic)
│   └── Providers.tsx                   # CurrencyProvider, SessionProvider
├── lib/
│   ├── auth.ts                         # NextAuth config
│   ├── currency.ts                     # CURRENCIES list + formatCurrencyAmount
│   ├── email.ts                        # Resend templates (confirm, verify, remind)
│   ├── getFeatures.ts                  # getBusinessFeatures(businessId) — DB-driven plan limits
│   ├── plans.ts                        # Plan limits, feature flags, Stripe price ID lookup
│   ├── prisma.ts                       # Prisma client singleton
│   ├── push.ts                         # Web Push (VAPID) + DB notification storage
│   ├── stripe.ts                       # Stripe client
│   ├── utils.ts                        # cn() + helpers
│   ├── website.ts                      # WebsiteConfig types & defaults
│   └── whatsapp.ts                     # Meta WhatsApp Business Cloud API
├── middleware.ts                       # Subdomain routing (abc.calvy.io → /abc)
│                                       # + auth protection for /dashboard and /admin
├── scripts/
│   └── update-slugs.ts                 # One-time migration: strip random slug suffixes
└── prisma/
    └── schema.prisma
```

---

## Subdomain Routing

Every tenant gets a clean subdomain automatically on signup:

| URL | What it serves |
|---|---|
| `abc.calvy.io` | Tenant's public website |
| `abc.calvy.io/book-now` | Full-page booking experience |
| `calvy.io/dashboard` | Tenant dashboard (auth-protected) |
| `calvy.io/admin` | Super-admin panel (auth-protected) |

The `middleware.ts` file rewrites subdomain requests internally to `/{slug}{path}` without redirecting. API routes (`/api/*`) are excluded from rewriting.

**Required env var:** `NEXT_PUBLIC_ROOT_DOMAIN=calvy.io`

---

## Pages

| Route | Description |
|---|---|
| `/` | Marketing landing page |
| `/signup` | Register (picks currency, sends verification email) |
| `/login` | Login |
| `/verify-email` | Email verification link handler |
| `{slug}.calvy.io` | Tenant public website |
| `{slug}.calvy.io/book-now` | Full booking page (services → staff → date → time → confirm) |
| `/b/[slug]` | Legacy public booking page (still active) |
| `/booking/success` | Post-payment confirmation |
| `/dashboard` | Home — KPIs, revenue chart, today's appointments |
| `/dashboard/appointments` | All appointments, status + payment management |
| `/dashboard/clients` | Client directory (grid & list) |
| `/dashboard/clients/[id]` | Client detail + full appointment ledger |
| `/dashboard/calendar` | Monthly calendar view |
| `/dashboard/payments` | Payment history |
| `/dashboard/expenses` | Expense tracking, profit overview *(plan-gated)* |
| `/dashboard/analytics` | 12-month revenue, service distribution, top clients *(plan-gated)* |
| `/dashboard/services` | Service catalog (group booking capacity per service) |
| `/dashboard/staff` | Staff management & working hours |
| `/dashboard/wallet` | Wallet balance & withdrawal requests *(plan-gated)* |
| `/dashboard/website` | Website builder *(image upload + SEO gated by plan)* |
| `/dashboard/booking-page` | Booking page share (`slug.calvy.io/book-now`) |
| `/dashboard/broadcasts` | Send email/WhatsApp broadcasts to clients *(plan-gated)* |
| `/dashboard/support` | Support tickets *(plan-gated: prioritySupport)* |
| `/dashboard/settings` | Profile, slot interval, availability, payout settings |
| `/dashboard/billing` | Plan & subscription management (dynamic, monthly/annual toggle) |
| `/admin` | Super-admin: tenants, plans, revenue, withdrawals |
| `/admin/support` | Admin support ticket inbox |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 14.2 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS |
| ORM | Prisma v5 |
| Database | PostgreSQL (Neon serverless) |
| Auth | NextAuth.js v4 (JWT, Credentials) |
| Email | Resend |
| WhatsApp | Meta WhatsApp Business Cloud API |
| Payments | Stripe (Subscriptions + Checkout) |
| File Storage | Vercel Blob |
| Push Notifications | Web Push (VAPID) + DB-backed notification panel |
| Analytics | Vercel Analytics |
| Charts | Recharts |
| Icons | Lucide React |
| Hosting | Vercel (wildcard `*.calvy.io` DNS) |

---

## Key Concepts

- **Multi-tenant, subdomain-per-business:** Each business gets `{slug}.calvy.io`. `middleware.ts` rewrites requests transparently. Slugs are generated from the business name with no random suffix (collision → `-2`, `-3`).
- **Plan-based feature gating:** Every dashboard page and feature is gated by the tenant's plan. `getBusinessFeatures(businessId)` reads live from `PlanConfig` DB. Locked features show an `<UpgradeGate>` prompt instead of the content.
- **Dynamic plans:** All plan limits and feature flags are managed from the admin panel (`/admin/plans`) and stored in the `PlanConfig` DB table — no redeployment needed.
- **Chatbot booking widget:** Every tenant website embeds a floating `<ChatWidget>` — a fully stateful booking assistant (services → date → time → details → confirm) that uses the same `/api/availability` and `/api/bookings` endpoints. Hidden on plans without `chatbotWidget` flag.
- **Multi-service bookings:** Clients can select multiple services in one appointment. Duration and price are summed. The first service's ID is the primary FK; extras are encoded in the `notes` field as `__services__:Name2|Name3`.
- **Group bookings:** Services have a `capacity` field. When `capacity > 1`, multiple clients can book the same slot until it fills up. Capacity field only visible in dashboard when `groupBooking` plan flag is enabled.
- **Payment modes:** `postpaid` (default) — pay at appointment; `prepaid` — Stripe Checkout at booking time. Prepaid requires bank details saved first and `stripePayments` plan flag enabled.
- **Annual billing:** Billing page supports monthly/annual toggle. Annual Stripe price IDs configured via `STRIPE_PRICE_*_ANNUAL` env vars.
- **Currency:** Prices stored in the business's native currency (set at signup). `formatCurrencyAmount(amount, currency)` handles display. No conversion.
- **Revenue/Profit:** Only appointments with `paymentStatus === "paid"` count toward revenue and profit figures.
- **Notifications:** Every appointment event (new booking, status change, payment) creates a DB `Notification` record. The dashboard header shows an unread badge with live 30-second polling. Web Push (VAPID) sends browser notifications if the tenant has granted permission.
- **Email verification:** Required before first login. 24-hour tokens in `VerificationToken`.
- **Soft-delete:** Services with existing appointments are deactivated (`isActive = false`), not deleted.
- **Slot interval:** Configurable per business (e.g. 15 min, 30 min, 60 min). Controls the granularity of the time-slot grid. Custom intervals gated by plan.
- **Support tickets:** Tenant-to-admin messaging system. Gated behind `prioritySupport` plan flag at both the page and API level.

---

## Plan Feature Flags

All flags live in `PlanConfig` DB and are editable from `/admin/plans`:

| Flag | Description |
|---|---|
| `maxStaff` | Max staff members (-1 = unlimited) |
| `maxServices` | Max active services (-1 = unlimited) |
| `maxMonthlyAppointments` | Booking quota per month (-1 = unlimited) |
| `customBranding` | Brand color picker in Settings |
| `imageUpload` | Upload tab in Website Builder image picker |
| `seoControls` | SEO & Meta Tags section in Website Builder |
| `chatbotWidget` | Floating chatbot on tenant public website |
| `groupBooking` | Group booking capacity field on services |
| `stripePayments` | Prepaid (online payment) mode in Settings |
| `emailReminders` | 24h before appointment email reminders |
| `smsReminders` | WhatsApp confirmations & reminders |
| `broadcasts` | Broadcasts page (send email/WhatsApp to all clients) |
| `csvExport` | CSV download on Appointments and Payments pages |
| `expenseTracking` | Expenses page |
| `analytics` | Analytics page |
| `wallet` | Wallet & withdrawals page |
| `customSlotInterval` | Slot interval picker in Settings |
| `removeBranding` | Remove "Powered by Calvy" from tenant website |
| `prioritySupport` | Support ticket system |

---

## Environment Variables

```bash
# Database
DATABASE_URL="postgresql://..."

# Auth
NEXTAUTH_SECRET="..."
NEXTAUTH_URL="https://calvy.io"

# App
NEXT_PUBLIC_APP_URL="https://calvy.io"
NEXT_PUBLIC_ROOT_DOMAIN="calvy.io"

# Stripe — Subscriptions (Monthly)
STRIPE_SECRET_KEY="sk_live_..."
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY="pk_live_..."
STRIPE_BILLING_WEBHOOK_SECRET="whsec_..."
STRIPE_PRICE_STARTER="price_..."
STRIPE_PRICE_PROFESSIONAL="price_..."
STRIPE_PRICE_BUSINESS="price_..."

# Stripe — Subscriptions (Annual) — optional, falls back to monthly if not set
STRIPE_PRICE_STARTER_ANNUAL="price_..."
STRIPE_PRICE_PROFESSIONAL_ANNUAL="price_..."
STRIPE_PRICE_BUSINESS_ANNUAL="price_..."

# Stripe — Booking Payments
STRIPE_WEBHOOK_SECRET="whsec_..."

# Email
RESEND_API_KEY="re_..."
EMAIL_FROM="Calvy <noreply@calvy.io>"

# WhatsApp (Meta Cloud API)
WHATSAPP_PHONE_NUMBER_ID="..."
WHATSAPP_ACCESS_TOKEN="..."

# Web Push (VAPID)
NEXT_PUBLIC_VAPID_PUBLIC_KEY="..."
VAPID_PRIVATE_KEY="..."
VAPID_SUBJECT="mailto:support@calvy.io"

# File Storage
BLOB_READ_WRITE_TOKEN="..."

# Admin
SUPER_ADMIN_EMAIL="admin@calvy.io"
ADMIN_SETUP_SECRET="..."
```

---

## Database

All database scripts load `.env.local` (via `dotenv-cli`). Schema changes are migrations, never `db push` (see `docs/migrations.md`).

```powershell
npm run db:migrate        # apply pending migrations (prisma migrate deploy)
npm run db:migrate:dev    # create + apply a new migration while developing (prisma migrate dev)
npm run db:generate       # regenerate the Prisma client
npm run db:status         # which migrations are applied
npm run db:seed           # demo data and dev-only test accounts
npm run db:studio         # visual explorer at localhost:5555
```

`db:deploy` (plain `prisma migrate deploy`, no `.env.local`) is for CI and hosting, where the variables are set for real.

### Test accounts (dev only)

`prisma/seed.ts` is idempotent and also creates these accounts. All share one password, printed at the end of the seed run (`CalvyDev#2026`). Never seed these into a production database.

| Email | Purpose |
|---|---|
| `demo@calvy.io` (password `password123`) | Owner with demo business, services, staff, clients, appointments |
| `admin@calvy.test` | Super admin (`role = "admin"`), email verified. Reaches `/admin/*` and `/crm`; no env var needed |
| `newowner@calvy.test` | Email verified, no business yet, so login redirects to `/onboarding` |

It also upserts two published sample blog posts (`test-how-to-reduce-no-shows`, `test-setting-up-online-booking`).

```bash
npx tsx --env-file=.env.local prisma/seed.ts   # the seed does not load .env.local by itself
```

---

## Utilities

```bash
# Strip random suffixes from existing business slugs (one-time migration)
npx dotenv-cli -e .env.local -- npx tsx scripts/update-slugs.ts
```

---

## Deployment

Deploy to Vercel. Add `*.calvy.io` as a wildcard domain in the Vercel project settings and point DNS to Vercel nameservers.

```bash
# Vercel (recommended)
npx vercel --prod
```

The `build` script runs `prisma generate && next build`. Prisma client must be generated before Next.js compiles — do not change this.

---

Built with ♥ by the Calvy team
