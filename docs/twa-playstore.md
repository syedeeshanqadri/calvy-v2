# Android app (Trusted Web Activity) for Calvy Business

A TWA is the website, full screen, in an Android app shell. There is no second codebase: the app is the installable PWA (`/dashboard`) with a Play Store listing. **Nothing is built or uploaded yet.** The real build happens at Pre-launch, on the production domain, because the app and its verification file are tied to that domain.

## Fixed values
| | |
|---|---|
| App name | Calvy Business |
| Package name | `in.calvy.business` |
| Start URL | `https://<production domain>/dashboard` |
| Theme colour | `#0284c7` |
| Manifest | `/manifest.json` (192 and 512 maskable icons in `/icons`) |

## Digital Asset Links (already served)
`/.well-known/assetlinks.json` is built from two environment variables and is an empty list until they are set:

```
TWA_PACKAGE_NAME=in.calvy.business
TWA_SHA256_FINGERPRINTS=AA:BB:...:FF           (comma-separated if you have more than one key)
```
Set them in **Vercel → Production** after the signing key exists (below), redeploy, and check `https://<domain>/.well-known/assetlinks.json`. A malformed fingerprint makes the file empty on purpose.

## Build with Bubblewrap (at Pre-launch)
1. Install: `npm i -g @bubblewrap/cli`. It needs JDK 17 and the Android SDK; the first run offers to download both.
2. `mkdir calvy-twa && cd calvy-twa`
3. `bubblewrap init --manifest=https://<production domain>/manifest.json`
   - Application ID: `in.calvy.business`; launcher name "Calvy Business"; start URL `/dashboard`.
   - When asked to create a signing key, accept; **keep the keystore and its passwords in the team password manager, never in git**. Losing it means you can never update the app (unless Play App Signing is on, which it will be).
4. `bubblewrap build` produces `app-release-bundle.aab` (upload this) and a signed `.apk` (for testing).
5. Get the fingerprint: `bubblewrap fingerprint` (or `keytool -list -v -keystore android.keystore`). With **Play App Signing** the fingerprint that matters is the *app signing key* SHA-256 shown in Play Console → Setup → App signing. Put **both** (upload key and app signing key) in `TWA_SHA256_FINGERPRINTS`.
6. Redeploy with the two variables, then verify the link: `bubblewrap fingerprint` / Google's Statement List Tester (`https://developers.google.com/digital-asset-links/tools/generator`). If verification fails Chrome shows an address bar inside the app.
7. Test on a real Android phone: install the `.apk`, open it, check there is no address bar, sign in, install push (alerts need the browser's notification permission: Android shows it inside the TWA).

## Play Console checklist
- [ ] Developer account (one-time fee) with the legal entity's details verified.
- [ ] Create app: name "Calvy Business", default language, "App", "Free".
- [ ] Play App Signing: enabled (default). Upload the `.aab` to an **Internal testing** track first.
- [ ] Store listing: short and full description, 512 px icon (`/icons/icon-512.png`), 1024x500 feature graphic, at least 2 phone screenshots (take them from the installed PWA).
- [ ] App content: privacy policy URL (`/privacy`), ads: none, data safety form (name, email, phone numbers of customers handled for the business; encrypted in transit; deletion on request), target audience (not for children), content rating questionnaire.
- [ ] Account deletion: a link or steps for deleting an account (Settings or support) as Play requires.
- [ ] News/finance/health declarations: answer honestly (appointment booking; online payments are processed by the payment provider, not the app).
- [ ] Countries/regions: India first.
- [ ] Testers: add a closed testing group; Google requires a minimum testing period before production access for new personal accounts.
- [ ] Release to production after testing; keep the keystore backed up.

## What still depends on the domain
Everything above waits for the production domain: the manifest URL given to Bubblewrap, the assetlinks fingerprints, and the push keys (`NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`) in the Production environment.

## Pre-launch: a dedicated, loud "New bookings" notification channel (Android)
A web page cannot choose the sound of a push notification: on Android the sound belongs to the notification **channel**, and a channel's sound can only be set when the channel is created (users can change it later, the app cannot). So decide this **before the first Play Store release**.

1. Turn on **notification delegation** in the TWA (Bubblewrap: `enableNotifications: true` in `twa-manifest.json`, then rebuild). Push messages for the origin are then shown by our app instead of Chrome's generic "Chrome" channel, which lets us own the channel.
2. In the generated Android project create a channel before the first notification, for example `new_bookings` named **New bookings**: importance **HIGH** (heads-up, sound), vibration `[0, 300, 100, 300, 100, 300]`, lock-screen visibility public, and a **custom sound**: copy `public/sounds/new-booking.wav` (the same chime the open app plays) to `res/raw/new_booking.wav` and call `setSound(Uri.parse("android.resource://in.calvy.business/raw/new_booking"), AudioAttributes(USAGE_NOTIFICATION))`. Use a second, quieter channel for daily summaries and reminders so they never share the loud one.
3. Test on a real phone with the app installed from the internal testing track: a new-booking push must play the chime with the screen locked and the phone on normal volume, and stay on screen until tapped (`requireInteraction`).
4. Check Play's "notification permission" prompt on Android 13+: the app asks for it, so keep the existing "tap to turn on phone alerts" flow as the trigger.
Until the TWA exists, Android uses Chrome's own channel: tell people to open Chrome notification settings → Calvy Business → Sound and Pop on screen (the checklist on Settings → Phone alerts says so).

