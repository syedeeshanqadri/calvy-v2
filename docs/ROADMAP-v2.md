# Calvy v2 — Roadmap (updated Nov 3 2026; WhatsApp moved after Cashfree subscriptions)

Rule: keep ALL features open during the build (PLAN_ENFORCEMENT off). Plan restrictions ON before launch.

## Next (in this order)

| # | Work | Notes |
|---|---|---|
| 1 | Google sign-up + onboarding wizard | Shipped (PR #65): passwordless sign-up (name, email, phone required in India, business type), emailed link verifies and sets the password, 7-step resumable wizard, Google sign-in without silent linking |
| 2 | Dependency maintenance |  |
| 3 | Customer accounts | Shipped on top of #42: Google sign-in for customers (verified email, no silent linking, Link Google on Profile), Book again with the service chosen, delete account. Using credit at booking and the follow-up booking belong to items 4 and 5 |
| 4 | Follow-ups | Built (owner decisions Nov 4): business sets the window in Settings → Booking (days, 0 = off, default off). After a COMPLETED appointment the customer signs in to My bookings and books one free follow-up with the same doctor, same service, same person, within the window. Different doctor, later date or another person = a normal paid booking. One follow-up per appointment (DB-unique). A cancelled follow-up is not restored |
| 5 | Clinic records + credit at booking | Built: clinic businesses get plain Consultation (Done/Pending/Missed/Cancelled) and Fee (Paid online/Paid at clinic/Not paid/Returned) columns with one-click controls, built on the existing status and payment status. A fee returned by hand removes the matching wallet credit once. Credit at booking: My wallet → "Book with this credit" (signed ticket, verified customer only); credit reduces the online charge (platform fee and share shrink proportionally; confirm the fee policy at the Cashfree split chunk). Runs only while online payments are on |
| 6 | Payment settings | Moved out of Parked (was chunk 11) |
| 7 | Cashfree Easy Split | Moved out of Parked (was chunk 12) |
| 8 | Plan subscriptions on Cashfree (remove Razorpay) | Moved out of Parked (was chunk 13) |
| 9 | WhatsApp integration settings | Each business uses its OWN credentials: Meta Cloud API or third-party/OpenWA. Stored encrypted, owner-only, mid+ plans |
| 10 | WhatsApp alerts | Every email alert also on WhatsApp, transactional only, email fallback |
| 11 | Admin panel (super user) | All businesses, view-as (audited), manual create/edit/suspend, plans, operations, payments/credit overview |
| 12 | Business mobile app (businesses only) | PWA first (installable, push alerts, full dashboard), then Play Store via TWA wrapper; Flutter only if PWA proves insufficient |
| 13 | Pre-launch | Security pass, production env (Asia Neon, R2, Upstash, Sentry, fresh secrets, domain), honest landing page, plan restrictions ON |

## Done
- Housekeeping; Playwright fixes + smoke tests in CI; Notifications system (outbox, templates per pack, preferences); Website editor sections; Reviews (Google review link + Place ID helper, post-visit email); Identity & roles (Owner/member team roles, PR #64).

## Parked (build later, owner's decision)
- Pay-links. FULL_ONLINE unreachable.
- Calvy-wide wallet (India only): customers pay at booking, can top up, cancellation/missed amounts stay in wallet (no refunds), wallet usable across all Calvy businesses. Owner has taken legal advice and has approval for this model. Parked for later; current per-business credit stays as is until then.

## Decisions: Identity, sign-up and team (Oct 2026)
- No phone OTP anywhere.
- Primary account = Owner. Owner-only (never tickable): billing/plan, team management, payment settings, WhatsApp credentials, delete business.
- Owner → Settings → Team → "Add member": name, email, free-text role name (e.g. Receptionist, Doctor), tick permissions, optional link to a bookable staff record. Member gets an email invite to set a password, then logs in and sees ONLY ticked options.
- Limits in `lib/plans.ts`: Free = 0 members (owner only), Mid = 3, Top = 10. Enforced via `applyEnforcement` only (PLAN_ENFORCEMENT is OFF now). Team logins are separate from bookable staff (no cap on bookable staff here).
- Permissions (checkbox list, grouped): Appointments view all / own only; create & edit; cancel; Token queue control; Calendar & schedules; Customers view / edit / export CSV; Services; Website editor; Reviews settings; Notifications settings; Reports. Optional presets (Receptionist, Practitioner) that only pre-tick boxes.
- Security: one server helper (`requirePermission()`) on every page, server action and API route; tenant scoping on every query; permissions read from DB per request so revoking is immediate; removing a member kills their sessions; invite token random, stored hashed, single use, 48h expiry, resend/revoke; members cannot change permissions or see owner-only areas; the owner cannot be removed or downgraded; audit log for member added/removed/permissions changed; one login = one business.

## Decisions: WhatsApp
- Not included in the pasted brief for this chunk; to be added when the owner sends it.

Open decisions: OTP provider (recommend WhatsApp auth templates via Meta Cloud API; SMS needs DLT; never OpenWA for OTP), roles (4 roles recommended), Google OAuth app setup.
