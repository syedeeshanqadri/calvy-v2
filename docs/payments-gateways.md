# Payment gateways (business-owned, by region)

Calvy never touches a business's service money. A business on a paid plan connects its OWN gateway in Settings → Payments, and customers pay straight into that account in the business's own currency (no conversion). Calvy's own Cashfree is used only for the Rs 10 confirmation fee on India Basic.

## Who can use what

| | India (currency INR) | International (any other currency) |
|---|---|---|
| Entry plan (Basic / Free) | Rs 10 confirmation fee to Calvy, service paid at the venue. No own gateway. | Pay at the venue. No own gateway. **No Rs 10 on any plan.** |
| Paid plans | Own gateway: Razorpay, Cashfree, PhonePe PG, PayU, CCAvenue, Paytm PG | Own gateway: Stripe, PayPal |
| Later | | Square, Mollie, Adyen |

- Region is `regionOf()` in `lib/payments/region.ts`: a stored `Business.country` wins if one exists (none yet), otherwise INR = India, anything else = international.
- The gateway list is filtered by region in the UI AND refused by the server (`POST /api/settings/gateways` answers 403 `GATEWAY_REGION`).
- "Paid plan" is the same field that already decided it: `platformFeeMinorIN === 0` (`lib/payments/access.ts`). The entry plan keeps its fee, so it cannot connect a gateway in either region.
- Customers pay the same three ways everywhere: at the venue, in full online, or an advance (percent or fixed amount in the business currency).

## Money in minor units

`lib/currency.ts` is the one place: `minorExponent`, `toMinorUnits`, `fromMinorUnits`, `toDecimalString`. Two decimals for most currencies, none for JPY (and the other zero-decimal ones), three for KWD, BHD, OMR, JOD, TND, IQD, LYD. Three-decimal amounts are rounded to the nearest 0.01 so Stripe and banks accept them and the recorded amount equals the charged amount.

## Provider setup (the same text is on each provider card in Settings)

| Provider | Where the keys are | Webhook events to enable |
|---|---|---|
| Stripe | Developers → API keys → **Create restricted key** with Checkout Sessions: Write, Refunds: Write, PaymentIntents: Read (nothing else). Developers → Webhooks → Add endpoint → reveal the signing secret (`whsec_…`). Paste the key and the signing secret. No Stripe Connect. | `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired` |
| PayPal | Developer Dashboard → Apps & Credentials → app → Client ID and Secret. Sandbox/Live toggle in Calvy. Add a webhook to the app, then paste its **Webhook ID**. Not available for AED, SAR, KWD and other currencies PayPal does not take (blocked at connect). | `CHECKOUT.ORDER.APPROVED`, `PAYMENT.CAPTURE.COMPLETED`, `PAYMENT.CAPTURE.DENIED` |
| PayU | Dashboard → Payment Gateway → API Keys: Merchant Key and Salt (32-bit). | Success and Failure payment webhooks. Signed with the Salt, nothing more to paste. |
| CCAvenue | Merchant ID (top right), Settings → API Keys: Access Code and Working Key. **Their status API only answers approved IP addresses**: ask CCAvenue support to enable it and allow Calvy's host addresses. | None exist: Calvy checks with CCAvenue when the customer returns to the page. |
| Paytm PG | Developer → API Keys: MID, Merchant Key (16 chars), Website name (WEBSTAGING test, DEFAULT live). | Payment status URL = the Calvy webhook URL. Signed with the Merchant Key. |
| Razorpay, Cashfree, PhonePe | See each card. | See each card. |

## How each new adapter pays and confirms

- **Stripe**: hosted Checkout Session (`client_reference_id` = our order id). A paid session or `async_payment_succeeded` is PAID; `Stripe-Signature` is checked (HMAC-SHA256, 5-minute tolerance).
- **PayPal**: Orders v2 with `intent: CAPTURE`. The customer approves, then Calvy captures (on the approval webhook, or when the customer's return page checks the order). The capture is the paid event. PayPal events are verified by PayPal itself (`verify-webhook-signature`) with the business's own webhook ID.
- **PayU / CCAvenue / Paytm** take the customer over with a browser form POST. They send the customer back with a POST, which `/api/payments/return` turns into a redirect to the normal booking return page, which re-checks the order with the gateway.

## Honest limits

These five adapters are written from each provider's public documentation and tested with mocked network calls only (request shape, signatures, webhook accept/reject). None has been run against a live or sandbox account yet. Before go-live, one sandbox payment per provider is needed: PayU, CCAvenue and Paytm in particular have return-flow and verify-call details the documentation leaves loose.

## International Calvy subscriptions

Parked until the end of the pre-launch list. Flag `CF_INTL_SUBSCRIPTIONS` (off by default). Outside India the Billing page shows "Coming soon".
