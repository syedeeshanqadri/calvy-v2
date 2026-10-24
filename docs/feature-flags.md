# Feature flags (S1-20)

Server-side flags in `lib/flags.ts`. **Every flag is OFF by default in every environment** (development, test, production). A flag is enabled only by setting its environment variable to `1` or `true` (case-insensitive). Anything else, or unset, means off. `GET /api/flags` returns the current state as JSON (`Cache-Control: no-store`, no secrets).

| Flag | Env var | What it hides |
|---|---|---|
| `wallet` | `FEATURE_WALLET` | Wallet and withdrawals: `/api/wallet*`, `/api/admin/withdrawals*` |
| `payments` | `FEATURE_PAYMENTS` | Prepaid bookings, Calvy billing/subscriptions, payout settings: `/api/razorpay/connect`, `/api/billing/{portal,sync,upgrade,status}`, `/api/settings/payout`, `/api/bookings/confirm`, `/api/appointments/<id>/payment` |
| `broadcasts` | `FEATURE_BROADCASTS` | `/api/broadcasts*` |
| `chatWidget` | `FEATURE_CHAT_WIDGET` | UI only (chat widget); no API guard |
| `demoBooking` | `FEATURE_DEMO_BOOKING` | UI only (static demo page `/booking`); no API guard |
| `removeBranding` | `FEATURE_REMOVE_BRANDING` | UI only; no API guard |

## Enforcement

`proxy.ts` (renamed from `middleware.ts` in the Next 16 migration) checks `/api/*` paths first, before auth or subdomain logic. If `featureForApiPath(pathname)` returns a flag that is off, the response is `404 {"error":"Not found"}`. Matching is by whole path segment (`/api/walletx` is not guarded). No route handler is changed.

## Enabling

Local (PowerShell):

```powershell
$env:FEATURE_WALLET="1"; npm run dev
```

Vercel: Project Settings > Environment Variables, add e.g. `FEATURE_PAYMENTS=1` for the target environment (Production/Preview/Development), then redeploy (env changes apply to new deployments only).

## Webhooks are never guarded

`/api/razorpay/webhook` and `/api/billing/webhook` always work regardless of flags. Payment events from the gateway must not be lost (the gateway would retry and eventually drop them), and turning a UI entry point off must not break reconciliation of payments already in flight.

## Known limitations

- Businesses already set to prepaid keep it in `POST /api/bookings`. Prepaid is reworked in Step 5 (Cashfree: pending-payment holds, webhook-confirmed bookings), after which the payment flags are revisited and Razorpay, the wallet and withdrawals are removed.
- UI-only flags (`chatWidget`, `demoBooking`, `removeBranding`) are enforced by the frontend via `getFlags()` / `/api/flags`, not by the proxy.

## Production warning

Deploying with defaults turns these entry points off. If real customers already depend on a feature (for example `FEATURE_PAYMENTS` while paying subscribers exist), set the relevant variable to `1` in Vercel production **before** deploying.
