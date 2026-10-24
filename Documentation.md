# Calvy — Product Documentation

> **Version:** 1.3  
> **Last updated:** May 2026  
> **Stack:** Next.js 16 · React 19 · TypeScript · PostgreSQL (Neon) · Prisma · Razorpay (Cashfree planned) · Resend · Meta WhatsApp Cloud API · S3-compatible storage (R2) · Vercel Analytics
>
> **Accuracy note (2026-10-24):** this document predates the v2 work. Payments: the live integration is **Razorpay** (behind feature flags, off by default). **Cashfree is planned** to replace it for India in Step 5 (`docs/PLAN.md`); there is **no Stripe integration**, so any Stripe mention below is legacy and not current behaviour. Where it says Stripe, read Razorpay today and Cashfree from Step 5. `docs/PRODUCT-SPEC.md` describes current behaviour.

---

## Table of Contents

1. [Product Overview](#1-product-overview)
2. [Core Value Proposition](#2-core-value-proposition)
3. [Target Market](#3-target-market)
4. [Feature Reference](#4-feature-reference)
5. [Architecture](#5-architecture)
6. [Database Schema](#6-database-schema)
7. [User Roles & Access](#7-user-roles--access)
8. [Subscription Plans](#8-subscription-plans)
9. [Plan Feature Gating](#9-plan-feature-gating)
10. [Tenant Onboarding Flow](#10-tenant-onboarding-flow)
11. [Booking Flow](#11-booking-flow)
12. [Payments & Wallet](#12-payments--wallet)
13. [Tenant Website & Subdomain](#13-tenant-website--subdomain)
14. [Chatbot Booking Widget](#14-chatbot-booking-widget)
15. [Notifications](#15-notifications)
16. [Admin Panel](#16-admin-panel)
17. [API Reference](#17-api-reference)
18. [Third-Party Integrations](#18-third-party-integrations)
19. [Environment Variables](#19-environment-variables)
20. [Development Guide](#20-development-guide)
21. [Deployment](#21-deployment)
22. [Roadmap & Future Goals](#22-roadmap--future-goals)

---

## 1. Product Overview

**Calvy** is a white-label, multi-tenant SaaS platform that gives any service business a complete online presence and appointment booking system — all set up automatically on registration.

Every business that signs up gets:
- A **personal subdomain** at `{slug}.calvy.io` — no setup required
- A **public business website** at `{slug}.calvy.io` — fully customizable from the dashboard
- A **full-page booking experience** at `{slug}.calvy.io/book-now` — multi-step, multi-service
- An **embedded chatbot booking widget** on their website — state-machine conversational booking assistant
- A **management dashboard** — appointments, clients, staff, payments, expenses, analytics, broadcasts
- **Email & WhatsApp notifications** — confirmations and reminders sent automatically
- **Browser push notifications** — real-time alerts to the business owner's device
- **In-app notification panel** — persistent notification history in the dashboard header

No technical knowledge is required from the tenant. The entire product is ready to use in under 60 seconds.

---

## 2. Core Value Proposition

| For Tenants (Business Owners) | For Their Clients |
|---|---|
| Free lifetime plan, no card required | Book 24/7 without calling |
| Personal subdomain (`name.calvy.io`) instantly | Confirmation by email & WhatsApp |
| Manage everything from one dashboard | Chatbot widget for instant booking on the website |
| Accept online payments (Stripe) | Full-page booking at `/book-now` |
| Automated reminders | Real-time slot availability |
| Multi-currency — prices in your local currency | Mobile-friendly, no account required |
| Expense tracking & profit visibility | Calendar invite attached to confirmation |
| Multi-service & group booking support | Service deep-links from business website |

**Elevator pitch:**  
*"Calvy gives every service business a professional subdomain, a booking website, and a full management dashboard in under a minute — from salons and clinics to consultants and gyms."*

---

## 3. Target Market

### Primary Verticals
- **Beauty & Wellness** — Salons, barbershops, spas, nail studios, lash & brow bars
- **Health & Medical** — Clinics, physiotherapy, dental, counselling, private GP
- **Fitness** — Personal trainers, gyms, yoga studios, pilates, martial arts
- **Professional Services** — Consultants, lawyers, accountants, coaches, therapists
- **Food & Hospitality** — Private chefs, restaurant experiences, cooking classes
- **Education** — Tutors, language schools, music teachers, driving instructors

### Business Size
- **Solo operators** (1 staff member)
- **Small teams** (2–10 staff)
- **Growing businesses** needing structure and automation

### Geography
- Global-ready with 15+ currencies at signup
- Each tenant selects their region/currency at registration — prices stored and displayed in that currency with no conversion

---

## 4. Feature Reference

### 4.1 Dashboard

#### Appointments
- View all appointments with full detail (service, client, staff, status, payment)
- Filter by staff member, date range, status
- Status management: pending → confirmed → completed / cancelled / no-show
- View appointment detail modal (service, notes, payment info)
- Mark postpaid appointments as paid (updates client's total spent atomically)
- **Create appointment manually** from the dashboard — multi-service selection with combined duration/price summary, staff picker, date/time, client details
- **Export appointments to CSV** *(plan-gated: `csvExport`)*

#### Clients
- Client directory with grid and list views
- Clicking a client opens their **detail page** with full profile and appointment ledger
- Appointment ledger shows every booking with date, service, staff, duration, price, status, and payment status — color-coded
- Automatic VIP badge for clients who have paid over 500 in their currency
- Per-client stats: total visits, total amount paid, last visit date
- Quick actions: email client, call client
- Add new clients with phone validation
- Search by name or email

#### Staff
- Create and manage staff members
- Assign role, email, phone, color identifier
- Set working hours per day (start time, end time, on/off toggle)
- Assign services each staff member can perform
- Toggle active/inactive status

#### Services
- Create services with name, description, duration (minutes), price, color, category
- **Group booking capacity** *(plan-gated: `groupBooking`)* — set `Max participants` per service; when > 1, multiple clients can book the same slot (shows purple "Group · N spots" badge)
- Toggle active/inactive per service
- Edit in-place via modal
- Soft-delete: if service has appointments it deactivates instead of deleting (preserves history)
- Duplicate service name check (case-insensitive)

#### Calendar
- Monthly calendar view showing appointment density per day
- Navigate months

#### Payments
- Full payment history table
- Status labels: paid, unpaid, refunded
- **Export payments to CSV** *(plan-gated: `csvExport`)*

#### Expenses *(plan-gated: `expenseTracking`)*
- Log business expenses with amount, category, description, and date
- 10 categories: Rent, Utilities, Supplies, Salary, Marketing, Equipment, Software, Food & Beverages, Maintenance, Other
- Monthly profit card on dashboard: revenue (paid only) minus expenses
- Expenses factored into Analytics profit chart

#### Wallet *(plan-gated: `wallet`)*
- Track accumulated revenue from prepaid bookings
- View current balance
- Request withdrawal (requires bank details in Settings)
- Withdrawal history with status: pending / released / rejected

#### Analytics *(plan-gated: `analytics`)*
- 12-month revenue & profit bar chart (revenue = paid appointments only; profit = revenue − expenses)
- Weekly appointment distribution (busiest days)
- Top 5 services by booking count
- Top clients by spend
- Average booking value, total appointments, monthly revenue, monthly expenses

#### Broadcasts *(plan-gated: `broadcasts`)*
- Send email or WhatsApp messages to all clients in the business's client list
- Subject + message body
- Medium selector: email / WhatsApp
- Sent count tracking per broadcast

#### Support *(plan-gated: `prioritySupport`)*
- Tenant-to-admin support ticket system
- Create tickets with subject, priority, and initial message
- Full conversation thread per ticket (tenant replies + admin replies)
- Status tracking: open / in_progress / resolved / closed
- Tenants on plans without `prioritySupport` see an upgrade prompt; API routes return 403

#### Settings
- Business details: name, phone, email, address, website, description
- **Primary brand color picker** *(plan-gated: `customBranding`; shown read-only with lock on lower plans)*
- Business type classification
- **Slot interval** *(plan-gated: `customSlotInterval`; locked to 30 min on lower plans)* — controls time-slot grid granularity (e.g. 15 min, 30 min, 60 min)
- Working hours / availability (per day of week, start/end time)
- Currency selector (15+ currencies — set at signup, editable here)
- Payment mode: **postpaid** (default) or **prepaid** *(plan-gated: `stripePayments`; locked until bank details saved)*
- Bank / payout details: account name, account number, routing number, IBAN
- Prepaid mode is locked in the UI until bank account details are saved first

#### Booking Page
- Preview and copy the public booking URL: `https://{slug}.calvy.io/book-now`
- Direct link opens the full-page booking experience on the tenant's subdomain

#### Website Builder
- Fully customize the public business website
- Per-section toggle (show/hide): Hero, About, Services, Team, Contact
- Edit all text copy (headlines, subheadlines, CTAs, badges, body text)
- Image picker with three modes:
  - **Photo Library** — 20 curated Unsplash photos by business type (always available)
  - **Upload** *(plan-gated: `imageUpload`)* — local file upload → Vercel Blob
  - **Custom URL** — any publicly accessible image URL (always available)
- **SEO controls** *(plan-gated: `seoControls`)* — page title, meta description; section hidden on lower plans
- **Preview button** opens `https://{slug}.calvy.io` in a new tab
- **Copy link** copies the subdomain URL

#### Notifications Panel
- Bell icon in the dashboard header with live unread count badge
- Opens notification drawer showing last 30 notifications
- Each entry has title, body, time-ago, and icon (Calendar for bookings, CreditCard for payments)
- Unread notifications highlighted in light blue
- **Mark all read** clears the badge on open
- Polls every 30 seconds for new notifications
- Notifications persist in the database (survive page reload / re-login)

#### Billing
- View current plan and status (labels: Free / Active / Payment Due / Cancelled)
- **Monthly / Annual toggle** — switch between monthly and annual pricing with live price display
- Annual billing shows yearly total and "Save ~20%" badge
- Plan cards built dynamically from `PlanConfig` DB — names, prices, and feature lists always reflect admin settings
- **Feature comparison table** — all 17+ feature flags shown as checkmarks across all 4 plans
- One-click upgrade via Stripe Checkout (passes `interval` to use correct Stripe price ID)
- Stripe Billing Portal access (manage card, invoices, cancel)
- "Sync subscription" button for manual status re-sync from Stripe

---

### 4.2 Full-Page Booking (`{slug}.calvy.io/book-now`)

A clean, multi-step booking experience served on the tenant's own subdomain — no login required.

**Steps:**
1. **Service selection** — Browse services with duration and price; optional search when 4+ services; multi-select with combined total; group booking badge shows capacity
2. **Staff selection** — Pick a specific staff member or "Any available"
3. **Date & Time** — Interactive calendar + available time slot grid; group slots show spots remaining
4. **Client details** — Name (required), email (required), phone (optional), notes (optional)
5. **Confirmation** — Full review of all selections before submit
6. **Payment** — Stripe Checkout (prepaid) or immediate confirmation (postpaid)

**Deep-linking from the website:**  
Service cards on `{slug}.calvy.io` link to `/book-now?service={id}` — the booking page reads the query param and pre-selects that service automatically, skipping manual selection.

**Back to website:**  
A "← Back to website" link at the top returns the visitor to the tenant's home page.

**Post-booking:**
- Confirmation email sent automatically (with .ics calendar invite)
- WhatsApp confirmation sent if phone number provided
- Appointment appears in tenant dashboard
- Push notification delivered to business owner
- DB notification record created (visible in notification panel)

---

### 4.3 Tenant Website (`{slug}.calvy.io`)

An auto-generated, SEO-ready single-page website for each business, served via wildcard subdomain routing.

**Sections:**
- **Navbar** — Floating frosted-glass with section links and Book Now CTA → links to `/book-now`
- **Hero** — Full-screen background image, badge, headline, dual CTAs → primary goes to `/book-now`
- **About** — Two-column layout with image, body, floating trust badge → CTA links to `/book-now`
- **Services** — Card grid; each card deep-links to `/book-now?service={id}` to pre-select that service
- **Team** — Staff cards with gradient initials avatar and role badge
- **Contact** — Split panel with contact info + booking CTA → links to `/book-now`
- **Footer** — Dark footer with nav links and Book Now button → links to `/book-now`
- **Chatbot widget** — Floating chat button in the bottom-right corner *(plan-gated: `chatbotWidget`)*

All content customizable from the dashboard Website section. Services and staff pulled live from the database. Color scheme follows the business's primary color.

---

## 5. Architecture

```
calvy/
├── app/
│   ├── page.tsx                        # Marketing landing page (pricing from PlanConfig DB)
│   ├── login/
│   ├── signup/
│   ├── verify-email/
│   ├── [slug]/                         # Tenant website (rewritten from subdomain by proxy.ts)
│   │   └── book-now/                   # Full-page booking on subdomain
│   ├── b/[slug]/                       # Legacy public booking page (still active)
│   ├── booking/success/                # Post-payment confirmation
│   ├── dashboard/
│   │   ├── page.tsx                    # Home (KPIs, charts, today's appointments)
│   │   ├── appointments/               # CSV export gated by plan
│   │   ├── billing/                    # Dynamic plans + monthly/annual toggle
│   │   ├── booking-page/               # Shows subdomain /book-now URL
│   │   ├── broadcasts/                 # Plan-gated
│   │   ├── calendar/
│   │   ├── clients/
│   │   │   └── [id]/                   # Client detail + appointment ledger
│   │   ├── expenses/                   # Plan-gated
│   │   ├── payments/                   # CSV export gated by plan
│   │   ├── services/                   # Group booking capacity gated by plan
│   │   ├── settings/                   # Branding / slot interval / prepaid gated by plan
│   │   ├── staff/
│   │   ├── support/                    # Plan-gated (prioritySupport)
│   │   ├── wallet/                     # Plan-gated
│   │   ├── website/                    # Image upload + SEO gated by plan
│   │   └── analytics/                  # Plan-gated
│   ├── admin/
│   │   ├── page.tsx                    # Platform overview
│   │   ├── plans/                      # Edit all plan feature flags & limits live
│   │   ├── support/                    # Admin support ticket inbox
│   │   └── ...
│   └── api/
├── components/
│   ├── chatbot/
│   │   └── ChatWidget.tsx              # Conversational booking bot (tenant website)
│   ├── dashboard/
│   │   ├── DashboardLayout.tsx
│   │   ├── Header.tsx                  # Bell icon, notification panel, polling
│   │   ├── Sidebar.tsx
│   │   └── UpgradeGate.tsx             # Reusable plan-gated upgrade prompt component
│   ├── landing/
│   │   ├── Pricing.tsx                 # Server component — reads PlanConfig from DB
│   │   └── PricingClient.tsx           # Client — monthly/annual toggle
│   ├── providers/
│   └── ui/
├── lib/
│   ├── auth.ts
│   ├── currency.ts
│   ├── email.ts
│   ├── getFeatures.ts                  # getBusinessFeatures(businessId) — DB plan lookup
│   ├── plans.ts                        # PLAN_LIMITS, PLAN_META, getLimitsFromDB, getStripePriceId
│   ├── prisma.ts
│   ├── push.ts                         # Web Push + always creates DB Notification record
│   ├── stripe.ts
│   ├── utils.ts
│   ├── website.ts
│   └── whatsapp.ts
├── proxy.ts                       # Subdomain → /[slug] rewrite + auth protection
├── scripts/
│   └── update-slugs.ts                 # One-time: strip random suffixes from existing slugs
└── prisma/schema.prisma
```

### Subdomain Routing

`proxy.ts` intercepts every request:
- If `host` matches `*.calvy.io` (and is not `www.calvy.io`), it extracts the slug and rewrites the path internally: `abc.calvy.io/book-now` → `/abc/book-now`
- API routes (`/api/*`) are excluded from rewriting so the chatbot widget's fetch calls work correctly
- `/dashboard/*` and `/admin/*` on the main domain go through `withAuth` for JWT protection

```
abc.calvy.io          → NextResponse.rewrite(/abc)
abc.calvy.io/book-now → NextResponse.rewrite(/abc/book-now)
abc.calvy.io/api/…    → passes through unchanged (API routes excluded)
calvy.io/dashboard    → withAuth (requires session)
```

### Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router), React 19 |
| Language | TypeScript |
| Styling | Tailwind CSS + custom design tokens |
| UI Components | Custom + Radix UI primitives |
| Icons | Lucide React |
| Charts | Recharts |
| ORM | Prisma v5.22 |
| Database | PostgreSQL (Neon serverless) |
| Auth | NextAuth.js v4 (JWT + Credentials) |
| Payments | Razorpay today (feature-flagged off); Cashfree planned (Step 5); no Stripe |
| Email | Resend |
| WhatsApp | Meta WhatsApp Business Cloud API |
| File Storage | Vercel Blob |
| Push Notifications | Web Push (VAPID) |
| Analytics | Vercel Analytics |
| Hosting | Vercel (wildcard `*.calvy.io` DNS) |

---

## 6. Database Schema

### User
| Field | Type | Notes |
|---|---|---|
| id | String | cuid() |
| name | String | |
| email | String | unique |
| password | String | bcrypt hash |
| role | String | "user" or "admin" |
| emailVerified | DateTime? | Set when email link clicked |

### VerificationToken
| Field | Type | Notes |
|---|---|---|
| token | String | unique · 32-byte hex |
| email | String | |
| expiresAt | DateTime | 24 hours from creation |

### Business
| Field | Type | Notes |
|---|---|---|
| id | String | cuid() |
| name | String | Display name |
| slug | String | unique · generated from name, no random suffix |
| plan | String | free / starter / professional / business |
| planStatus | String | free / active / past_due / cancelled |
| trialEndsAt | DateTime? | Legacy — free plan has no expiry |
| stripeCustomerId / stripeSubscriptionId | String? | |
| ownerId | String | FK → User |
| businessType | String | salon / clinic / gym / etc. |
| phone / email / address / website / description | String? | |
| primaryColor | String | Hex, default #e84545 |
| availabilityJson | String | JSON: working hours per weekday |
| slotInterval | Int | Minutes between slots (default 30) |
| websiteJson | String | JSON: WebsiteConfig |
| currency | String | ISO code, set at signup |
| paymentMode | String | postpaid (default) / prepaid |
| walletBalance | Float | Accumulated prepaid revenue |
| bankAccount* | String? | Required before enabling prepaid |

### Service
| Field | Type | Notes |
|---|---|---|
| id | String | cuid() |
| businessId | String | FK → Business |
| name / description / category | String | |
| duration | Int | Minutes |
| price | Float | In business native currency |
| color | String | Hex |
| **capacity** | Int | **1 = individual; >1 = group booking** |
| isActive | Boolean | Soft-delete flag |

### Staff
| Field | Type | Notes |
|---|---|---|
| id | String | cuid() |
| businessId | String | FK → Business |
| name / role / email / phone / color | String | |
| isActive | Boolean | |
| workingHours | String | JSON per weekday |

### StaffService *(many-to-many)*
| staffId + serviceId | Composite PK | Cascade delete |

### Client
| Field | Type | Notes |
|---|---|---|
| id | String | cuid() |
| businessId | String | FK → Business |
| name / email / phone / notes | String | |
| totalAppointments | Int | Auto-tracked |
| totalSpent | Float | Incremented when payment marked paid |
| lastVisit | DateTime? | Updated on each booking |
| Unique | businessId + email | Per-business |

### Appointment
| Field | Type | Notes |
|---|---|---|
| id | String | cuid() |
| businessId / clientId / staffId? / serviceId | String | FKs |
| date | DateTime | UTC |
| duration | Int | Minutes (sum of all selected services) |
| price | Float | Sum of all selected services' prices |
| status | String | pending / confirmed / completed / cancelled / no-show |
| paymentStatus | String | unpaid / paid / refunded |
| paymentMode | String | prepaid / postpaid |
| stripeSessionId | String? | |
| notes | String? | Multi-service encoded as `__services__:Name2\|Name3\n{user notes}` |
| reminderSent | Boolean | Prevents duplicate reminders |

### Expense
| Field | Type | Notes |
|---|---|---|
| id | String | cuid() |
| businessId | String | FK → Business |
| amount | Float | Native currency |
| category | String | Rent / Supplies / Salary / etc. |
| description / date | | |

### Notification
| Field | Type | Notes |
|---|---|---|
| id | String | cuid() |
| businessId | String | FK → Business |
| title | String | e.g. "New appointment booked" |
| body | String | e.g. "Jane — Haircut on Monday at 10:00" |
| url | String | Link opened on click (default `/dashboard`) |
| read | Boolean | false until opened in panel |
| createdAt | DateTime | |

### PushSubscription
| Field | Type | Notes |
|---|---|---|
| id | String | cuid() |
| businessId | String | FK → Business |
| endpoint | String | unique |
| p256dh / auth | String | Encryption keys |

### Broadcast
| Field | Type | Notes |
|---|---|---|
| id | String | cuid() |
| businessId | String | FK → Business |
| subject / message | String | |
| medium | String | email / whatsapp |
| sentTo | Int | Recipient count |

### WithdrawalRequest
| Field | Type | Notes |
|---|---|---|
| id | String | cuid() |
| businessId | String | FK → Business |
| amount | Float | |
| status | String | pending / released / rejected |
| notes / adminNotes | String? | |
| requestedAt / processedAt | DateTime | |

### PlanConfig *(Admin-managed)*
| Field | Type | Notes |
|---|---|---|
| planId | String | PK · free / starter / professional / business |
| name / description | String | Display strings |
| price | Float | Monthly price |
| annualPrice | Float | Annual price (per month) |
| maxStaff | Int | -1 = unlimited |
| maxServices | Int | -1 = unlimited |
| maxMonthlyAppointments | Int | -1 = unlimited |
| maxBroadcastsPerMonth | Int | 0 = disabled |
| analytics | Boolean | Analytics page access |
| customBranding | Boolean | Brand color picker |
| imageUpload | Boolean | Upload tab in website builder |
| seoControls | Boolean | SEO section in website builder |
| chatbotWidget | Boolean | Floating chatbot on tenant site |
| groupBooking | Boolean | Group booking capacity field |
| multiService | Boolean | Multi-service selection |
| stripePayments | Boolean | Prepaid (Stripe Checkout) mode |
| emailReminders | Boolean | 24h email reminders |
| smsReminders | Boolean | WhatsApp reminders |
| broadcasts | Boolean | Broadcasts page |
| csvExport | Boolean | CSV export on appointments/payments |
| expenseTracking | Boolean | Expenses page |
| wallet | Boolean | Wallet & withdrawals |
| customSlotInterval | Boolean | Slot interval picker |
| removeBranding | Boolean | Remove "Powered by Calvy" |
| prioritySupport | Boolean | Support ticket system |
| features | String | JSON array — custom bullet overrides for pricing display |

### SupportTicket
| Field | Type | Notes |
|---|---|---|
| id | String | cuid() |
| businessId | String | FK → Business |
| subject | String | |
| status | String | open / in_progress / resolved / closed |
| priority | String | low / normal / high / urgent |
| createdAt / updatedAt | DateTime | |

### SupportMessage
| Field | Type | Notes |
|---|---|---|
| id | String | cuid() |
| ticketId | String | FK → SupportTicket |
| senderRole | String | tenant / admin |
| body | String | |
| createdAt | DateTime | |

---

## 7. User Roles & Access

### Tenant (role: "user")
- Full access to `/dashboard/*`
- Features within the dashboard are gated by the tenant's active plan
- Access restricted to own business data (enforced server-side via `session.user.businessId`)
- Cannot access `/admin/*`

### Super Admin (role: "admin")
- Access to `/admin/*` (platform management)
- Can view all tenants, manage plans, approve withdrawals, respond to support tickets
- Granted via `SUPER_ADMIN_EMAIL` env var or `POST /api/admin/make-admin`

### Public (unauthenticated)
- Can view `{slug}.calvy.io` (tenant website)
- Can use `{slug}.calvy.io/book-now` (full-page booking)
- Can use the ChatWidget on the tenant website (if plan includes `chatbotWidget`)
- Cannot access dashboard or admin

---

## 8. Subscription Plans

> Current pricing (configurable via `/admin/plans` without redeployment):

| Feature | Free | Starter | Professional | Business |
|---|---|---|---|---|
| Monthly price | $0 | $2/mo | $5/mo | $10/mo |
| Annual price | — | $1/mo | $4/mo | $8/mo |
| Max Staff | 1 | 2 | 5 | Unlimited |
| Max Services | 3 | 5 | Unlimited | Unlimited |
| Monthly Bookings | 30 | 100 | Unlimited | Unlimited |
| Custom Branding | — | ✓ | ✓ | ✓ |
| Email Reminders | — | ✓ | ✓ | ✓ |
| CSV Export | — | ✓ | ✓ | ✓ |
| Image Upload (website) | — | ✓ | ✓ | ✓ |
| Chatbot Widget | — | — | ✓ | ✓ |
| WhatsApp Reminders | — | — | ✓ | ✓ |
| Analytics | — | — | ✓ | ✓ |
| Expense Tracking | — | — | ✓ | ✓ |
| Wallet & Withdrawals | — | — | ✓ | ✓ |
| Broadcasts | — | — | ✓ | ✓ |
| Online Payments (Stripe) | — | — | ✓ | ✓ |
| SEO Controls | — | — | ✓ | ✓ |
| Group Booking | — | — | ✓ | ✓ |
| Custom Slot Intervals | — | — | ✓ | ✓ |
| Remove Branding | — | — | — | ✓ |
| Priority Support | — | — | — | ✓ |

**Notes:**
- Free plan is lifetime — no expiry, no credit card required
- All limits and flags are editable at runtime via `/admin/plans` — stored in `PlanConfig` DB table
- `getBusinessFeatures(businessId)` in `lib/getFeatures.ts` is the runtime enforcement function

---

## 9. Plan Feature Gating

### How It Works

Every plan-gated feature follows the same pattern:

1. **Server page** calls `getBusinessFeatures(businessId)` — fetches `Business.plan`, then `PlanConfig` from DB via `getLimitsFromDB(plan)`, falling back to hardcoded `PLAN_LIMITS` defaults
2. If the feature flag is `false`, the page renders `<UpgradeGate>` instead of the actual content
3. **API routes** for gated features also check the flag and return `403` if the plan doesn't include it — prevents bypass via direct API calls

### Gated Pages (full-page UpgradeGate)

| Page | Flag |
|---|---|
| `/dashboard/analytics` | `analytics` |
| `/dashboard/broadcasts` | `broadcasts` |
| `/dashboard/expenses` | `expenseTracking` |
| `/dashboard/wallet` | `wallet` |
| `/dashboard/support` | `prioritySupport` |

### Gated Features (UI elements hidden/locked within pages)

| Page | Feature | Flag |
|---|---|---|
| Services | Group booking capacity field | `groupBooking` |
| Appointments | CSV download button | `csvExport` |
| Payments | Export CSV button | `csvExport` |
| Settings | Brand color picker (read-only on lower plans) | `customBranding` |
| Settings | Slot interval picker (locked to 30 min) | `customSlotInterval` |
| Settings | Prepaid payment mode (disabled) | `stripePayments` |
| Website Builder | Upload tab in image picker | `imageUpload` |
| Website Builder | SEO & Meta Tags section | `seoControls` |
| Tenant website | Chatbot widget | `chatbotWidget` |

### Key Files

```
lib/getFeatures.ts              # getBusinessFeatures(businessId) — DB lookup
lib/plans.ts                    # PLAN_LIMITS defaults, getLimitsFromDB, getStripePriceId
components/dashboard/UpgradeGate.tsx   # Reusable upgrade prompt UI
```

---

## 10. Tenant Onboarding Flow

```
/signup
  ↓
User fills: name, email, password, business name, business type, currency/region
  ↓
POST /api/signup
  ↓ creates:
  User (hashed password, emailVerified = null)
  Business (slug from name — no random suffix, collision → -2/-3,
            currency, websiteJson with smart defaults,
            paymentMode = "postpaid", slotInterval = 30)
  Staff (owner, default working hours Mon–Sat)
  Service ("Consultation" · 30min · price in chosen currency)
  VerificationToken (24hr expiry)
  ↓
sendVerificationEmail() → link to /verify-email?token=...
  ↓
User clicks link → GET /api/auth/verify-email
  ↓ sets emailVerified, deletes token
  ↓
Redirect → /login?verified=1
  ↓
User logs in → /dashboard
```

On first login the tenant has:
- Website at `{slug}.calvy.io`
- Booking page at `{slug}.calvy.io/book-now`
- One service and one staff member ready to edit
- Free plan active (no expiry)
- Currency configured

---

## 11. Booking Flow

### Via `/book-now` or `/b/[slug]`

```
Client visits {slug}.calvy.io/book-now
  ↓
Step 1: Select service(s) — multi-select, totals shown
        [optional: ?service=<id> in URL pre-selects a service]
Step 2: Select staff (or Any)
Step 3: Pick Date → GET /api/availability → Pick Time Slot
Step 4: Enter Name, Email, Phone, Notes
Step 5: Review & Confirm
  ↓
POST /api/bookings
  ↓
  ┌─ Prepaid + Stripe ──→ Stripe Checkout → /booking/success
  └─ Postpaid ──────────→ Appointment created immediately
  ↓
Confirmation email sent (Resend) — includes .ics calendar invite
WhatsApp message sent (if phone provided)
Push notification sent to business owner's browser
DB Notification record created (visible in dashboard header panel)
Appointment appears in tenant dashboard
```

### Via ChatWidget (embedded on tenant website)

```
Client clicks floating chat button on {slug}.calvy.io
  ↓
Bot: "Which service(s) would you like to book?"
  ↓ [service checkboxes]
Bot: "When would you like to come in?"
  ↓ [mini calendar]
Bot: "Let me check available times..."
  → GET /api/availability
  ↓ [time slot grid]
Bot: "Just a few details..."
  ↓ [name, email, phone inputs]
Bot: "Here's your booking summary..." → [Confirm button]
  ↓
POST /api/bookings
  ↓
  ┌─ Prepaid ──→ redirect to Stripe Checkout
  └─ Postpaid → "✅ Booking confirmed!" in chat
```

### Availability Algorithm

`GET /api/availability?slug=X&date=YYYY-MM-DD&duration=N&serviceId=Y`

1. Load business working hours for the given weekday from `availabilityJson`
2. Generate time slots at `slotInterval` intervals within working hours
3. Fetch existing appointments for the day (UTC date range)
4. **Individual services** (`capacity = 1`): block all minutes covered by any appointment. Slot removed if it overlaps any booked minute.
5. **Group services** (`capacity > 1`): count bookings per slot. Slot available until booking count reaches capacity. Returns `spotsMap` with remaining spots per slot.
6. Returns available slot strings + `spotsMap` for group, `isGroup` flag, `capacity`

---

## 12. Payments & Wallet

### Payment Modes

**Postpaid (default)**
- Appointment created immediately, no upfront payment
- `paymentStatus` stays "unpaid" until tenant manually marks it paid
- When marked paid: `paymentStatus = "paid"` and `client.totalSpent` incremented (atomic)

**Prepaid (Stripe Checkout)**
- Requires bank account details saved in Settings before activating
- Requires `stripePayments` plan flag
- Client pays at booking via Stripe hosted checkout
- On `checkout.session.completed` webhook: appointment created, all notifications sent
- Revenue added to `walletBalance`

### Revenue & Profit Rules
- **Revenue** = sum of `price` where `paymentStatus === "paid"` only
- **Profit** = Revenue − Expenses
- Pending/unpaid/refunded appointments excluded from all revenue figures

### Subscription Billing (Stripe)

| Stripe Event | Action |
|---|---|
| `checkout.session.completed` | Activate subscription or create prepaid booking |
| `customer.subscription.updated` | Sync plan status |
| `customer.subscription.deleted` | Set planStatus = cancelled |
| `invoice.payment_succeeded` | Set planStatus = active |
| `invoice.payment_failed` | Set planStatus = past_due |

#### Monthly vs Annual Billing
- Billing page shows a Monthly / Annual toggle
- Annual Stripe price IDs configured via `STRIPE_PRICE_*_ANNUAL` env vars
- `getStripePriceId(plan, interval)` in `lib/plans.ts` resolves the correct price ID
- Falls back to monthly price ID if annual is not configured

### Wallet & Withdrawals
- `walletBalance` accumulates from prepaid bookings
- Tenant requests withdrawal from `/dashboard/wallet` (requires bank details)
- Creates `WithdrawalRequest` with status "pending"
- Admin approves/rejects at `/admin/withdrawals`

### Currency
15 currencies: USD, EUR, GBP, CAD, AUD, AED, SAR, INR, PKR, BDT, MYR, SGD, NGN, ZAR, NZD

Prices stored in business native currency. `formatCurrencyAmount(amount, currency)` formats for display via `Intl.NumberFormat`. No conversion.

---

## 13. Tenant Website & Subdomain

### Subdomain Assignment
- Slug generated from business name at signup: `"Hello World"` → `hello-world`
- Collisions get numeric suffix: `hello-world-2`, `hello-world-3`
- No random characters appended
- Migration script available: `npx tsx scripts/update-slugs.ts`

### WebsiteConfig Structure
```typescript
{
  metaTitle, metaDescription,
  hero: { enabled, image, badge, headline, subheadline, ctaText, secondaryCtaText },
  about: { enabled, image, badge, title, body, trustLabel, ctaText },
  services: { enabled, badge, title, subtitle, ctaText },
  team: { enabled, badge, title, subtitle },
  contact: { enabled, badge, title, subtext, ctaHeading, ctaSubtext, ctaNote,
              showPhone, showEmail, showAddress }
}
```

### Image Sources (Website Builder)
1. **Photo Library** — 20 curated Unsplash photos by business type (always available)
2. **Upload** *(plan-gated: `imageUpload`)* — Local file upload → Vercel Blob at `website/{businessId}/{timestamp}.{ext}` (max 5 MB)
3. **Custom URL** — Any publicly accessible image URL (always available)

### Smart Defaults
`defaultWebsiteConfig(businessName, businessType)` seeds business-type-appropriate images and copy on signup (clinic → medical photos, gym → fitness photos, etc.).

---

## 14. Chatbot Booking Widget

A fully self-contained conversational booking assistant embedded on every tenant website. **Only rendered when the tenant's plan includes the `chatbotWidget` flag.**

**Component:** `components/chatbot/ChatWidget.tsx`

**State machine:**
```
services → date → time → details → confirm → success
```

**Features:**
- Floating button with the tenant's primary color; pulsing green dot on first visit
- Multi-service checkbox selection with combined total displayed on the Continue button
- Mini calendar for date selection; past days disabled
- Available time slot grid; fetches from `/api/availability` with slug + date + duration
- Name, email (required), phone (optional) input fields
- Booking summary message before confirmation
- Submits to `/api/bookings` — handles Stripe redirect (prepaid) or shows success message (postpaid)
- "Book another appointment" restart flow

**Data flow:**
- Business data (slug, name, color, currency, services) passed as props from the server page
- All API calls use relative URLs (`/api/…`) which work correctly on both localhost and subdomains (API routes excluded from the proxy rewrite)

---

## 15. Notifications

### In-App Notification Panel (DB-backed)
- Every appointment event triggers `sendPushToBusiness()` in `lib/push.ts`, which **always** creates a `Notification` DB record regardless of whether browser push is enabled
- Dashboard `Header.tsx` fetches `/api/notifications` on mount and every 30 seconds
- Bell icon shows unread count badge (number); clears on panel open via `PATCH /api/notifications`
- Panel shows last 30 notifications with title, body, time-ago, read/unread state

### Web Push (Browser)
- Business owner subscribes via "Enable push notifications" in the dashboard
- Subscription stored in `PushSubscription` table (one per device/browser)
- Uses VAPID protocol (`NEXT_PUBLIC_VAPID_PUBLIC_KEY` + `VAPID_PRIVATE_KEY`)
- Push payload includes title, body, URL to open on click, deduplication `tag`
- Gracefully skipped if VAPID keys not configured or no subscription exists

### Email (Resend)
- **Verification email** — sent at signup; contains `/verify-email?token=...`; 24hr expiry
- **Booking confirmation** — sent to client after booking; includes .ics calendar invite
- **Booking reminder** — sent ~24hr before appointment; `reminderSent` flag prevents duplicates

### WhatsApp (Meta Cloud API)
- Booking confirmation + reminder sent to client's phone number if provided
- Requires `WHATSAPP_PHONE_NUMBER_ID` + `WHATSAPP_ACCESS_TOKEN`
- Gracefully skipped if not configured

---

## 16. Admin Panel

Accessible at `/admin` — restricted to `role = "admin"`.

### Dashboard (`/admin`)
- Platform totals: tenants, active plans, free users
- All-time and monthly revenue
- Plan distribution breakdown
- Recent tenant list

### Tenants (`/admin/tenants`)
- Search/filter all businesses
- Per-tenant: name, owner, plan, status, monthly stats
- Actions: sync subscription, update plan

### Plans (`/admin/plans`)
- Edit all plan limits and feature flags live (no redeployment needed)
- 17+ boolean feature flags organized in groups: Online Presence, Booking, Notifications, Analytics & Finance, Premium
- Numeric limits: maxStaff, maxServices, maxMonthlyAppointments, maxBroadcastsPerMonth
- Pricing fields: price (monthly), annualPrice
- Custom feature bullet points (JSON array override for pricing display)
- Changes take effect immediately — `getBusinessFeatures()` always reads from DB

### Revenue (`/admin/revenue`)
- Monthly revenue chart (last 6 months)
- Top tenants by revenue

### Withdrawals (`/admin/withdrawals`)
- Pending withdrawal queue
- Per-request: business, amount, bank details
- Actions: approve (released), reject, add admin notes

### Support (`/admin/support`)
- View all support tickets from all tenants
- Reply to tickets from the admin side
- Update ticket status: open / in_progress / resolved / closed

### Notifications (`/admin/notifications`)
- Send broadcast to all tenants via email or WhatsApp

---

## 17. API Reference

### Public (no auth)
| Method | Route | Description |
|---|---|---|
| POST | `/api/signup` | Register tenant — creates user, business, staff, service, sends verification email |
| GET | `/api/auth/verify-email` | Verify email token |
| POST | `/api/auth/[...nextauth]` | NextAuth handler |
| GET | `/api/availability` | Get available slots (slug, date, duration, serviceId) |
| POST | `/api/bookings` | Create appointment (public booking) |
| POST | `/api/bookings/confirm` | Confirm prepaid booking |

### Authenticated (tenant)
| Method | Route | Description |
|---|---|---|
| GET/POST | `/api/appointments` | List / create appointments (supports serviceIds[] for multi-service) |
| PATCH/DELETE | `/api/appointments/[id]` | Update status / delete |
| PATCH | `/api/appointments/[id]/payment` | Mark as paid (updates client.totalSpent) |
| GET/POST | `/api/clients` | List / create clients |
| GET/POST | `/api/expenses` | List / create expenses |
| DELETE | `/api/expenses/[id]` | Delete expense |
| GET/POST | `/api/services` | List / create services (includes capacity field) |
| PATCH/DELETE | `/api/services/[id]` | Update / delete service |
| GET/POST | `/api/staff` | List / create staff |
| PATCH/DELETE | `/api/staff/[id]` | Update / delete staff |
| GET/PATCH | `/api/settings` | Business settings including slotInterval |
| GET/PATCH | `/api/settings/payout` | Bank details + payment mode |
| POST | `/api/upload` | Upload image → Vercel Blob |
| GET/POST | `/api/push` | Push subscriptions |
| GET | `/api/notifications` | Last 30 notifications + unread count |
| PATCH | `/api/notifications` | Mark all notifications as read |
| POST | `/api/broadcasts/send` | Send broadcast to all clients |
| POST | `/api/billing/upgrade` | Start subscription checkout (accepts `plan` + `interval: monthly\|annual`) |
| POST | `/api/billing/portal` | Open Stripe billing portal |
| GET | `/api/billing/status` | Check plan status |
| POST | `/api/billing/sync` | Force sync subscription from Stripe |
| GET | `/api/features` | Current plan limits + feature flags for authenticated tenant |
| GET | `/api/wallet` | Wallet balance |
| POST | `/api/wallet/withdraw` | Request withdrawal |
| PATCH | `/api/website` | Save website config |
| GET/POST | `/api/support` | List tickets / create ticket *(requires prioritySupport plan flag)* |
| GET/POST | `/api/support/[id]` | Get ticket with messages / reply *(requires prioritySupport plan flag)* |

### Webhooks
| Method | Route | Events |
|---|---|---|
| POST | `/api/stripe/webhook` | `checkout.session.completed` (booking payments) |
| POST | `/api/billing/webhook` | subscription.updated/deleted, invoice.payment_succeeded/failed |

### Admin
| Method | Route | Description |
|---|---|---|
| GET/PATCH | `/api/admin/plans/[planId]` | View / update plan config (all fields + feature flags) |
| GET | `/api/admin/tenants` | List all businesses |
| POST/DELETE | `/api/admin/tenants/[id]` | Update / delete tenant |
| GET/POST | `/api/admin/withdrawals/[id]` | List / process withdrawals |
| POST | `/api/admin/make-admin` | Grant admin role |
| GET | `/api/admin/support` | List all support tickets |
| GET/POST | `/api/admin/support/[id]` | View ticket / reply + update status |

---

## 18. Third-Party Integrations

### Stripe
- Subscription billing (Starter/Professional/Business plans) — monthly and annual intervals
- Per-appointment prepaid payments via Stripe Checkout
- Two webhook endpoints required (see §21)

### Resend
- Transactional email: verification, booking confirmation (+ .ics), reminders
- Setup: create API key, verify sender domain, set `EMAIL_FROM`

### Meta WhatsApp Business Cloud API
- WhatsApp booking confirmations and reminders
- Setup: Meta Developer app → WhatsApp product → Phone Number ID + System User token

### Vercel Blob
- Tenant-uploaded website images (hero, about sections)
- Path: `website/{businessId}/{timestamp}.{ext}` · Max 5 MB
- Auto-provisioned via Vercel dashboard → Storage → Blob

### Vercel Analytics
- Page view and event tracking across the entire app
- `<Analytics />` component in `app/layout.tsx`
- Enable in Vercel dashboard → Analytics tab

### Unsplash
- Curated stock photos for website builder Photo Library tab
- Direct CDN URLs, no API key required

### Neon (PostgreSQL)
- Serverless PostgreSQL; use pooler endpoint for Vercel deployments
- Auto-suspends on inactivity (minor cold-start delay on first request)

---

## 19. Environment Variables

```bash
# Database
DATABASE_URL="postgresql://..."

# Auth
NEXTAUTH_SECRET="random-32+-char-secret"
NEXTAUTH_URL="https://calvy.io"

# App
NEXT_PUBLIC_APP_URL="https://calvy.io"
NEXT_PUBLIC_ROOT_DOMAIN="calvy.io"          # Used for subdomain URL construction

# Stripe — Billing (Monthly Subscriptions)
STRIPE_SECRET_KEY="sk_live_..."
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY="pk_live_..."
STRIPE_BILLING_WEBHOOK_SECRET="whsec_..."
STRIPE_PRICE_STARTER="price_..."
STRIPE_PRICE_PROFESSIONAL="price_..."
STRIPE_PRICE_BUSINESS="price_..."

# Stripe — Billing (Annual Subscriptions) — optional, falls back to monthly if not set
STRIPE_PRICE_STARTER_ANNUAL="price_..."
STRIPE_PRICE_PROFESSIONAL_ANNUAL="price_..."
STRIPE_PRICE_BUSINESS_ANNUAL="price_..."

# Stripe — Booking Payments (Prepaid)
STRIPE_WEBHOOK_SECRET="whsec_..."

# Email (Resend)
RESEND_API_KEY="re_..."
EMAIL_FROM="Calvy <noreply@calvy.io>"

# WhatsApp (Meta Cloud API)
WHATSAPP_PHONE_NUMBER_ID="..."
WHATSAPP_ACCESS_TOKEN="..."

# Web Push (VAPID)
NEXT_PUBLIC_VAPID_PUBLIC_KEY="..."
VAPID_PRIVATE_KEY="..."
VAPID_SUBJECT="mailto:support@calvy.io"

# File Storage (Vercel Blob)
BLOB_READ_WRITE_TOKEN="..."

# Admin
SUPER_ADMIN_EMAIL="admin@calvy.io"
ADMIN_SETUP_SECRET="..."
```

---

## 20. Development Guide

### Setup
```bash
git clone <repo> && cd calvy
npm install
cp .env.local.example .env.local   # fill in variables
npx prisma db push                 # sync schema to DB
npm run dev                        # http://localhost:3000
```

### Database Commands
```bash
npx prisma db push      # push schema (no migration file)
npx prisma generate     # regenerate Prisma client
npx prisma studio       # visual explorer at localhost:5555
```

### One-time Scripts
```bash
# Strip random suffixes from existing slugs (run once after deploying slug fix)
npx dotenv-cli -e .env.local -- npx tsx scripts/update-slugs.ts
```

### Key Patterns
- **Server components** fetch directly with Prisma; **client components** use `fetch()` to API routes
- All API routes have `export const dynamic = "force-dynamic"` (required for Vercel)
- **Feature gating**: call `getBusinessFeatures(businessId)` in server pages; render `<UpgradeGate>` if flag is false; also check flag in API routes and return 403
- **Multi-service appointments**: dashboard sends `serviceIds: string[]`; API stores first service as FK, encodes extras in `notes` as `__services__:Name2|Name3`
- **Group bookings**: `capacity > 1` on a service enables group slot logic in `/api/availability`; only visible in UI when `groupBooking` plan flag is true
- **Revenue**: only `paymentStatus === "paid"` counts — never include unpaid/pending/refunded
- **Soft-delete**: services with appointments get `isActive = false` (not deleted)
- **Prepaid lock**: switching to prepaid mode requires bank details saved first AND `stripePayments` plan flag (enforced in API and UI)
- **Annual billing**: `getStripePriceId(plan, "annual")` resolves `STRIPE_PRICE_*_ANNUAL`; falls back to monthly if not set
- **Notifications**: `sendPushToBusiness()` always creates a DB `Notification` record; browser push is a bonus layer
- **Support tickets**: fully gated — page redirects to UpgradeGate, API routes return 403, if `prioritySupport` is false

---

## 21. Deployment

### Vercel Setup
1. Push to GitHub
2. Import project in Vercel
3. Add all environment variables (including optional `STRIPE_PRICE_*_ANNUAL` for annual billing)
4. In Vercel → Domains: add `calvy.io` and `*.calvy.io` (wildcard)
5. Point DNS to Vercel nameservers (`ns1.vercel-dns.com`, `ns2.vercel-dns.com`)
6. Deploy

**Critical:** `build` script = `"prisma generate && next build"` — do not change.

**Prisma binary targets** (for Linux Vercel + macOS local):
```
binaryTargets = ["native", "rhel-openssl-1.0.x", "debian-openssl-3.0.x"]
```

### Stripe Webhooks
Register two endpoints in Stripe Dashboard:

| Endpoint | Events |
|---|---|
| `https://calvy.io/api/stripe/webhook` | `checkout.session.completed` |
| `https://calvy.io/api/billing/webhook` | `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_succeeded`, `invoice.payment_failed` |

---

## 22. Roadmap & Future Goals

### High Priority
- [ ] **Email reminders cron** — Daily task for 24hr reminder emails/WhatsApp
- [ ] **Appointment rescheduling** — Let clients or tenants reschedule
- [ ] **QR code for booking page** — Generate/download QR linking to `/book-now`
- [ ] **Block Time** — Block off unavailable slots in calendar
- [ ] **Rate limiting** — Public booking API spam protection

### Growth Features
- [ ] **Google Calendar sync** — Two-way sync
- [ ] **Intake forms** — Custom questions per service in booking flow
- [ ] **Waitlist** — Join queue when all slots are full
- [ ] **Recurring appointments** — Weekly / fortnightly / monthly repeat
- [ ] **Coupon / discount codes** — Percentage or fixed discount at checkout
- [ ] **Gift cards** — Purchasable and redeemable at booking

### Revenue & Monetisation
- [ ] **Stripe Connect** — Direct deposit to business bank (no manual withdrawal)
- [ ] **Commission model** — Platform takes X% per transaction
- [ ] **Referral program** — Tenants earn credit for referrals
- [ ] **Marketplace listing** — Public directory of all Calvy businesses

### Tenant Experience
- [ ] **Mobile app** (React Native) — Tenant dashboard on iOS/Android
- [ ] **Custom domain** — Point `book.yourbusiness.com` to the booking page
- [ ] **White-label mode** — Remove Calvy branding (Enterprise)
- [ ] **Multi-location** — One account, multiple locations
- [ ] **Team roles** — Staff-level login with limited dashboard access
- [ ] **Client portal** — Clients view their own booking history
- [ ] **Reviews / ratings** — Post-appointment rating request

### Technical
- [ ] **Full-text search** — Postgres FTS for client/appointment search
- [ ] **Audit log** — Track admin actions for compliance
- [ ] **GDPR tools** — Data export and deletion for client records
- [ ] **Automated tests** — E2E tests for booking flow and billing

---

## Appendix: Business Type Keywords

`salon` · `hair` · `spa` · `beauty` · `fitness` · `gym` · `medical` · `clinic` · `dental` · `health` · `restaurant` · `consulting` · `legal` · `education` · `general`

Any value not in this list falls back to "general" (modern office imagery).

---

*This document reflects Calvy v1.3 (May 2026). Update whenever new features are shipped.*
