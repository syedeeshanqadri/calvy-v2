# Calvy v2 — Roadmap (updated Nov 3 2026; WhatsApp moved after Cashfree subscriptions)

Rule: keep ALL features open during the build (PLAN_ENFORCEMENT off). Plan restrictions ON before launch.

## Next (in this order)

| # | Work | Notes |
|---|---|---|
| 1 | Admin panel (super user) | Super admin = DB flag set only by script (never UI/API); TOTP 2FA, re-auth for sensitive actions, 30 min idle; businesses list/detail, view-as (read-only by default, reason, 30 min), actions with reason + audit log, suspend, plan override, verified-customer booking limits. Plan in review |
| 2 | Business mobile app (businesses only) | PWA built (docs/business-app.md): installable, safe service worker, per-user web push with preferences and permissions, phone-first Today, TWA prep (docs/twa-playstore.md; real Android build at Pre-launch). Then Play Store via TWA wrapper; PWA first (installable, push alerts, full dashboard), then Play Store via TWA wrapper; Flutter only if PWA proves insufficient |
| 3 | ~~Cashfree Easy Split~~ | **Superseded by step 24 (Nov 2026): bring-your-own gateways.** No Easy Split, no platform split of service money. |
| 3b | Step 24: BYO gateways, waiver, Razorpay removal | **Built** (branch `step-24/byo-gateways`): see "Decisions: Payments (Nov 2026)". |
| 4 | Step 25: Plan subscriptions on Cashfree Subscriptions + customer rewards | **25a (subscriptions) built on `step-25/subscriptions-rewards`, see `docs/subscriptions-setup.md`; 25b (rewards) next.** Original scope:  (a) Cashfree Subscriptions in sandbox (UPI Autopay + e-mandate/card), upgrade/downgrade/cancel, webhooks, dunning emails. (b) Rewards engine: every 7 completed (attended) bookings across all Calvy businesses make the 8th booking's Rs 10 free, repeating; counted per customer identity (account or verified phone/email); cancelled/not-attended do not count; progress "x of 7" in /account, the confirmation page and emails; a generic offers table. Plan plan separately after step 24 ships. Until then plans change by admin override. |
| 5 | WhatsApp integration settings | Each business connects its OWN WhatsApp Business Account (official Meta Cloud API only; OpenWA/unofficial removed). Business pays Meta. Stored encrypted, owner-only, mid+ plans |
| 6 | WhatsApp alerts | Every email alert also on WhatsApp, transactional only, email fallback |
| 7 | Pre-launch | **Includes the production payments go-live checklist (docs/PLAN.md, Pre-launch security checklist)** and the Low payment items: public payment-status route keyed by order id, webhook timestamp freshness, **GST receipt on the customer's booking page** (email-only today). Security pass, production env (Asia Neon, R2, Upstash, Sentry, fresh secrets, domain), honest landing page, plan restrictions ON. **Also: verify phone push end to end on the production domain (VAPID vars in Production env, iPhone installed app + Android)**. **Parked until the end: (a) work out why the Cashfree MCP is logged into a different account than Calvy's keys (a Calvy Rs 10 order returned 404 in the MCP); (b) international Calvy subscriptions, behind flag `CF_INTL_SUBSCRIPTIONS` (off: the Billing page shows "Coming soon")** |

