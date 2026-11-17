# WhatsApp "Connect WhatsApp" (Meta Embedded Signup)

Calvy is a Meta **Tech Provider** with ONE Meta app per environment. A business owner presses **Connect WhatsApp** in
Settings > WhatsApp, finishes Meta's pop-up, and Calvy does the rest. The manual path (own System User token and app
secret, own webhook URL) stays under **Advanced** and keeps working unchanged.

## What the code does

1. **Browser**: Facebook JS SDK `FB.login` with `config_id`, `response_type: "code"`, `sessionInfoVersion: "3"`. The page listens for
   `WA_EMBEDDED_SIGNUP` messages (only from facebook.com origins) to get `waba_id` and `phone_number_id`, and shows cancel/error states.
   Two buttons: **Connect my existing WhatsApp Business app number** (adds `featureType: "whatsapp_business_app_onboarding"`, i.e. coexistence)
   and **Use a new number**.
2. **Server** `POST /api/settings/whatsapp/embedded` (owner only, plan with `whatsappReminders`, via `getBusinessFeatures`/`applyEnforcement`):
   exchanges the code with the Calvy app secret, stores the business token AES-GCM encrypted, `POST /{waba}/subscribed_apps`, registers the
   number (new-number mode only) with a generated 6-digit PIN stored encrypted, reads name/quality/limit/name review/payment status, installs
   the Calvy templates.
3. **Two-step verification**: if the number already has a PIN, the page asks for it (`POST /api/settings/whatsapp/embedded/pin`). PINs are
   never returned or logged.
4. **Webhook** `/api/whatsapp/webhook` (one URL for all businesses): GET handshake with `META_WEBHOOK_VERIFY_TOKEN`; POST verified with
   `META_APP_SECRET` over the RAW body; routed by `phone_number_id` (messages, statuses) or WABA id (templates, quality, account updates);
   each event applied once (`WhatsAppWebhookEvent`, pruned after 7 days); unknown ids are logged and answered 200. Status, STOP opt-out,
   `message_template_status_update` and `template_category_update` use the same handlers as the manual webhook
   (`/api/whatsapp/webhook/[key]`, which refuses embedded rows).
5. **After connect**: Settings shows the payment-method status (link to WhatsApp Manager; Meta bills the business) and the display-name review status.
6. **Disconnect**: `DELETE /{waba}/subscribed_apps`, then the config, tokens and PIN are deleted. If Meta cannot be reached the local delete still happens and the owner is told.

## Environment variables

| Name | Where | Notes |
| --- | --- | --- |
| `META_APP_ID` | server | App ID of the Calvy app. Also passed to the page as a prop (public). |
| `META_APP_SECRET` | server only | App secret: code exchange and webhook signatures. Never in the browser. |
| `META_ES_CONFIG_ID` | server | Embedded Signup configuration ID (from step 6 below). Passed to the page as a prop. |
| `META_WEBHOOK_VERIFY_TOKEN` | server | Any long random string; paste the same one into Meta. |
| `WA_COEXISTENCE_ENABLED` | server | `true` shows "Connect my existing WhatsApp Business app number". Off (unset) by default: the page offers only "Use a new number" and the server refuses coexistence. Turn on once Meta enables coexistence for the app. |
| `SITE_URL` | server | Already used for canonical URLs; the webhook URL is built from it. |

Without the first three the Connect buttons are hidden and only Advanced is shown. One Meta app per environment (production, preview/dev): use separate values per Vercel environment.

## Meta-side setup, in click order

Use the existing "calvy test" app for now.

**A. The app**
1. developers.facebook.com > **My Apps** > open "calvy test" > **App settings > Basic**.
2. **Display name**: change to `Calvy`.
3. **App icon**: upload a 1024x1024 PNG (the Calvy mark, `public/icons`).
4. **App domains**: your site domain (`calvy-v2.vercel.app` now, `calvy.io` later; add both when it moves).
5. **Privacy policy URL**: `{SITE_URL}/privacy`. **Terms of Service URL**: `{SITE_URL}/terms`.
6. **User data deletion**: choose "Data deletion instructions URL" and use `{SITE_URL}/privacy` (the Privacy page says how to request deletion). Use a dedicated page later if Meta objects.
7. **Category**: Business and pages (or Messaging). Contact email: the support mailbox (`support@calvy.io`).
8. **Business Portfolio**: link the app to the verified **Raybit Technologies** Business Portfolio (App settings > Basic > Business portfolio, or business.facebook.com > Settings > Accounts > Apps > Add).
9. **Add products**: App Dashboard > **Add product** > **WhatsApp** and **Facebook Login for Business**.

**B. Tech Provider**
10. business.facebook.com > **Settings > Security Center / WhatsApp Business Platform**: complete **Tech Provider onboarding** (accept the Tech Provider terms; the portfolio must be business-verified). In the App Dashboard, **WhatsApp > Onboarding** guides the same steps.
11. Add yourself/Raybit as the **WhatsApp Business Account admin** where Meta asks.

