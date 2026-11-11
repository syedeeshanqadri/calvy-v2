# Calvy v2 — Roadmap (updated Nov 3 2026; WhatsApp moved after Cashfree subscriptions)

Rule: keep ALL features open during the build (PLAN_ENFORCEMENT off). Plan restrictions ON before launch.

## Next (in this order)

| # | Work | Notes |
|---|---|---|
| 1 | Admin panel (super user) | Super admin = DB flag set only by script (never UI/API); TOTP 2FA, re-auth for sensitive actions, 30 min idle; businesses list/detail, view-as (read-only by default, reason, 30 min), actions with reason + audit log, suspend, plan override, verified-customer booking limits. Plan in review |
| 2 | Business mobile app (businesses only) | PWA built (docs/business-app.md): installable, safe service worker, per-user web push with preferences and permissions, phone-first Today, TWA prep (docs/twa-playstore.md; real Android build at Pre-launch). Then Play Store via TWA wrapper; PWA first (installable, push alerts, full dashboard), then Play Store via TWA wrapper; Flutter only if PWA proves insufficient |
| 3 | Cashfree Easy Split | Moved out of Parked (was chunk 12). Unlocks "Full online payment" in Settings → Online payments |
| 4 | Plan subscriptions on Cashfree (remove Razorpay) | Moved out of Parked (was chunk 13) |
| 5 | WhatsApp integration settings | Each business uses its OWN credentials: Meta Cloud API or third-party/OpenWA. Stored encrypted, owner-only, mid+ plans |
| 6 | WhatsApp alerts | Every email alert also on WhatsApp, transactional only, email fallback |
| 7 | Pre-launch | **Includes the production payments go-live checklist (docs/PLAN.md, Pre-launch security checklist)** and the Low payment items: public payment-status route keyed by order id, webhook timestamp freshness, **GST receipt on the customer's booking page** (email-only today). Security pass, production env (Asia Neon, R2, Upstash, Sentry, fresh secrets, domain), honest landing page, plan restrictions ON. **Also: verify phone push end to end on the production domain (VAPID vars in Production env, iPhone installed app + Android)** |

## Done
- Housekeeping; Playwright fixes + smoke tests in CI; Notifications system; Website editor sections; Reviews; Team roles (#64).
- Google sign-up + onboarding wizard (#65); dependency maintenance (#67); customer accounts (#68); follow-ups (#69); clinic records + credit at booking (#70); payment settings + sandbox-ready Cashfree payments (#71).

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
