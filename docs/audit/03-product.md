# 03 — Product audit

Audited 2026-10-15 on `audit/phase-1`. Lens: **salons, clinics, spas, coaches and trainers in India, running the business from a phone.** Sources: the code, `Documentation.md`, `README.md`, the marketing pages and help articles, the screenshots in `docs/audit/screenshots/`, and the findings in `01-frontend-ux.md` and `02-backend.md`.

How to read "working": I verified by reading the code and by viewing the demo app in a browser (screenshots, DOM checks). I did **not** run end-to-end booking tests with real email/WhatsApp/payment providers, so "working" means "implemented and visible", not "proven in production". Payments are out of scope (deferred); where a payment fact matters to the product story it is noted as such.

---

## Summary

**What Calvy is today:** a polished, single-location, single-calendar booking page plus owner dashboard. It is a good fit for a *solo practitioner who works one appointment at a time* (a coach, a freelance trainer, a solo therapist). It is **not yet a fit for a salon, spa or clinic with several staff**, which is the larger part of the target market, because availability and conflicts are business-wide, staff schedules are ignored, and there is no time off, no client self-service and no WhatsApp-template messaging.

**Biggest gaps against the India/phone-first brief**
1. Multi-staff scheduling does not work (one booking per slot for the whole business).
2. WhatsApp, the channel Indian clients actually use, is built with free-text messages that Meta will not deliver to new contacts.
3. Pricing, currency and copy are US-first ($1/$2/$6, English only, Stripe/USD wording), and Calvy's own subscription is billed in USD.
4. The owner cannot give staff logins; clients cannot cancel or reschedule themselves; no holidays or time off.
5. Social proof on the homepage is fabricated, which is a launch-blocking trust and legal issue.

**Verdict:** the product skeleton, the booking UX and the dashboard are strong enough to build on. A credible v2 launch for solo practitioners is a few weeks of focused work (section 4). Launching for multi-staff salons and clinics needs the scheduling engine reworked first.

---

## 1. (a) Promised but missing or half-built

"Promised" = stated on the marketing site, pricing page, README/`Documentation.md`, or help articles.