**C. Embedded Signup configuration**
12. App Dashboard > **Facebook Login for Business > Configurations > Create configuration**.
13. Login variation: **WhatsApp Embedded Signup**. Token: **Business integration system user access token** (long-lived).
14. Assets: **WhatsApp accounts**. Permissions: `whatsapp_business_management`, `whatsapp_business_messaging`.
15. Save, then copy the **Configuration ID** into `META_ES_CONFIG_ID`.
16. **Facebook Login for Business > Settings**: turn on **Login with the JavaScript SDK**; add the site origin(s) to **Allowed domains for the JavaScript SDK** and the site URL(s) to **Valid OAuth redirect URIs** (production and preview hosts you test on).

**D. Webhook**
17. **WhatsApp > Configuration > Webhook > Edit**: Callback URL `{SITE_URL}/api/whatsapp/webhook`, Verify token = `META_WEBHOOK_VERIFY_TOKEN` > **Verify and save**. (Deploy the code first or the handshake fails.)
18. Under **Webhook fields**, subscribe: `messages`, `message_template_status_update`, `template_category_update`, `message_template_quality_update`, `phone_number_quality_update`, `phone_number_name_update`, `account_update`, and for coexistence `history`, `smb_app_state_sync`, `smb_message_echoes`.
    Calvy calls `POST /{waba}/subscribed_apps` for every business it connects, so each WABA's events reach this one callback.

**E. App Review (advanced access)**
19. App Dashboard > **App Review > Permissions and features**: request **Advanced access** for `whatsapp_business_management` and `whatsapp_business_messaging`. Meta asks for a screencast of the Connect WhatsApp flow, a test business login and a description of how Calvy uses the permissions (booking confirmations and reminders to customers who opted in).
20. Complete **Data use checkup** and business verification if prompted. Wait for approval (days).

**F. Publish**
21. App Settings > Basic must show the privacy, terms and data-deletion URLs, icon and category (steps 2-8).
22. Toggle the app mode from **Development** to **Live** (top bar). Until Live and approved, only people with a role on the app can complete the flow.

## Coexistence (existing WhatsApp Business app number)

Uses `featureType: "whatsapp_business_app_onboarding"` with `sessionInfoVersion: "3"` (Meta's "onboarding WhatsApp Business app users" flow); the finish event is `FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING`. Calvy does **not** call `/register` in this mode: the number is already registered in the app and re-registering would break coexistence.

Limits Meta imposes (check Meta's current page before launch; they change):
- The WhatsApp Business app must be opened at least every ~13 days or the link to the API is dropped (the owner must reconnect).
- Disappearing messages, view-once and live location are turned off in one-to-one chats; broadcast lists become read-only.
- Sending through the API is capped at about 20 messages per second.
- Official business account (blue tick) status is not available.
- Not available for every country or number; Meta shows an error in the pop-up when a number is not eligible.
- Business app version must be recent (Meta requires an up-to-date WhatsApp Business app).
- One number per WABA, and a number can be linked to one partner at a time.

The coexistence webhook fields `history`, `smb_app_state_sync` and `smb_message_echoes` are verified like any delivery and answered 200. Only sync state is kept (time of the last echo / contact sync, history-import progress); no message text, contact or number is stored, and echoes (messages the business sent from the app) are never treated as customer replies or STOP opt-outs. If Meta refuses an existing-app number with error 3441107 or 3441072, the owner sees "Existing WhatsApp Business app numbers aren't supported yet" instead of Meta's text.

Calvy only sends templates and reads delivery status and STOP replies, so none of this changes how reminders work, but the limits are also shown in Settings.

## Migrating a manual connection

Disconnect (Settings > WhatsApp > Advanced > Disconnect), then press Connect WhatsApp. Calvy refuses to connect over a manual row so credentials are never silently replaced. After disconnecting, remove Calvy's per-business webhook in the old Meta app if you no longer use it. The same number can then be connected through Calvy; the owner may need to remove it from the old app first (Meta allows a number on one WABA/app setup at a time).

## Billing

Meta bills the business, not Calvy. After connecting, the owner is guided to **Add a payment method in WhatsApp Manager**. Calvy reads the WABA's `primary_funding_id`: present = "a payment method is on file", absent = a warning. If Meta does not return it, the page shows neutral text (status UNKNOWN), never a false warning.

## Verified vs assumed (check at first live connect)

- Verified from Meta docs: coexistence `featureType`, session info v3, the `FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING` event.
- Not verified without a live Meta account: the exact Graph fields `is_pin_enabled`, `name_status` and `primary_funding_id`, the PIN error code 133005, and the `account_update` event names. The code treats missing or unexpected values as UNKNOWN and never fails the connection because of them.
