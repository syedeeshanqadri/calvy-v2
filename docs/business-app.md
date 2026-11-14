# Calvy Business: the installable phone app (PWA)

For business owners and their team members only (customers use the booking pages and My bookings, which are not part of the app).

## Where the app exists (and where it never does)
The app is for businesses and team members only. The manifest, the install prompt and the service worker exist **only** on app routes (`/dashboard/*`, `/login`, `/accept-invite`). Public and customer pages (`/{slug}`, `/b/{slug}`, `/{slug}/book-now`, queue tracking, `/my`, booking return) never link the manifest, never show an install prompt and are never controlled by a worker. `lib/appMetadata.ts` is spread into the three app layouts; `tests/pwa.test.ts` fails if anything else links it. Manifest scope is `/`, `start_url` `/dashboard`, orientation `any`.

## Install
`/manifest.json`: "Calvy Business", short name "Calvy", opens `/dashboard`, standalone, theme `#0284c7` (the UI accent is the slightly deeper `#0369a1`, which passes WCAG AA with white text), 192 and 512 icons (any + maskable) in `/icons`, Apple touch icon, iOS web-app meta in `lib/appMetadata.ts`. In the dashboard an **Install** card shows (dismissible, remembered): the native prompt on Android/Chrome, a "Share → Add to Home Screen" guide on iPhone.

## Service worker (`public/app-sw.js`, hand-written, scope `/dashboard`)
- Registered by the dashboard (`components/dashboard/PushSetup.tsx`, helpers in `lib/pwa.ts`) with scope `/dashboard`, never `/`.
- **Migration from the first worker (scope `/`):** `public/sw.js` is now a retired worker that deletes every cache and unregisters itself (old devices fetch it on their next visit), and the dashboard unregisters any registration whose scope is `/` when it opens. Unregistering drops that device's push subscription, so if the old worker held one the app subscribes again under the new worker and removes the old device row. Verified in a browser: public pages end with no controlling worker, no manifest and no install UI.
- Caches only: `/_next/static/*` (hashed build files), `/icons/*`, and the static `/offline.html`.
- **Never** caches or answers `/api/*`, any signed-in page, or any non-GET request. Pages are network-only; offline shows `/offline.html` ("You're offline — reconnect to see live bookings"), which contains no data.
- On install it deletes **every** older cache, including `calvy-v2`, which the first worker used to fill with signed-in dashboard pages. When it replaces that old worker it takes over at once so it cannot cache another page.
- A normal update waits: the dashboard shows "New version available — Refresh".
- Alerts only ever open `/dashboard…` (anything else becomes `/dashboard`).
- **Alerts are grouped and counted:** the same tag replaces the older alert, and several of one kind read "3 new bookings" (`kind` travels from the outbox to the device). The app icon badge (Badging API, where supported) is the number of alerts still on the lock screen; opening the app clears it. A tap on a new-booking alert opens that exact booking (`/dashboard/appointments?open=<id>`), a queue alert opens the queue.
- **`pushsubscriptionchange`:** the worker subscribes again with the same key and registers it. If it cannot, the app does it silently on the next open, but only for the person who turned alerts on on this device (`calvy-push-user` in localStorage, cleared on turn-off and sign-out), so a shared phone never subscribes the next person by itself. It never asks for permission: permission is requested only from a tap on Enable / Turn on.

## Phone alerts (web push)
- One `PushDevice` per signed-in user per browser/phone; `PushPreference` per user (new booking, cancellation, reschedule, token queue events, payment received, daily summary). Settings → **Phone alerts** (any signed-in person).
- Sent through the notification outbox as channel `PUSH` (retries, idempotent per device per event, delivery log). A 404/410 from the push service deletes the device.
- Who gets what (checked when queued **and** again when sent): the owner gets everything; a member only what their permissions allow (booking alerts: all appointments, or only their own with "own only"; queue alerts: queue control; payment and daily summary: reports).
- Text is a name (first name + initial), a time and a service. Phone numbers and emails are scrubbed.
- Signing out removes only THIS device's alert registration; all of a person's devices are removed when they are **removed** from the team, **lose a permission** or change staff link (shared reception phones). The old business-wide subscriptions were dropped; the opt-in banner shows again.

## Phone alerts page, test and iPhone
Settings → **Phone alerts** has **Send test notification** (`POST /api/push/test`: one alert to THIS device, only if the device belongs to you, 5 per 10 minutes). On iPhone and iPad web push exists only for an app added to the Home Screen (iOS 16.4+): in a Safari tab the page and the Today banner show the install steps (Share, Add to Home Screen, open from the Home Screen, then turn on) instead of a permission prompt that would fail.

## Layout and touch (Step 19)
- Sidebar from **768px** (tablets and phones in landscape), bottom nav below it; the sidebar starts icon-only under 1024px.
- Touch devices (`pointer: coarse`): every text input is 16px (iOS never zooms) and at least 44px tall, every button 44px (`app/globals.css`; `.tap-tight` opts a dense control out of the size, not the 16px).
- Dialogs (`components/ui/Modal.tsx`) are full-screen sheets on phones that follow the visual viewport, so the keyboard never covers the action row (`footer` prop, or the last row of a form inside the dialog).
- Today and Queue update on their own (15s / 10s, only while the app is in front), pull down to refresh, skeletons while loading, and Arrived / Completed / No-show / "Done · call next" show at once with an **Undo** toast: the server is called after 5 seconds unless Undo is tapped, so an undone tap sends no email or WhatsApp.
- A member who opens a page their role does not include sees "You don't have access to this page" (`/dashboard/no-access`), not the home screen.
- `scripts/pwa-audit.mjs` (layout audit across phones, tablets and orientations) and `scripts/lighthouse-app.mjs` (mobile Lighthouse on Today and Queue) are run by hand, not in CI.

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