| # | Promise | Where promised | Reality | Sev |
|---|---|---|---|---|
| A1 | "Choose your provider" and per-staff working hours | Booking flow step 2, `Documentation.md` 4.1 Staff, help "Adding staff and working hours" | Staff is stored on the appointment but ignored by availability and conflict checks; staff working hours are never read; staff↔service links not enforced (`02-backend.md` section 2) | Critical |
| A2 | "Real-time slot availability", no double bookings | `Documentation.md` 2, booking UI ("Taken" badge) | Advisory only; the POST re-checks but without a transaction or lock; races possible; the slot is not held during prepaid checkout | Critical |
| A3 | WhatsApp confirmations and reminders | Pricing (Professional+), Features, help article | Free-text messages only, which Meta will not deliver to a client who has not messaged the business within 24h; one shared sender number; Indian 10-digit numbers are not given a country code (`lib/whatsapp.ts`) | Critical |
| A4 | "Email reminders (24h before)" | Pricing page, every paid plan | A single daily cron at 06:00 UTC reminds "tomorrow (UTC)"; actual lead time is 18–42 hours, wrong around IST midnight; failures are marked as sent; free plan is not excluded | High |
| A5 | "Cut no-shows by up to 80% with automatic SMS and email reminders" | `components/landing/Features.tsx:14` | No SMS exists at all; 80% is unsubstantiated | High |
| A6 | "Trusted by 12,000+ businesses", "3.2M appointments", "4.9 from 2,400+ reviews", testimonials "Verified on Google/Trustpilot/Capterra" | Hero, stats bar, testimonials | Fabricated (see `01-frontend-ux.md` section 3) | Critical |
| A7 | "Free forever" **and** "14-day free trial" | Hero, pricing, signup | Three different offers; behaviour: new businesses start on `plan: "free"` with 30 bookings/month, no trial is applied at signup (`lib/createBusiness.ts`) | High |
| A8 | Annual billing "−20%" badge | Pricing toggle | Actual annual prices are $1/$2/$6 vs monthly $2/$5/$10 (`lib/plans.ts:134-151`): 50–60% off; the badge and the `Documentation.md` table ($4, $8 annual) disagree with the code | Medium |
| A9 | "Stripe-powered payments, instant payouts" | `Features.tsx:21`, README, `Documentation.md` | Live integration is Razorpay; "instant" is not guaranteed (deferred) | High |
| A10 | Pricing in dollars; "Why is my subscription billed in USD?" help article | Pricing, `lib/helpArticles.ts` | Calvy's own subscription is USD-denominated even for Indian tenants; no INR plans, no GST invoice (deferred, flagged) | High |
| A11 | Pages linked from the footer: Integrations, Changelog, About, Careers | Footer | Do not exist (`href="#"`) | High |
| A12 | Plan limits "Monthly bookings 30 / 100" | Pricing, `Documentation.md` 8 | Enforced on the dashboard's manual-appointment route but **not** on public bookings, which is where bookings come from (`02-backend.md` #6) | High |
| A13 | "Priority support", "Remove Calvy branding", "Custom branding" flags | Plans | Flags exist; I did not trace each to its UI, so treat as unverified | Low |
| A14 | "Broadcasts: unlimited client broadcasts" | Business plan | Per-month limit field exists in plans but is not enforced in `broadcasts/send`; no unsubscribe/consent; WhatsApp broadcasts are free text (A3) | High |
| A15 | "Chatbot booking widget" | Pricing (Professional+) | Exists (`components/chatbot/ChatWidget.tsx`) and shares the booking API, so it inherits A1/A2; it is a scripted flow, not an AI chatbot, which may mis-set expectations | Medium |
| A16 | "Mobile-friendly" | Throughout | Booking flow and dashboard are, but: homepage hero is clipped at 375px, the calendar week view is unreadable at 375px, the Settings tab strip overflows (`01-frontend-ux.md`) | High |
| A17 | "Setup in 60 seconds" | Hero, CTA | Realistic path is 10–15 minutes (verify email, re-login, add services/staff/hours); no first-run checklist | Medium |
| A18 | "Reminders to clients" in the owner's language | Implied | English only | Medium |
| A19 | "Analytics dashboard", "CSV export" | Plans | Present (pages exist and render); numbers include `$` formatting for non-USD businesses unless currency is set (`lib/currency.ts`) | Low |

---

## 2. (b) Fully working (as far as code and screenshots show)

Each item is implemented end to end in the app and rendered in the audit screenshots. Items depending on a third-party key (email, WhatsApp, push, blob) are marked †: the code path is real but needs configuration to work.

