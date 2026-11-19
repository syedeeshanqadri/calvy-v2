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
- Calvy Levels extras (parked after Step 34): monthly missions, badges, surprise rewards, and what Legend "early access" should unlock.
- Prepaid session bundles (v1 "packages" are only a % off when several services are booked together): the customer buys N sessions up front at a bundle price and uses them over time. Needs a purchase flow, a balance per customer and business, expiry, refunds and the business's own gateway. Parked after Step 31.
- Coupon and referral code in the chat widget (`components/chatbot/ChatWidget`): only the full booking page (`/book`) takes a discount code or `?cref=` referral code today; the widget books without them. Parked after Step 31.
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
- (Superseded by Step 34: the Regular/Silver/Gold tiers became Calvy Levels.) Free reschedule stays for EVERYONE (a reschedule moves the same booking and never charges again); it is not a tier perk. Silver: a ONE-TIME free Rs 10 confirmation, granted when the tier is first reached (`TierGrant`, unique per person and tier), plus a Silver badge on the account page. Gold: one extra free Rs 10 per quarter, which expires at quarter end (a perk). Gold waitlist priority is skipped: there is no waitlist feature yet.
- Normal 7-day stamp rewards still never expire.
- Referral: both people get a free Rs 10 after the friend's first ATTENDED visit. Blocked: self-referral, loops, same phone, same device. The referred person must be new (no earlier Calvy booking anywhere, any identity match); a person can be referred once; cap 5 rewarded referrals per month per referrer; referrers with more than 5 attempts a month are flagged in admin for review. No email-domain or name heuristics (false positives).
- Comeback: +1 stamp when a customer attends a visit within 30 days of their previous attended visit, at most ONE bonus stamp per calendar month (India time); the month is part of the unique key, so the database enforces the cap.
- Plan coupons show on the invoice and receipt as their own line, "Coupon <CODE> (-Rs X)", apart from the proration credit line.

