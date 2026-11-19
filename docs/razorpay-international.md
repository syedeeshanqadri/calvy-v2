# Razorpay for international Calvy plan billing

Razorpay is used **only** for businesses outside India buying **Calvy plans** (Pro, Business), in **USD, by card**.

- India plan billing stays on **Cashfree Subscriptions** (`docs/subscriptions-setup.md`). An Indian business never sees Razorpay for Calvy billing.
- The business-own gateway adapters (`lib/payments/**`, what a business connects in Settings → Payments) are **not touched** by any of this. The new code is `lib/subscriptions/razorpay.ts` (API client, signatures, env guards), `lib/subscriptions/razorpayService.ts` (state machine, cron) and `app/api/billing/razorpay/webhook`.
- Settlement: Calvy's Razorpay account is an **Indian** account, so payouts to Calvy are in **INR**. That is expected and does not block anything. (Razorpay's own pages disagree on settlement currency, INR on the India FAQ and USD on the US pages; the Indian-account answer is the one that applies. Confirm the amount you receive on the first live payout.)

## Region routing

`billingGateway(business)` in `lib/subscriptions/razorpayService.ts` decides who bills a business, using `regionOf()` in `lib/payments/region.ts`, the same source the price list (`REGION_PRICING`) and the gateway list (`gatewaysForRegion`) use: a stored country wins, otherwise the currency decides (INR = India). India → Cashfree. Everyone else → Razorpay.

The guard `razorpayAllowedFor()` refuses Razorpay for an Indian business and for rupees. Every Razorpay money handler also checks that the subscription row is Razorpay-billed and that the payment is in USD, and the Cashfree cron only reads Cashfree rows.

Prices are the dollar prices in `REGION_PRICING.INTL` (Pro $6 monthly / $60 yearly, Business $15 / $144 at the time of writing).

International billing is off until you switch it on: flag `CF_INTL_SUBSCRIPTIONS=1` **and** the Razorpay keys present. Until then the Billing page shows "coming soon", as before.

## Environment (names only; never put values in code, logs or commits)

| Name | What |
|---|---|
| `RAZORPAY_KEY_ID` | Key id. `rzp_test_...` in sandbox, `rzp_live_...` in production. |
| `RAZORPAY_KEY_SECRET` | Key secret (also checks the Checkout success signature). |
| `RAZORPAY_WEBHOOK_SECRET` | The secret you type when creating the webhook in the Razorpay dashboard. |
| `CF_INTL_SUBSCRIPTIONS` | `1` turns international plan billing on. |
| `CALVY_GSTIN`, `CALVY_GST_RATE`, `CALVY_LUT_NUMBER` | Invoice tax treatment (below). |
| `CALVY_TEAM_EMAIL` | Optional. Where the "links mode" alert goes; default `team@calvy.io`. |

A **live key is refused unless `NODE_ENV=production`**: on a developer machine or a preview build the whole Razorpay path reads as "not configured". The values are never logged or returned by any route.

## How a plan is bought

1. Owner opens Billing → picks a plan → the quote (USD, with any coupon) → **Pay**.
2. `POST /api/subscriptions/checkout` creates (once per price, then reused) a Razorpay **plan**, then a Razorpay **subscription**, and returns the key id and subscription id. The browser opens **Razorpay Checkout** (`checkout.js`); the card is entered once.
3. On success the page posts the three values Razorpay returns to `POST /api/subscriptions/razorpay/confirm`. The server checks the signature (HMAC-SHA256 of `payment_id|subscription_id` with the key secret), asks Razorpay for the payment (amount and status come from Razorpay, never the browser) and activates the plan. The webhook then reports the same payment and is ignored as a repeat.
4. Razorpay charges the card every period by itself. Calvy raises nothing.

### Coupons: the first period only, in ONE checkout

A Calvy coupon (or an upgrade credit) lowers the **first** payment only. Razorpay does not take a negative add-on, so this uses the documented pattern:

- `start_at` = one period from now (a future start), and
- `addons` = one item whose amount is the **discounted first period**.

Razorpay's authentication-amount table says that with a **future** `start_at` and an upfront add-on, **only the add-on is charged at authentication**; with an **immediate** start and an add-on it would be add-on **plus** plan amount, which is why a discounted first period always uses the future start. Recurring then starts at `start_at` at the **full** price. The card is entered once. With no coupon or credit there is no add-on and no `start_at`: the subscription starts at once and the plan price is charged at authentication.