## Done
- Housekeeping; Playwright fixes + smoke tests in CI; Notifications system; Website editor sections; Reviews; Team roles (#64).
- Google sign-up + onboarding wizard (#65); dependency maintenance (#67); customer accounts (#68); follow-ups (#69); clinic records + credit at booking (#70); payment settings + sandbox-ready Cashfree payments (#71).

## Parked (build later, owner's decision)
- Pay-links. FULL_ONLINE unreachable.
- WhatsApp marketing broadcasts via approved MARKETING templates + explicit marketing consent (the WhatsApp option was removed from Broadcasts in step 17).
- Quiet hours for phone alerts (optional, per user: no alerts between chosen times, e.g. 22:00-07:00, held or dropped). Parked in Step 19 (PWA polish); needs one additive migration on the user's push preferences.
- Calvy-wide wallet (India only): customers pay at booking, can top up, cancellation/missed amounts stay in wallet (no refunds), wallet usable across all Calvy businesses. Owner has taken legal advice and has approval for this model. Parked for later; current per-business credit stays as is until then.

## Decisions: Payments (Nov 2026, step 24; supersedes Easy Split)
- India only. Calvy uses **Cashfree only**; Calvy never touches a business's service money. All Razorpay platform code (billing, Route, linked accounts, wallet, withdrawals, admin Withdrawals page) was removed. Old columns/tables (Razorpay fields, `CustomerCredit`, `WithdrawalRequest`) stay until the pre-launch checklist drops them.
- **Basic plan:** ONLY the Rs 10 confirmation fee, through Calvy's Cashfree (`CASHFREE_*`). The service fee is always at the venue. Business gateways and online service payments are unavailable (`canUseOwnGateway`: plan fee = 0); the Settings → Payments tab shows an upgrade prompt.
- **Mid/Top:** no Rs 10. The business connects its own gateway(s) in Settings → Payments → "Add payment gateway" (owner-only): Razorpay, Cashfree, PhonePe PG. Several allowed, one default, each enabled/disabled, test/live per gateway. Guided setup (links to the provider dashboard), "Save and verify" makes a real lightweight API call (CONNECTED/ERROR with the reason), a copyable per-gateway webhook URL. Provider adapter interface (`lib/payments/provider.ts`) so PayU and others are one file plus one entry in `gatewayMeta.ts`.
- **Payment options** per business and per service override: Pay at venue, Pay online in full, Advance (percentage or fixed amount, rest at venue). Amounts are computed server-side in integer paise (`lib/fees.ts`); without a verified default gateway nothing is charged online.
- **Webhooks:** `/api/payments/webhook/[key]` (random key per gateway), signature verified on the raw body with THAT business's secret, events scoped to that gateway's own payments, idempotent through `WebhookEvent`. The booking is confirmed on a verified payment, with the return-page recheck as before.
- **Refunds:** the owner's "Refund" button calls their gateway's refund API; if that fails, "mark refunded manually". The Rs 10 is never refunded once kept.
- **No money wallet.** A Rs 10-confirmed booking that is cancelled or not attended keeps the Rs 10 and shows "Not attended — confirmation still valid"; the customer can rebook ONCE at that business without paying the Rs 10 (`ConfirmationWaiver`), or use a follow-up if the business enabled them. A business cancelling a booking that used the waiver gives it back.
- **Plan upgrades** are admin plan overrides until step 25 (Cashfree Subscriptions). Dashboard → Billing now only shows the current plan and how to ask support.
- Not verified live: PhonePe and Razorpay adapters were written against their public API docs and tested with mocked responses only; Cashfree (Calvy's own sandbox) was exercised for real (order, UPI collect `testsuccess@gocash`, PAID).

## Decisions: Plan subscriptions (Nov 2026, step 25a)
- India only, Calvy's Cashfree Subscriptions; international shows "Coming soon" (merchant of record later). Prices from `lib/pricing.ts`.
- Upgrade starts now with a prorated credit (paise, rounded up in the customer's favour by at most 1 paisa); the credit is shown at checkout and on the invoice. Downgrade and cancel at the end of the period. One new mandate per start or upgrade.
- Failed payment: 7-day grace, retries on days 2 and 5, three dunning emails (days 0, 3, 6), then Basic with data kept.
- The subscription is the single source of truth for `Business.plan`; an admin override always wins.
- Invoices per Indian FY (`CALVY/2026-27/0001`, never reused). No `CALVY_GSTIN` = plain "Receipt", no GST line, no "Tax invoice" title.
- No plan exceeds the Rs 15,000 no-extra-authentication limit (largest: Business yearly, Rs 8,388).
- Rewards (25b): count attended bookings at ANY Calvy business; the reward (Rs 10 waived) can only be USED on a booking that would charge Rs 10 (Basic India); unused rewards never expire.

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

## Test data to delete before launch (pre-launch checklist)
- All test accounts and demo businesses: the seeded `*.calvy.test` users, `demo@calvy.io`, `meta-reviewer@calvy.io` with the business `meta-review-clinic`, and the other owner test logins and businesses created while testing.
- The Rs 10 end-to-end test booking on `clinic` (General Consultation, 18 Nov 2026 09:00, client `eeshan.aq+rs10e2e@gmail.com`) with its Payment row, plus the customer account created for that email.
- Old Razorpay columns, `CustomerCredit` and `WithdrawalRequest` tables (dropped by the pre-launch migration).
Write the deletion script with a dry run, and run it only after confirming which database it points at.

### Step 25b: loyalty reward (decisions)
- Offer `LOYALTY_EVERY_8TH` (table `Offer`, switch on/off at `/admin/offers`): every 7 attended days, across all Calvy businesses, earns one free Rs 10 confirmation. Rewards never expire.
- Attended = booking marked `completed`. Cancelled, no-show, pending and walk-in never count. Several attended bookings on one business-local day count once. Un-completing a booking does not take a counted day back.
- Identity: the email (customer account), else phone digits. A reward can only be SPENT by a verified customer (own signed link, `?vt=`); progress is counted for everyone.
- A reward only waives a booking that would charge the Rs 10 (Basic, India). The kept-fee rebooking (`ConfirmationWaiver`) goes first, so one booking never spends both. A cancelled booking gives its reward back; a not-attended one keeps it spent.
- Shown on `/account`, the booking success screen (verified only), the confirmation email, and "This booking is free (reward)" at checkout.

### Step 31: Coupons, offers & rewards ladder (decisions, Nov 18)
**Calvy coupons (made in /admin/coupons)**
- Targets: the Rs 10 confirmation fee (Basic, India) and a plan subscription's first payment. A coupon can be limited to businesses or plans.
- Rules: percent or flat, minimum amount, start and end dates, total limit, per-customer limit, first-booking-only. One code per checkout, checked on the server; every use is logged (`CouponRedemption`), every admin change is audited.
- Subscription coupons take money off the FIRST payment only. `Coupon.durationMonths` exists but is unused; recurring discounts come later. The discount is folded into the first charge's credit, so the amount check and the invoice stay consistent.
- Fee side (Basic): a Calvy coupon OR a loyalty reward, never both. A coupon that clears the whole Rs 10 is used and the reward is KEPT. A ready reward beats a partial coupon (the coupon is kept). The kept-fee waiver (`ConfirmationWaiver`) always goes first. A coupon never leaves less than Rs 1 to pay (it clears the fee instead).
- Uses are released when the booking is cancelled or expires, a payment hold lapses, or a plan checkout is abandoned.

**Business coupons and offers (paid plans only, "Offers & discounts")**
- Business coupons discount the business's own service prices; they are funded by the business. Calvy never touches that money.
- Business-funded offers (shown on the website and booking page, applied automatically): every Nth visit % off, happy hours (days and times), and bundle packages (book these services together for % off).
- One business discount per booking: the better of one business coupon and one business offer, never stacked. Calvy coupons and rewards only touch Calvy's Rs 10 (Basic only), so they cannot overlap with business discounts (paid plans have no Rs 10).
- Gated by the plan flag `offers` in the page and in the API.

**Rewards ladder (on the existing engine)**
- Attended-only earning everywhere (a booking marked completed; walk-ins, cancellations and no-shows earn nothing). Tiers count attended DAYS, like the 7-day stamp: Regular at 3, Silver at 10, Gold at 25.
- Silver: a free reschedule (a reschedule keeps the Rs 10 confirmation without charging again). Gold: one extra free Rs 10 per quarter, which expires at quarter end (a perk). Gold waitlist priority is skipped: there is no waitlist feature yet.
- Normal 7-day stamp rewards still never expire.
- Referral: both people get a free Rs 10 after the friend's first ATTENDED visit. Blocked: self-referral, loops, same phone, same device. The referred person must be new (no earlier Calvy booking anywhere, any identity match); a person can be referred once; cap 5 rewarded referrals per month per referrer; referrers with more than 5 attempts a month are flagged in admin for review. No email-domain or name heuristics (false positives).
- Comeback: +1 stamp when a customer attends a visit within 30 days of their previous attended visit.

### Step 25c: gateways by region (decisions)
- India list: Razorpay, Cashfree, PhonePe PG, PayU, CCAvenue, Paytm PG. International list: Stripe, PayPal; Square, Mollie and Adyen later. Filtered by region (currency now, `Business.country` when it exists), in the UI and on the server.
- Own gateways on paid plans only, in both regions. India Basic = the Rs 10 to Calvy; International Free = pay at the venue; international never pays the Rs 10.
- Same three pay options everywhere (venue / full online / advance). No currency conversion: charged in the business currency, minor units per currency in one helper.
- Details and per-provider keys/events: `docs/payments-gateways.md`. Adapters are tested with mocks only; one sandbox payment per provider before go-live.

## Design direction (marketing site, step 30)

Applies to the landing page, /about, /contact, /pricing, /for and the footer. The dashboard, auth screens and public business sites are out of scope until the owner asks.

- **Visual only.** No copy changes. Removing a decorative eyebrow pill removes its words; every other string stays.
- **Remove:** eyebrow pill badges, gradient or two-tone headline text, glows/blobs/dot grids, floating stat badges, emoji, rainbow pastel icon tiles, gradient CTA banners, numbered gradient step boxes, heavy shadows.
- **Palette:** Calvy deep blue (`#0B4A8F`, token `cv-blue`) is the single brand colour. One warm accent, marigold (`#E8A317`, `cv-marigold`), used for fills and highlights only, never as text colour (2.0:1 on off-white). Warm off-white background (`#FAF7F2`), warm neutral greys, monochrome blue line icons.
- **Type:** headings in Bricolage Grotesque (self-hosted `app/fonts/bricolage-grotesque-latin.woff2`, latin subset, weights 500 to 800, CSS variable `--font-display`, Tailwind `font-display`), body in DM Sans. Headings are left-aligned.
- **Shape:** borders over shadows, one corner radius (12px, `rounded-xl`).
- **Real product only.** Pictures are real screenshots of seeded demo accounts, captured by `scripts/marketing-shots.ts` into `public/marketing/{in,intl}/`, shown in one phone frame or one browser frame. The one exception is the "before" chat thread, a generic illustrated thread with no third-party branding.
- **Region-aware pictures.** Two sets, India (INR, Indian names and businesses) and International (USD, international names). Picked by the same region detection as pricing (`useRegion`), fallback International. Same layout; only images and chat names differ.
- **Layout.** Alternating image/text rows; features as a varied-size bento grid in four themes (Bookings, Reminders and alerts, Payments and growth, Your team and brand); the dark problem section becomes a light before/after; steps as a horizontal flow; solid-colour CTA.
- **Performance.** Lighthouse stays at 90 or above on mobile. Screenshots are WebP with fixed dimensions, lazy-loaded below the fold; only the hero image is priority.