### Step 34: Calvy Levels (decisions, Nov 2026; replaces the Step 31 Regular/Silver/Gold tiers)
- A level lowers Calvy's OWN confirmation fee, so it applies only where that fee exists (Basic plan, India). Starter pays the plan's fee (Rs 10); Regular Rs 9, Insider Rs 8, Pro Rs 7, Legend Rs 6 (the floor; nothing can go below it). The 7-stamp reward, referral rules, comeback stamp and coupons are unchanged; coupons and rewards then reduce the LEVEL fee.
- Earning (attended days only, one per day per booker, so a booker's visits for other people count once a day): Regular = 7 attended days in 90, OR 1 attended referral + 3 visits. Insider = 14 days in 90 + 1 attended referral. Pro = 21 days in 180 + 2 attended referrals + 3 consecutive active months. Legend = 36 days in 180 + 3 attended referrals + 6 consecutive active months. "Attended referral" = the friend's first visit was attended (rewarded, or capped for that month).
- Fast-track: 10 attended days in one calendar month lifts a customer one level, at most once per calendar month, never above Pro (Legend must be fully earned). The boost is held under the same retention as an earned level. (Counted as attended DAYS, matching "attended days only"; a booker cannot reach it by booking many people on the same day.)
- Retention: a level is held 90 days after the last attended visit, then drops one level per further 90 inactive days (checked when the level is read; no cron).
- Perks: Regular none beyond the fee (still gets the level-up screen and email). Insider: one free booking the first time it is reached (once per person). Pro and Legend: one free Rs 10 per quarter (India time), which expires at quarter end. Legend "early access" has nothing to unlock yet (parked).
- The fee is decided ONCE at checkout, for a verified customer only (same rule as spending a reward, so nobody can borrow another person's level by typing their email), and stored on the booking (`Appointment.feeLevel`, `feeMinor`) and in the payment amount, so a later level change never alters an existing order.
- Making verification frictionless (the level fee stays verified-only): at checkout, an unverified visitor whose email matches a customer above Starter sees only "Member price available. Are you A***? Sign in to pay your member price." (a masked first name; never the level, the amount or the full name; its own stricter rate limit). Two ways in: an emailed single-use, 15-minute sign-in link (no password; clicking it also verifies the mailbox) or one-tap Google (`/account/member`, then the usual signed Book-again ticket). The checkout page updates by itself once the link is opened in the same browser. They can skip and pay the standard fee.
- After a verified booking, or a member link, this browser is remembered for 90 days with a signed, httpOnly cookie (`calvy_member`, set on the whole root domain in production); it is checked against the customer's own verified email on every booking, so it never lends status to someone else's email. "Forget this device" is on /account.
- All fees, requirements, windows, the retention period and fast-track live in the `LevelConfig` row (Admin -> Rewards, no deploy); changes are audited with before and after. Admin can look up a customer's level and set it by hand (audited, reason required, audit holds a masked reference not the email).
- Customer UI: /account shows the level, current fee, a progress bar with a vague phrase ("You're close to your next level") and the consecutive-month streak, never the exact rules. Checkout shows the real fee and a level badge. Reaching a level shows a celebration screen once and sends an email.
- Migration: Silver holders become Regular, Gold holders Insider (their Silver one-time Rs 10 stays granted; Insider's free booking is marked given so Gold holders do not get it twice).

### Step 35: Customer account deletion (decisions)
- No instant delete. "Request account deletion" (customers only; business owner accounts unchanged) is blocked while the customer has upcoming bookings (confirmed or pending, in the future, any business). It starts a 30-day grace period (`CustomerDeletionRequest`), emails a confirmation with a single-use cancel link, and the account shows a cancel button. Sign-in works during the 30 days. Admin -> Customers lists "Deletion pending" and can process now or cancel (audited, reason required, ids only in the audit entry).
- After 30 days the daily cron `/api/cron/account-deletions` anonymises the person (same function as admin "Process now"; skipped and left pending if upcoming bookings appeared meanwhile): name "Deleted customer"; email, phone, password, Google link, sessions, tokens, referral codes, devices seen and message addresses removed; rewards identities moved to an anonymised id so history stays; the remembered-device cookie can no longer match any email. Business-side appointment records (date, service, amount, receipt) are kept, with the person's name, email and phone removed from the business's client record. Customers have no push subscriptions (those belong to business users).
- Privacy and data-deletion pages updated to match.

### Step 32: Razorpay for international Calvy plans (decisions)
- Razorpay is used ONLY for businesses outside India buying Calvy plans (USD, cards). India stays Cashfree Subscriptions; business-own gateway adapters (`lib/payments/**`) are untouched. Routing is by the business's region (`regionOf`, the same source as `REGION_PRICING` / `gatewaysForRegion`), not by currency; Razorpay refuses India and refuses INR. Switched on by `CF_INTL_SUBSCRIPTIONS` plus the keys; a live key is refused outside production.
- Recurring cards by default. If Razorpay refuses recurring for the currency or card, the business falls back to a payment link per period plus email reminders ("links mode"), never silently: logged, a badge in Admin -> Billing, and an email to team@calvy.io.
- Coupons (percent only on dollar plans) and upgrade credits lower the FIRST period only, in one checkout: a future `start_at` plus an add-on of the discounted first period (Razorpay charges only the add-on at authentication when `start_at` is in the future), then the full price from `start_at`.
- Webhook `/api/billing/razorpay/webhook`: raw-body HMAC signature, idempotent on the event id and on the payment id; maps activated/charged/halted/cancelled onto the existing state model; receipts as in India.
- Tax lines by who bills and the LUT, never by currency: no GSTIN = receipt only; India = GST; international = no tax line only when `CALVY_LUT_NUMBER` is set, otherwise IGST at `CALVY_GST_RATE`, shown on the invoice (prices are tax-inclusive).
- Failed renewals: halted = past due, 7-day grace, reminders on days 1, 3 and 6, then the Free plan's features (no data deleted; enforcement respected once on). "Update card" = cancel and replace, starting at the current period end, no double charge.
- Settlement is INR (Calvy's Razorpay account is Indian); expected, not a blocker. See docs/razorpay-international.md.

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
