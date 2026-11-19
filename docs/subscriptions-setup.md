# Calvy plan subscriptions (Cashfree Subscriptions, India)

Calvy's own plan billing (Basic / Pro / Business, monthly and yearly). Calvy's own Cashfree account, India only. International businesses see "Coming soon". Prices come from `lib/pricing.ts` (`REGION_PRICING.IN`), GST inclusive.

## How it works
- Every start or upgrade creates a **new Cashfree subscription** (an ON_DEMAND plan whose maximum is the plan price). Calvy raises each charge itself, so it can prorate and retry.
- **UPI Autopay / card:** the authorisation payment IS the first charge (price minus the prorated credit). **Bank e-mandate:** authorises for Rs 0, Calvy raises the first charge the next day.
- **Upgrade = start now.** Credit = the unused part of what was actually paid for the current period (the latest invoice), in paise, rounded up (the customer gets at most 1 paisa more than exact), never more than paid. The first charge is price minus credit, at least Rs 1. The old subscription ends and is cancelled at Cashfree when the new one is paid.
- **Downgrade / cancel:** at the end of the paid period; the owner can undo before then. A cheaper plan rides the same mandate. A plan that costs more per cycle than the current mandate allows is treated as an upgrade (new mandate, with credit).
- **Failed payment:** the first failure starts a 7-day grace (paid features stay on). Dunning emails on days 0, 3, 6; the charge is retried on days 2 and 5; after day 7 the business moves to Basic (data kept).
- **Business.plan** is set only by `applySubscriptionState` (`lib/subscriptions/service.ts`). An active admin plan override always wins; while it is on, only what the business returns to afterwards is kept current. A business with no subscription is never touched.
- **Invoices:** numbered per Indian financial year, `CALVY/2026-27/0001` (April to March, IST), from an atomic counter, never reused. With `CALVY_GSTIN` set it is a "Tax invoice" with a GST line (GST-inclusive prices, `CALVY_GST_RATE`, default 18). Without it, a plain "Receipt" with no GST line. PDF via `pdf-lib`. Issuer details come from `CALVY_LEGAL_NAME`, `CALVY_ADDRESS`, `CALVY_GSTIN`, `CALVY_CIN` (placeholders in `lib/site.ts` are used for the name and address until set).
- **Emails:** started, upgraded, downgrade scheduled, cancelled, payment failed 1/2/3, downgraded to Basic (template `subscription_notice`).

## Cashfree dashboard setup
1. Webhooks (Developers, Webhooks): add `https://<domain>/api/subscriptions/webhook` for the **Subscription** events: authorisation status, payment success, payment failed, payment cancelled, status changed. Choose payload version **2026-01-01** (the parser reads the snake_case fields of that version).
2. The webhook is signed `base64(HMAC-SHA256(x-webhook-timestamp + raw body, secret))`. Calvy accepts `CASHFREE_SECRET_KEY`, and a separate `CASHFREE_SUBS_WEBHOOK_SECRET` if your account issues one. Events older than 5 minutes are rejected.
3. Subscriptions must be enabled on the Cashfree account (sandbox first), with UPI Autopay, cards and eNACH.
4. Env (names only): `CASHFREE_APP_ID`, `CASHFREE_SECRET_KEY`, `CASHFREE_ENV`, `FEATURE_ONLINE_PAYMENTS=1`, `CRON_SECRET` (the cron raises charges and sends dunning), `CALVY_GSTIN`, `CALVY_GST_RATE`, `CALVY_CIN` (optional).

## RBI limit (no extra authentication up to Rs 15,000 per debit)
The mandate maximum is exactly the plan price. Today the largest price is Business yearly, Rs 8,388, so **no plan exceeds Rs 15,000** and no extra authentication step is needed. The check (`mandateCheck`, `plansAboveNoAfaLimit`) is in code and the checkout screen explains the extra step if a price ever goes above it (a bank e-mandate has no such limit).

## Sandbox checks before go-live (the Cashfree docs leave these open)
These are written from the docs and tested with mocked responses only. Check each in the sandbox:
1. **ON_DEMAND + `authorization_amount` equal to the first charge** is accepted for UPI and card, with `authorization_amount_refund: false`.
2. **`POST /subscriptions/pay` (CHARGE)** accepts our `payment_id` (`calvy_ch_<subscription id>_<date>`), a `payment_schedule_date` about a day ahead, and an amount lower than `plan_max_amount`.
3. The `SUBSCRIPTION_PAYMENT_SUCCESS` / `FAILED` webhooks echo our `payment_id` in `data.payment_id` (the renewal logic only trusts payment ids with our prefix).
4. `SUBSCRIPTION_AUTH_STATUS` carries `authorization_details.authorization_status` = ACTIVE on success.
5. Which secret signs subscription webhooks (client secret vs a separate webhook secret).
6. Cashfree's own retry behaviour for failed charges (Calvy retries on days 2 and 5 itself, so none is needed).
7. `subscriptions/{id}/manage` with action CANCEL ends the mandate.

## Not part of 25a
Rewards engine (25b). Customer-facing plan prices on the marketing site are unchanged.

International (non-India) plan billing goes through Razorpay instead of Cashfree: see `docs/razorpay-international.md`. Cashfree here is India only.
