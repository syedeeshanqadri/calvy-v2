# Calvy v2 — Roadmap (updated Oct 30 2026)

Rule: keep ALL features open during the build (PLAN_ENFORCEMENT off). Plan restrictions ON before launch.

| # | Work | Notes |
|---|---|---|
| 1 | Housekeeping | Ship fix/live-email + status doc, delete merged branches, fix local DB connection, protect Vercel test server |
| 2 | Playwright fixes + smoke tests in CI | |
| 3 | Notifications system (email now, WhatsApp later) | Outbox with retries, templates per pack, per-business preferences. Business: account created, business live, booking created, changed/rescheduled, cancelled, paid, any status change, daily summary (optional). Customer: booking confirmed, rescheduled, cancelled, status changes, payment receipt, reminders, account/password emails, review request after visit. Faster reminder scheduler |
| 4 | Website editor sections | Hero switch, gallery, offer banner, team photos, service images, FAQ |
| 5 | Reviews | Google review link in settings (exists) + review-link helper from Place ID; post-visit "Review us on Google" email (WhatsApp later). Posting reviews to Google on a user's behalf is NOT possible/allowed — button to Google only |
| 6 | Identity & roles | Owner/Manager (scoped)/Receptionist/Staff, invites, business switcher; finish Google sign-up wizard; phone OTP |
| 7 | Admin panel (super user) | All businesses, view-as (audited), manual create/edit/suspend, plans, operations, payments/credit overview |
| 8 | Follow-ups, clinic records, credit at booking | Per decisions doc |
| 9 | WhatsApp alerts | Every email alert also on WhatsApp; OpenWA per business (scan QR in settings), transactional only, email fallback; Meta Cloud API option later |
| 10 | Business mobile app | PWA first (installable, push alerts, full dashboard), then Play Store via TWA wrapper; Flutter only if PWA proves insufficient |
| 11 | Pre-launch | Security pass, production env (Asia Neon, R2, Upstash, Sentry, fresh secrets, domain), honest landing page, plan restrictions ON |

## Parked (build later, owner's decision)
- Pay-links, chunk 11 (payment settings), chunk 12 (Cashfree split), chunk 13 (subscriptions on Cashfree, remove Razorpay). FULL_ONLINE unreachable.
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