- **Sign-up and sign-in:** email/password with email verification †, Google/Facebook sign-in when configured, region/currency selection (including **INR**, which is the code's default currency in `lib/currency.ts`), rate-limited, bcrypt-hashed passwords.
- **Instant workspace:** business, starter service ("Consultation"), owner staff entry and default working hours are created at signup (`lib/createBusiness.ts`); a public site and booking page exist immediately at `{slug}.calvy.io` and `/b/{slug}`.
- **Public booking flow:** service selection (multi-service), provider choice (UI), calendar with disabled past days, slot grid with "Taken" state, details form, confirmation; group bookings via service `capacity` (single start time); capacity-aware conflict check, unit tested. Works well on a 375px phone (`booking-flow/*`).
- **Owner dashboard:** Home KPIs, Appointments (status changes, cancel, reschedule with notification emails †), Calendar (week/day), Clients (with detail page), Services (soft delete, group capacity), Staff (add/edit/colour), Expenses, Analytics, Billing views, Support tickets, Notifications panel (in-app, polled) and web push †.
- **Manual appointment creation** by the owner with plan-limit enforcement.
- **Tenant website builder:** hero, about, services, team, SEO fields; templates by business type; custom images via Vercel Blob †.
- **Emails †:** booking confirmation with `.ics` calendar invite, reminder, cancellation, reschedule, invoice, verification, lead acknowledgement; every send is logged in `EmailLog`.
- **Multi-tenancy:** subdomain rewrite, tenant-scoped queries, per-tenant currency.
- **Plan gating from the database:** limits/flags editable at `/admin/plans`, enforced in pages and dashboard APIs.
- **Admin tooling:** tenants, plans, revenue, notifications, blog CMS, support inbox, CRM kanban; tested with the seeded admin account.
- **Marketing/SEO plumbing:** blog (DB, ISR), 24 help articles, per-page canonicals, IndexNow pings, legal pages.
- **PWA basics:** `manifest.json`, service worker, offline page, install prompt component; the dashboard has a bottom-nav designed for phones.
- **Quality gates:** typecheck and lint clean, 24 unit tests pass.

---

## 3. (c) Important missing features for the target users

Ranked within each group by how often the target businesses will hit the gap. Evidence for "missing": no route, model, page or UI for it in the repo.

### Scheduling engine (blockers for salons, spas and clinics)
| # | Missing | Why it matters here | Sev |
|---|---|---|---|
| C1 | **Per-staff availability and conflicts** (staff hours, staff↔service, parallel bookings for different staff) | A salon with 3 stylists must take 3 bookings at 11:00; today it takes 1 | Critical |
| C2 | **Staff time off, holidays, business closures, lunch breaks, blocked dates** | Festival closures (Diwali, Eid), weekly offs, doctors on leave are routine in India; there is no way to block a date | Critical |
| C3 | **Business timezone** | Needed for correct slots, reminders and emails; also for diaspora/other-region clients | Critical |
| C4 | **Minimum notice, maximum advance window, buffer/cleanup time** per service | Prevents 5-minute-notice bookings and back-to-back chaos | High |
| C5 | **Resources** (chair, room, bed, machine) | Spas and clinics are constrained by rooms, not only people | Medium |
| C6 | **Recurring appointments / packages / memberships** | Trainers, coaches, physio and spa packages ("10 sessions") are the norm | High |
| C7 | **Classes with attendance** (group sessions at a fixed schedule, waitlist) | Yoga/fitness; group booking exists only as "same start time capacity" | Medium |
| C8 | **Walk-ins and phone-only clients** | Many Indian clients book by phone/WhatsApp and have no email; `Client.email` is required and the booking form demands it | High |

### Client self-service and communication
| # | Missing | Why it matters here | Sev |
|---|---|---|---|
| C9 | **Client cancel / reschedule via a link** (in email and WhatsApp) | No-shows and "can I move it" messages are the owner's biggest time sink; today only the owner can cancel/reschedule; emails contain no manage link | High |
| C10 | **WhatsApp template messages** (confirmation, reminder, cancel, reschedule) with the business's own number, plus a **"share my booking link on WhatsApp" button and QR code** | WhatsApp is the primary channel; the owner already runs the business from WhatsApp | Critical |
| C11 | **Reminder cadence** (e.g. 24h and 2h before, same-day bookings) | Daily cron cannot do it (`02-backend.md` section 7) | High |
| C12 | **Consent / opt-in and opt-out** for messages; DPDP (India's data-protection law) basics: privacy notice at booking, data export/delete | Required for marketing messages and for health-adjacent data (clinics) | High |
| C13 | **SMS fallback** (DLT-registered templates in India) | Promised on the site; also needed where WhatsApp is not available | Medium |

### Localisation and money (India)
| # | Missing | Why it matters here | Sev |
|---|---|---|---|
| C14 | **INR pricing for Calvy plans** (e.g. ₹99/₹299/₹599), shown on the site; GST invoices for subscriptions | Today $1/$2/$6 USD; a ₹ price is a purchase signal and a legal requirement for GST-registered sellers | High |
| C15 | **UPI-first collection and tenant-facing GST invoices** for services (deferred with payments, but a product requirement) | Indian clients pay by UPI, not cards | High (deferred) |
| C16 | **Hindi and regional-language UI** (at minimum the public booking page and client messages; then dashboard) | Many salon/clinic owners and most of their clients are more comfortable in Hindi, Tamil, Telugu, Marathi, Bengali, Gujarati, etc. English-only; no i18n library | High |
| C17 | **India defaults:** `+91` default, 10-digit phone validation, INR default at the database level (`Business.currency` defaults to `USD` while the code constant is `INR`), IST default timezone, ₹ and lakh formatting | Removes friction and bugs | High |
| C18 | **Indian business types and sample services** (salon, barber, spa, dental, physio, yoga, tutor, astrologer…) seeded at signup instead of a generic "Consultation" at $50 | Makes the empty dashboard useful | Medium |

### Team and operations
| # | Missing | Why it matters here | Sev |
|---|---|---|---|
| C19 | **Staff logins and roles** (owner, manager, receptionist, stylist who sees only their calendar) | One owner per business today (`Business.ownerId @unique`); staff "role" is a label. Receptionists book, stylists check their day | High |
| C20 | **Google Calendar / iCal sync** (two-way for owner and staff) | Prevents double-booking against personal calendars; today only a one-off `.ics` is sent to the client | Medium |
| C21 | **Staff notifications** (new booking by WhatsApp/push per staff) | Push exists for the owner only | Medium |
| C22 | **Multiple locations / branches** | Common for salon chains and clinics | Medium |
| C23 | **Client history with notes/forms** (intake forms, consent, treatment notes, before/after) | Clinics and spas need it; there is a single notes field | Medium |
| C24 | **Reviews / feedback after the visit** with a Google review link | Builds exactly the social proof the homepage currently fakes | Medium |
| C25 | **Waitlist and "notify me" for full days** | Fills cancellations | Low |
| C26 | **Reports owners can use on a phone** (daily summary by WhatsApp/email, "today's earnings") | Owners check the number, not a dashboard | Medium |
| C27 | **Data export/backup and account deletion** | Trust and compliance | Medium |

### Mobile and performance (phone-first)
| # | Missing | Sev |
|---|---|---|
| C28 | Installable owner app with reliable push on Android (PWA exists; verify install flow, push permission UX, offline read-only view) | Medium |
| C29 | Page weight on low-end phones/slow networks: the homepage is ~18,000px tall on mobile with 8 lead forms and large mockups; booking pages load a Google font pair plus a hero image. Needs a Lighthouse pass on a throttled device (not measured in this audit). | Medium |
| C30 | Tap targets and text sizes (see `01-frontend-ux.md`): dozens of controls under 44px, 10px text | High |

---

## 4. (d) Minimum needed to launch v2

Two launch tiers, because the product only fits some users today.

### Tier 1 — launch for solo practitioners (coaches, trainers, therapists, freelancers)
Must be done; everything else can follow.

**Trust and legal**
1. Remove or replace all fabricated metrics, ratings and testimonials; delete "Verified on…" badges; fix the offer (one free plan, one trial statement); fix © year, dead links, Stripe/Razorpay wording. (`01`: A6, A7, A9, A11.)
2. Correct pricing display: INR plans (or at least a decision on currency), a truthful annual discount; legal pages that match the actual flows (privacy policy mentions data processors, refund policy matches billing). Payments themselves stay deferred.

**Correctness**
3. Fix the import-time crashes and the `/booking/success` 500 (`02` #10).
4. Add a business **timezone** (default `Asia/Kolkata`), store real UTC instants, format dates in that zone (`02` #3).
5. Make booking **safe**: transaction + lock or unique constraint against double booking (`02` #1), enforce plan limits and active-plan checks on public bookings (`02` #6), bound `slotInterval`/validate `availabilityJson` (`02` #5), reject past reschedules.
6. Cron: fail closed without `CRON_SECRET`, fix the reminder window and failure handling (`02` section 7).
7. Add **password reset** and **resend verification**; lowercase emails everywhere (`02` #7, #8).
8. Add `error.tsx`, `global-error.tsx`, `not-found.tsx`; branded 404/500.
9. Update `next` and `next-auth`, run `npm audit fix`; move from `db push` to `prisma migrate deploy` with a baseline migration (`02` #11, #12).
10. Rotate the credentials in `.claude/settings.json` and add an `.env.example` plus env validation at boot.

**Product**
11. WhatsApp that works: either approved templates through the Cloud API or, as a stop-gap, `wa.me` click-to-chat links with a pre-filled message the owner taps to send (works today with no Meta approval). Default `+91` normalisation.
12. Client manage link (cancel/reschedule) in the confirmation email and message.
13. Date blocking: simple holidays/closed days and time off for the owner (`C2` minimal).
14. First-run checklist on the dashboard (add service → set hours → share link/QR), India-flavoured sample services, `+91`/INR/IST defaults (`C17`, `C18`).
15. Mobile fixes: hero at 375px, calendar week view, tap targets ≥ 44px, labelled inputs, per-page `<title>`s.

### Tier 2 — launch for salons, spas and clinics (needs Tier 1 plus)
- Per-staff availability, per-staff working hours, service↔staff enforcement, parallel bookings (`C1`) — **this is the gate**; do not market to salons before it ships.
- Staff logins/roles (`C19`), resources (`C5`), buffers and notice rules (`C4`), packages (`C6`), walk-ins/phone-only clients (`C8`), consent and privacy basics (`C12`), Hindi booking page (`C16`).

### Not needed for launch (explicitly deferred)
Payments, wallet, withdrawals and billing flows (deferred per brief), Google Calendar sync, multi-location, waitlist, reviews, classes/attendance, SMS/DLT, further regional languages.

---

## 5. Market fit by segment

| Segment | Fit today | Blocking gaps | After Tier 1 | After Tier 2 |
|---|---|---|---|---|
| Coach / consultant / tutor | **Good** | WhatsApp, reminders, client cancel link | Ready | Ready |
| Personal trainer / yoga (1-to-1) | Good | Packages/recurring, classes | Usable | Better with C6/C7 |
| Solo salon / barber / therapist | Fair | Time off, WhatsApp, walk-ins | Usable | Ready |
| Salon / spa with 2+ staff | **Poor** | Per-staff scheduling, staff logins, resources | Not ready | Ready |
| Clinic / dental / physio | **Poor** | Per-doctor schedules, forms/consent, privacy basics, Hindi | Not ready | Partially |

---

## 6. Competitive context (for positioning, not a feature list)

Indian owners today compare against: a WhatsApp chat plus a notebook; local apps with Hindi UI and UPI (e.g. Vagaro-style salon tools adapted for India); and free Google Business Profile booking. Calvy's differentiators are real and should be the message: instant subdomain + website + booking in one product, a free plan, a good phone UX. Its weakness is that it currently *looks like a US SaaS* (USD, English, Western testimonials, Stripe wording) and *behaves like a single-calendar tool*.

---

## 7. Open product questions for the owner

1. Which segment do you launch to first: solo practitioners (Tier 1) or salons/clinics (Tier 2)? The timeline differs by weeks.
2. WhatsApp path: apply for the Cloud API with templates (approval takes days, per-conversation cost passes to tenants) or start with click-to-chat links?
3. Currency of Calvy's own plans: INR-only for India launch, or multi-currency with INR as default?
4. Is a staff login required at launch, or can staff remain owner-managed?
5. Which languages after English: Hindi first?
