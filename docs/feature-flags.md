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
| `onlinePayments` | `FEATURE_ONLINE_PAYMENTS` | Cashfree online booking payments (Rs 10 fee on India Free, full online when chosen). Off: bookings behave as before (legacy Razorpay prepaid path). On: Cashfree decides for every business. Webhooks are never guarded. |

## PLAN_ENFORCEMENT (plan limits and feature gates)

`PLAN_ENFORCEMENT` is a separate switch in `lib/flags.ts` (`isPlanEnforcementOn()`), not one of the table's flags: it guards no API path, it switches the plan limits themselves. **Default OFF in every environment**; it is ON only when the variable is `1` or `true`.

| Mode | What happens |
|---|---|
| **OFF** (default) | Every business is treated as having **every feature and no limits**: counts are unlimited (-1), every flag is true, an expired or past-due plan counts as active, and reminders go out on every channel. Calvy's own online-booking fee (`platformFeeMinorIN`) is **not** a gate and is kept. The plan screens (`/admin/plans`, the billing comparison) still show each plan's real values. |
| **ON** | Limits and flags are the plan's own, read from the `PlanConfig` table, enforced in the page (upgrade screens) and in the API (`lib/limits.ts` checks, settings slot length, expenses, reminder cron, broadcasts, support priority). A lapsed paid plan falls back to Free limits for public bookings. |

How it works: every gate reads its limits through `getLimits` / `getLimitsFromDB` / `getEffectiveLimits` / `isActivePlan` in `lib/plans.ts`, which pass them through `applyEnforcement()`. No enforcement code is removed, so turning the variable on restores today's behaviour exactly.

```powershell
$env:PLAN_ENFORCEMENT="1"; npm run dev      # enforcement on
Remove-Item Env:PLAN_ENFORCEMENT; npm run dev   # off (default)
```

Vercel: add `PLAN_ENFORCEMENT=1` for the target environment and redeploy. **It must be turned on before launch** (see the pre-launch checklist in `docs/PLAN.md`). Tests: `vitest.config.ts` runs the suite with it ON; `tests/plan-enforcement-flag.test.ts` covers both modes.

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
