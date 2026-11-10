# Calvy Business: the installable phone app (PWA)

For business owners and their team members only (customers use the booking pages and My bookings, which are not part of the app).

## Install
`/manifest.json`: "Calvy Business", short name "Calvy", opens `/dashboard`, standalone, theme `#0284c7`, 192 and 512 icons (any + maskable) in `/icons`, Apple touch icon, iOS web-app meta in `app/layout.tsx`. In the dashboard an **Install** card shows (dismissible, remembered): the native prompt on Android/Chrome, a "Share → Add to Home Screen" guide on iPhone.

## Service worker (`public/sw.js`, hand-written)
- Caches only: `/_next/static/*` (hashed build files), `/icons/*`, and the static `/offline.html`.
- **Never** caches or answers `/api/*`, any signed-in page, or any non-GET request. Pages are network-only; offline shows `/offline.html` ("You're offline — reconnect to see live bookings"), which contains no data.
- On install it deletes **every** older cache, including `calvy-v2`, which the first worker used to fill with signed-in dashboard pages. When it replaces that old worker it takes over at once so it cannot cache another page.
- A normal update waits: the dashboard shows "New version available — Refresh".
- Alerts only ever open a path inside the app (`/…`, never `//host`).

## Phone alerts (web push)
- One `PushDevice` per signed-in user per browser/phone; `PushPreference` per user (new booking, cancellation, reschedule, token queue events, payment received, daily summary). Settings → **Phone alerts** (any signed-in person).
- Sent through the notification outbox as channel `PUSH` (retries, idempotent per device per event, delivery log). A 404/410 from the push service deletes the device.
- Who gets what (checked when queued **and** again when sent): the owner gets everything; a member only what their permissions allow (booking alerts: all appointments, or only their own with "own only"; queue alerts: queue control; payment and daily summary: reports).
- Text is a name (first name + initial), a time and a service. Phone numbers and emails are scrubbed.
- A person's devices are removed when they **sign out**, are **removed** from the team, or **lose a permission** (shared reception phones). The old business-wide subscriptions were dropped; the opt-in banner shows again.

## Today (phone-first)
Bottom bar: Today, Calendar (or Queue for token businesses), Customers, More. Today shows the day's appointments or tokens with Arrived / Completed / No-show, Call next token, Add walk-in, and call / WhatsApp links (only for people who may see customer details). "Arrived" only stamps `arrivedAt`; for tokens it applies to the one being served ("Present") and "Not present" is the queue's own action.

## Environment variable names
| Name | Purpose |
|---|---|
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | web-push public key (also used by the browser) |
| `VAPID_PRIVATE_KEY` | web-push private key |
| `VAPID_SUBJECT` | contact for the push service, e.g. `mailto:support@calvy.io` |
| `TWA_PACKAGE_NAME`, `TWA_SHA256_FINGERPRINTS` | Android app verification; empty until Pre-launch (`docs/twa-playstore.md`) |

Generate the key pair once: `npx web-push generate-vapid-keys`. Use a different pair for Production than for Preview/Development.
