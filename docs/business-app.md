# Calvy Business: the installable phone app (PWA)

For business owners and their team members only (customers use the booking pages and My bookings, which are not part of the app).

## Where the app exists (and where it never does)
The app is for businesses and team members only. The manifest, the install prompt and the service worker exist **only** on app routes (`/dashboard/*`, `/login`, `/accept-invite`). Public and customer pages (`/{slug}`, `/b/{slug}`, `/{slug}/book`, queue tracking, `/account`, booking return) never link the manifest, never show an install prompt and are never controlled by a worker. `lib/appMetadata.ts` is spread into the three app layouts; `tests/pwa.test.ts` fails if anything else links it. Manifest scope is `/`, `start_url` `/dashboard`, orientation `any`.

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

## Push "403" on iPhone but not on Chrome: a malformed `VAPID_SUBJECT`
Apple answers `BadJwtToken` (403) when the VAPID `sub` claim is not a valid `mailto:`/`https:` contact; Chrome's FCM accepts anything. A missing newline in an `.env` file once glued the next variable onto the subject. `lib/push.ts` validates the subject strictly (`isValidVapidSubject`) and falls back to `https://calvy.io` with a logged error, push sends have a 10 s timeout and no keep-alive (a hung send once held `/api/bookings` for 300 s), and `GET /api/admin/push-health` (super admin only) reports the key fingerprints, whether the private key matches the public key, whether the subject is valid, and the device count per key fingerprint (`PushDevice.keyFp`).

## Push "403" (VAPID key mismatch): what it is and how it is handled
A push service answers **403** (`VapidPkHashMismatch` / "VAPID credentials ... do not correspond" on Chrome, `BadJwtToken` on Apple) when the browser subscribed with a different key pair than the one the server signs with. `NEXT_PUBLIC_VAPID_PUBLIC_KEY` is baked into the browser build at **build time** and `VAPID_PRIVATE_KEY` is read by the server at run time, so changing one without the other (or without redeploying) breaks every device, and the dev and production environments must use the same pair while they share a database.
- The server logs `[Push] VAPID_PRIVATE_KEY does not belong to NEXT_PUBLIC_VAPID_PUBLIC_KEY` at start-up when its own two values are not one pair.
- Enabling alerts sends the key the browser used; `POST /api/push/subscribe` answers **409 VAPID_MISMATCH** with a plain message instead of saving a device that can never work.
- The browser never reuses a subscription made with another key: it is unsubscribed and replaced (silently on app open for the person who enabled alerts, or by **Re-enable alerts on this device**).
- A 401/403 (rejected) or 404/410 (dropped) from the push service deletes the device and writes the push service's own reason into the delivery log ("push service rejected this device (403 BadJwtToken). Re-enable alerts on this device."). The Alerts page and the Today banner then show **Re-enable alerts on this device**; the app never quietly re-adds a device the server dropped.

## Alerts you cannot miss
- **App open** (any dashboard page): a new booking or queue event plays the bundled chime (`public/sounds/new-booking.wav`, about 1 second, normalised to -0.2 dBFS; regenerate with `node scripts/make-chime.mjs`), vibrates on Android (`[300,100,300,100,300]`) and shows a card with an **Open** link. It arrives two ways, deduplicated per booking for 60 seconds: the service worker forwards a push to the open window at once, and the bell poll (every 15 s while visible) notices new unread notifications. The system alert is then silent, so there is one sound, not two. Browsers only allow sound after a tap, so the first tap anywhere unlocks audio and a **Tap to enable sound** chip shows until then. Sound on/off and volume are per person on each device (localStorage), with a **Play test sound** button.
- **App closed or phone locked:** every booking is its own notification (tag `new-booking:<appointmentId>`, `renotify`), `requireInteraction: true`, `silent: false`, vibration `[300,100,300,100,300]`, badge, icon, timestamp, and actions **Open** and **Mark arrived** (new bookings; where the platform shows actions). Mark arrived posts to `/api/appointments/<id>/arrived` from the worker and falls back to opening the booking if that fails. Tapping opens the exact booking. The sound itself comes from the phone's notification settings for Calvy: the Phone alerts page lists the steps per platform.
- **Delivery log:** times are shown in the business's own timezone with its abbreviation; a failed push shows the push service's own reason.

## Phone alerts page, test and iPhone
Settings → **Phone alerts** has a live **Setup checklist** (permission, installed to the Home Screen on iPhone, subscribed with the current key, last successful push) and **Send test notification** (`POST /api/push/test`: one REAL message through the push service to THIS device, only if the device belongs to you, 5 per 10 minutes; it shows the push service's answer, for example "Delivered (201) in 340 ms", or the exact error). On iPhone and iPad web push exists only for an app added to the Home Screen (iOS 16.4+): in a Safari tab the page and the Today banner show the install steps (Share, Add to Home Screen, open from the Home Screen, then turn on) instead of a permission prompt that would fail.

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