Sources: [How Subscriptions Work, authentication amounts](https://razorpay.com/docs/payments/subscriptions/workflow), [Create a Subscription (`addons`, `start_at`)](https://razorpay.com/docs/us/api/payments/subscriptions/create-subscription), [Glossary: upfront amount](https://razorpay.com/docs/us/payments/subscriptions/glossary/).

Rules carried over from Cashfree: one code per checkout, server-side validation, usage logged, released if the checkout is abandoned. **A flat coupon is an amount in the currency it was made in (rupees, from the admin form), so only percent coupons apply to dollar plans**; a flat code gets "This code is only for India plans."

### The fallback: links mode (never silent)

Recurring card billing in USD needs your Razorpay account to have **International Payments** and **international card recurring** switched on, and the customer's card to allow it. If Razorpay refuses (a 400 that is about the currency or recurring), the business is put on **links mode** instead of failing:

- one payment link for the first period, then a payment link per period, emailed 7 days ahead with reminders at 3 and 1 day; paid links activate and renew the plan (`payment_link.paid`);
- **logged** (`[Billing] links mode`, with the business id and Razorpay's reason),
- shown in **Admin → Billing** with a **links mode** badge and the reason,
- **emailed to `team@calvy.io`** (`CALVY_TEAM_EMAIL`).

Recurring is the default. A non-currency failure (a 5xx, bad keys, a typo) is an error shown to the owner, never a silent switch.

## The webhook

`POST /api/billing/razorpay/webhook`. In the Razorpay dashboard (Account & Settings → Webhooks → Add) set the URL to `https://<your domain>/api/billing/razorpay/webhook`, type a secret (that is `RAZORPAY_WEBHOOK_SECRET`) and tick: `subscription.authenticated`, `subscription.activated`, `subscription.charged`, `subscription.pending`, `subscription.halted`, `subscription.cancelled`, `subscription.completed`, `payment_link.paid`.

- **Signature:** HMAC-SHA256 of the **raw body** with the webhook secret, compared in constant time, before anything else is read. No secret configured = 503; a bad or missing signature = 401 and nothing is applied.
- **Idempotency:** each `x-razorpay-event-id` is stored once (`WebhookEvent`, provider `RAZORPAY`); a replay returns `duplicate`. Independently, every invoice is keyed by Razorpay's **payment id**, so the same payment arriving as a different event, or from the checkout confirmation, still produces one invoice and one email. If applying an event fails, its id is released and 500 is returned, so Razorpay's retry succeeds.
- **Mapping to the existing status model** (`Subscription.state`):

| Razorpay event | Calvy |
|---|---|
| `subscription.authenticated` / `activated` / `charged` with a captured payment | `PENDING` → `ACTIVE` (first payment) or a renewal (period extended, invoice) |
| `subscription.authenticated` for a replacement card with no payment yet | the new subscription inherits the paid period (see Update card) |
| `subscription.halted` | `ACTIVE` → `PAST_DUE`, 7-day grace |
| `subscription.cancelled` / `completed` | `ENDED` (paid access runs to the period end) |
| `payment_link.paid` | first payment or renewal in links mode |
| `subscription.pending` | ignored (Razorpay is retrying) |

## Failed renewals (dunning)

Razorpay retries a failed charge itself (T+1, T+2, T+3 days). When it gives up the subscription is **halted**, and Calvy treats that as **past due**:

- **7 days of grace**, paid features stay on;
- reminder emails on **day 1, 3 and 6** after the halt (India's schedule, days 0/3/6, is unchanged);
- after the grace the business drops to the **Free plan's features**. **No data is deleted.** Plan enforcement is respected once it is on (the plan fields are set through the same `applySubscriptionState` India uses, and an admin plan override still wins);
- a payment at any time before that (the customer updates the card, or pays the link) returns the plan to active.

## Update card

Billing → **Update card** (recurring mode). Razorpay cannot change a card on a halted or pending subscription, so this is **cancel and replace**:

1. A **new** subscription for the same plan is created with `start_at` = the **current period end** (no add-on), so the new card is never charged for a period the old one already covers.
2. When the new card is authenticated, the old subscription is **cancelled** and the new one **inherits the paid period**. No invoice, no email, no second charge.
3. If the plan is already halted (the period ended), the new subscription starts **now** and its first charge is the overdue renewal.
4. A replacement nobody finishes within a day is closed; the old subscription never stopped.

## Invoices and receipts

Receipts go out the same way as India: the first payment emails "plan is active", every payment makes a numbered invoice (`CALVY/<financial year>/0001`) in Billing, PDF on demand, currency-aware (`$` for USD).

The tax treatment is **never decided by currency**, only by who bills and the LUT:

| Case | Document | Tax line |
|---|---|---|
| `CALVY_GSTIN` empty | Receipt | none (receipt-only mode, as before) |
| India (Cashfree) | Tax invoice | GST at `CALVY_GST_RATE`, included in the price |
| International, `CALVY_LUT_NUMBER` set | Tax invoice | **none**; prints "Supply of services for export under Letter of Undertaking `<number>`. No tax charged." |
| International, no LUT | Tax invoice | **IGST** at `CALVY_GST_RATE`, included in the price, shown on the invoice |

`CALVY_LUT_NUMBER` is empty for now, so international tax invoices (once a GSTIN is set) show IGST. Prices are treated as tax-inclusive, so a customer is charged exactly the list price.

## Sandbox test steps (Razorpay test mode)

Prerequisites: a Razorpay **test-mode** account with **International Payments** enabled for test; a public URL for the webhook (`ngrok http 3000` locally, or a Vercel preview).

1. In `.env.local` (names only): `RAZORPAY_KEY_ID=rzp_test_…`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `CF_INTL_SUBSCRIPTIONS=1`, `FEATURE_ONLINE_PAYMENTS=1`. A live key will not work here by design.
2. Run `npm run db:migrate:dev` (the migration adds the Razorpay columns), then `npm run dev`.
3. Add the webhook in the Razorpay **test** dashboard (URL and events above, with your secret).
4. Use a business whose currency is **USD** (an Indian business is routed to Cashfree on purpose). Sign in as its owner → **Billing**. You should see dollar prices and no UPI / e-mandate choices.
5. **First payment.** Choose Pro monthly → **Pay $6 and start**. In Checkout use a Razorpay **test card** (any future expiry, any CVV, any name):
   - Mastercard `5104 0155 5555 5558` (credit) or `5104 0600 0000 0008` (debit), the international cards Razorpay lists for **subscription authentication**; or
   - Visa `4384 7968 2770 3274` / Mastercard `5312 6865 5677 9641`, the US-account cards Razorpay's US docs list for payments and subscriptions;
   - complete the test 3D Secure page with **Success**.
   Razorpay's pages list different numbers in different places, so if one is refused try another from the [current test-cards page](https://razorpay.com/docs/us/payments/payments/test-card-details) and the [Test Subscriptions page](https://razorpay.com/docs/us/payments/subscriptions/test/). Expect: the page says the payment went through, the plan shows **Pro**, an invoice appears ($6.00, a receipt while `CALVY_GSTIN` is empty) and the "plan is active" email goes out. The webhook shows `activated` once and `noop` or `duplicate` for the repeat.
6. **Renewal.** In the Razorpay test dashboard open the subscription → **Charge this now**. A second invoice appears and the period moves on. (In test mode a later debit only works within **3 days** of the card token being created, because test tokens expire after 3 days.)
7. **Coupon.** In Admin → Coupons make a **percent** plan coupon (for example 20%); on Billing apply it. The checkout total is the discounted first period; the subscription in the Razorpay dashboard shows a future start and the add-on. The first invoice has a "Coupon CODE (−$X)" line.
8. **Update card.** Billing → **Update card** → pay with a second test card. In the dashboard the old subscription is cancelled and the new one starts at the period end; Billing shows no new invoice and no double charge.
9. **Failure and grace.** To see `halted` without waiting for Razorpay's retries, send a signed test event (below). The business shows past due with the grace date; Admin → Billing lists it; run the cron (`GET /api/cron/notifications` with your cron secret) with the clock moved, or set `graceUntil` into the past on the row, to see the move to Free and the "downgraded" email.
10. **Links mode.** To exercise the fallback without a refusing account, send a signed `payment_link.paid` or temporarily point the keys at an account without international recurring: the checkout should return a payment link, Admin → Billing shows the **links mode** badge with the reason, and `team@calvy.io` gets the alert.

### Sending a signed test event from the terminal

The webhook secret is read from your environment, never typed or printed:

```sh
BODY='{"event":"subscription.halted","payload":{"subscription":{"entity":{"id":"sub_XXXX"}}}}'
SIG=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$RAZORPAY_WEBHOOK_SECRET" | sed 's/^.* //')
curl -s -X POST http://localhost:3000/api/billing/razorpay/webhook \
  -H "Content-Type: application/json" -H "x-razorpay-signature: $SIG" -H "x-razorpay-event-id: evt_test_1" --data "$BODY"
```

A second send with the same event id returns `duplicate`; a changed body with the old signature returns 401.

## Go-live checklist

- Razorpay **International Payments** and **international card recurring** switched on for the live account (ask Razorpay if "recurring" is not offered for USD cards on your account; if it is not, links mode will carry international billing and the team will be emailed for each business).
- Live keys and the live webhook secret in Production env only; `CF_INTL_SUBSCRIPTIONS=1`.
- `CALVY_GSTIN`, `CALVY_GST_RATE`, and `CALVY_LUT_NUMBER` once the LUT is filed.
- Run one live USD payment with a small amount, check the invoice, the INR settlement amount, the webhook log and the cancellation path.

## Sources

[Subscriptions FAQ](https://razorpay.com/docs/payments/subscriptions/faqs) · [Supported payment methods](https://razorpay.com/docs/us/payments/subscriptions/supported-payment-methods) · [How Subscriptions Work](https://razorpay.com/docs/payments/subscriptions/workflow) · [Create a Subscription](https://razorpay.com/docs/us/api/payments/subscriptions/create-subscription) · [Subscriptions webhook events](https://razorpay.com/docs/webhooks/subscriptions) · [Payment retries](https://razorpay.com/docs/payments/subscriptions/payment-retries/) · [Subscription states](https://razorpay.com/docs/us/payments/subscriptions/states) · [Update a Subscription](https://razorpay.com/docs/us/payments/subscriptions/update) · [Test cards](https://razorpay.com/docs/us/payments/payments/test-card-details)
