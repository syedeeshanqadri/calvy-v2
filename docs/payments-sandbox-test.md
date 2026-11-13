# Online payments: Cashfree sandbox test guide

Payments are verified in the **Cashfree sandbox only** (local and Vercel preview). Production go-live is a separate checklist under "Pre-launch" in `docs/PLAN.md`. Never put live keys in `.env.local`, a Preview environment, chat or the repo.

## What the sandbox charges

A public booking on an **India** business (currency INR) on the **Free** plan pays Calvy's **Rs 10** booking fee online. The service itself is paid at the venue. Paid plans, other countries, dashboard bookings and walk-ins pay nothing online. Use a business like `clinic` (INR, Free) from the seed.

## Setup

**Local** (`.env.local`, never committed):

```
FEATURE_ONLINE_PAYMENTS=1
CASHFREE_ENV=sandbox
CASHFREE_APP_ID=<sandbox app id>
CASHFREE_SECRET_KEY=<sandbox secret key>
```

Locally Cashfree cannot call your computer, so there is no webhook. The booking is confirmed when the customer comes back to `/booking/return`, which asks Cashfree for the order's state (this is the "return-page recheck").

**Vercel preview** (Settings → Environment Variables → **Preview** only): the same four variables.

- The app uses the preview's own address (`VERCEL_URL`) for the return page, and the stable branch alias (`VERCEL_BRANCH_URL`, falling back to `VERCEL_URL`) for the webhook, not `NEXT_PUBLIC_APP_URL`. WhatsApp webhooks use the same alias.
- If Deployment Protection is on, Cashfree needs the bypass secret to reach the webhook. In Vercel: Project → Settings → Deployment Protection → **Protection Bypass for Automation** → create a secret. Vercel then gives every deployment `VERCEL_AUTOMATION_BYPASS_SECRET`, and the app adds it to the webhook URL of each order, on previews only.
- The webhook URL Cashfree is given for each order has this exact form:

  ```
  https://<preview-host>.vercel.app/api/payments/cashfree/webhook?x-vercel-protection-bypass=<VERCEL_AUTOMATION_BYPASS_SECRET>
  ```

  The bypass secret only lets the request through Vercel's protection. The webhook still verifies Cashfree's signature (`x-webhook-signature`, HMAC-SHA256 over timestamp + raw body, keyed with the secret key), so a request without a valid signature gets 401.
- You do not need to register a webhook URL in the Cashfree sandbox dashboard: the app sends one with every order. If you register one anyway, use the same form.
- The bypass secret is stored in the order at Cashfree. Use a dedicated one for previews and rotate it from the Vercel settings if it ever leaks.

**Check it:** sign in as super admin and open `/api/admin/payments-health`. In sandbox it must say `"ready": true, "mode": "sandbox"`. Warnings (http address locally, no `CRON_SECRET`, no receipt company details) are fine in sandbox.

## Cashfree's official sandbox test data

Source: https://www.cashfree.com/docs/api-reference/payments/data-to-test-integration (read 2026-11-07; re-check there if a value stops working).

**UPI** (type the VPA as the customer's UPI ID, "collect" request):

| UPI ID | Result |
|---|---|
| `testsuccess@gocash` | Successful payment |
| `testfailure@gocash` | Failed payment |
| `testinvalid@gocash` | Invalid VPA error |
| `testdeclineuser@gocash` | User cancellation (offers retry) |
| `testexpired@gocash` | Session timeout |
| `testtimeoutbank@gocash` | Issuing bank timeout |
| `testinsufficientfunds@gocash` | Insufficient funds |
| `testbankdeclined@gocash` | Generic bank reject |
| `testuserdropped@gocash` | Customer abandoned |

The page lists more failure VPAs (network error, invalid PIN, fraud block and others), all of the form `test<reason>@gocash`.

**Cards** (name `Test`, expiry **03/2028**, CVV **123**, OTP **111000** for every card):

| Network | Number |
|---|---|
| Visa debit | 4706131211212123 or 4062288312345026 |
| Visa credit | 4576238912771450 or 4444333322221111 |
| Mastercard debit | 5409162669381034 or 5445856839524391 |
| Mastercard credit | 5105105105105100 or 5176539438527826 |
| RuPay debit | 6074825972083818 or 6074828163369590 |
| RuPay credit | 6528591234543575 |

Cashfree's page does not say which card number produces a failure; use the failure UPI IDs for failed payments.

**Net banking:** bank "TEST Bank", payment code 3333. **Wallet:** the single "test wallet". Sandbox does not support PayPal or bank transfer.

## 10-step test script

Run it on a preview (steps 8 to 10 need the webhook) or locally (steps 1 to 7 and 9).

1. **Health.** Super admin: `/api/admin/payments-health` shows `ready: true`, `mode: sandbox`, and the webhook URL to expect.
2. **Settings screen.** Owner of the test business: Settings → Online payments shows "Online payments are live", "Booking fee only" selected, "Full online payment" greyed as coming soon. Save with the fee-payer switched; reload; it stuck.
3. **Book.** On the business's public booking page choose a service, a slot and enter a name, an email you can read and an Indian phone number. The button says "Pay ₹10.00 & book" and the page says the slot is held for 16 minutes.
4. **Pay (success).** Complete Cashfree checkout with UPI `testsuccess@gocash` (or card 4706131211212123, 03/28, 123, OTP 111000).
5. **Return page.** You land on `/booking/return` and it ends on a confirmed booking (locally this is the recheck, without any webhook). The dashboard shows the appointment as confirmed and paid.
6. **Emails.** The confirmation and the receipt arrive (the receipt shows Rs 10 and, if the `CALVY_*` details are set, the company name, GSTIN and the GST split; otherwise "Receipt details not configured").
7. **Failure.** Book another slot and pay with `testfailure@gocash`. The page offers a retry, the booking is not confirmed, and after the 16 minutes (or the next cron sweep) the slot is free again and the booking shows as expired.
8. **Webhook (preview).** In the Vercel logs for the preview, the payment webhook shows 200 for step 4 and 5 shortly after paying. Paying and closing the tab before the return page still ends with a confirmed booking.
9. **Credit.** Cancel the paid booking as the customer (My bookings → Cancel). The Rs 10 appears in My wallet for that business. Open "Book with this credit", book again: the page shows the credit, the charge is Rs 0, and the booking confirms at once with no checkout.
10. **Business cancel.** In the dashboard cancel a paid, confirmed booking: the Rs 10 is refunded to the customer through Cashfree (the refund shows in the Cashfree sandbox dashboard), and any wallet credit used on it is returned.

## Troubleshooting

- **Booking confirms without asking for payment:** the flag is off, the business is not INR, or its plan is paid. `/api/admin/payments-health` and the business's plan tell you which.
- **"Online payments are temporarily unavailable":** Cashfree keys are missing or wrong in that environment.
- **Stays "awaiting payment" on a preview:** the webhook could not get through Deployment Protection (check `VERCEL_AUTOMATION_BYPASS_SECRET` exists for Preview) and the customer never returned to `/booking/return`.
- **Cashfree rejects the order:** the sandbox rejects order expiries of 15 minutes or less, which is why the hold is 16 minutes.
