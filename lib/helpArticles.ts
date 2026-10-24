import { SUPPORT_EMAIL } from "@/lib/site";

export interface HelpArticle {
  slug: string;
  title: string;
  category: string;
  excerpt: string;
  keywords: string[];
  body: string; // markdown
}

export const HELP_CATEGORIES = [
  "Getting Started",
  "Booking Flow",
  "Billing & Plans",
  "Payments & Razorpay",
  "Account & Notifications",
] as const;

export const HELP_ARTICLES: HelpArticle[] = [
  // ─── Getting Started ──────────────────────────────────────────────
  {
    slug: "getting-started-with-calvy",
    title: "Getting started with Calvy",
    category: "Getting Started",
    excerpt: "Create your account and get a working booking page in about a minute.",
    keywords: ["signup", "start", "onboarding", "new account", "setup"],
    body: `Welcome to Calvy! You can be taking online bookings in under a minute.

## 1. Create your account
Go to the signup page and enter your name, business name, email, password, and region. You can also **Continue with Google** — that skips the password and verifies your email automatically.

## 2. Verify your email
If you signed up with email and password, check your inbox for a verification link and click it. (Google sign-ups are already verified.)

## 3. Finish setup
Add your **services**, **staff**, and **working hours** from the dashboard. Calvy automatically creates a starter service and an "Owner" staff member so you have something to edit.

## 4. Share your link
Your booking page is instantly live at your own link. Share it on Instagram, WhatsApp, or your website and start taking bookings.

That's it — no website, no developer, no design work needed.`,
  },
  {
    slug: "set-up-your-booking-page",
    title: "Setting up your booking page",
    category: "Getting Started",
    excerpt: "Customize your public booking page — branding, description, and services.",
    keywords: ["booking page", "branding", "customize", "public page", "website"],
    body: `Your booking page is what clients see when they book. To customize it, open **Dashboard → Website** (and **Settings** for branding).

## What you can edit
- **Business name, description, and logo/colors** (branding options depend on your plan)
- **Services** shown to clients, with prices and durations
- **Staff** clients can choose from
- **Availability** (your working hours and slot intervals)

## Your link
Your page lives on your own Calvy link. Anyone with the link can book — no app or account required for your clients.

> Tip: keep service names clear and prices accurate. Clients decide in seconds, so make it easy to pick.`,
  },
  {
    slug: "add-and-edit-services",
    title: "Adding and editing your services",
    category: "Getting Started",
    excerpt: "Create the services clients can book, with price, duration, and capacity.",
    keywords: ["services", "price", "duration", "capacity", "add service"],
    body: `Services are what your clients book. Manage them in **Dashboard → Services**.

## Add a service
Click **Add service** and set:
- **Name** (e.g. "Haircut & Style")
- **Duration** in minutes — this controls how long the slot blocks your calendar
- **Price**
- **Capacity** — set above 1 for group sessions/classes (see *group bookings*)

## Edit or remove
Edit any service inline. If a service already has appointments, deleting it **deactivates** it instead (so your history stays intact).

Your plan determines how many services you can have — see *Calvy plans explained*.`,
  },
  {
    slug: "add-staff-and-working-hours",
    title: "Adding staff and working hours",
    category: "Getting Started",
    excerpt: "Add team members and set each person's availability.",
    keywords: ["staff", "team", "working hours", "availability", "schedule"],
    body: `Add your team in **Dashboard → Staff**, and set availability in **Settings → Availability**.

## Staff
Each staff member has their own name, role, and working hours. Clients can pick a specific person when booking (or "any available").

## Working hours & slot interval
In **Settings → Availability** you set the days and hours you're open, and your **slot interval** (e.g. every 15, 30, or 60 minutes). Calvy only offers clients times that fit within your hours and don't overlap existing bookings.

The number of staff you can add depends on your plan.`,
  },

  // ─── Booking Flow ─────────────────────────────────────────────────
  {
    slug: "how-clients-book-an-appointment",
    title: "How clients book an appointment",
    category: "Booking Flow",
    excerpt: "What your clients experience, step by step, on your booking page.",
    keywords: ["client", "book", "appointment", "flow", "how to book"],
    body: `Booking with Calvy takes your clients about 30 seconds.

## The client journey
1. They open your booking link.
2. They pick a **service** (and staff member, if you offer choices).
3. They choose a **date and time** from your live availability.
4. They enter their **name, email, and phone**.
5. Depending on your payment mode, they either **pay online** (prepaid) or simply **confirm** (postpaid).

## After booking
- The client gets a **confirmation email** (and WhatsApp, on supported plans).
- You get a **notification** in your dashboard (and a push notification if enabled).
- The appointment appears on your **calendar** automatically.

Calvy validates every booking on our server, so two clients can never grab the same slot.`,
  },
  {
    slug: "share-your-booking-link",
    title: "Sharing your booking link",
    category: "Booking Flow",
    excerpt: "Where to put your link to get the most bookings.",
    keywords: ["share", "link", "instagram", "whatsapp", "bio", "qr"],
    body: `Your booking page only works if people can find it. Put your link everywhere clients look for you:

- **Instagram / TikTok bio** — the single most effective spot
- **WhatsApp** status and auto-reply
- **Google Business Profile** ("Book" / website link)
- **Your existing website**, as a "Book now" button
- **Email signature**

> Tip: when someone messages you to book, just reply with your link instead of going back and forth on times. Most clients prefer booking themselves.`,
  },
  {
    slug: "prepaid-vs-postpaid-bookings",
    title: "Prepaid vs postpaid bookings",
    category: "Booking Flow",
    excerpt: "Choose whether clients pay online when booking or at the visit.",
    keywords: ["prepaid", "postpaid", "payment mode", "deposit", "pay online"],
    body: `Calvy supports two payment modes, set in **Settings → Payout**.

## Postpaid (default)
Clients book without paying. You collect at the visit and mark the appointment as paid. Best when you're getting started or don't want online payments yet.

## Prepaid
Clients **pay online at the moment they book**. This dramatically reduces no-shows because people who pay show up. Prepaid requires:
- A supported plan with online payments
- Your **bank/KYC details** added, and **Razorpay** connected

To switch to prepaid, add your bank details in **Settings → Payout**, then select **Prepaid**.`,
  },
  {
    slug: "manage-and-reschedule-appointments",
    title: "Managing and rescheduling appointments",
    category: "Booking Flow",
    excerpt: "View, update status, reschedule, or cancel bookings from your dashboard.",
    keywords: ["manage", "reschedule", "cancel", "status", "appointments", "calendar"],
    body: `All your bookings live in **Dashboard → Appointments** and **Calendar**.

## What you can do
- **Change status**: confirmed, completed, cancelled, or no-show
- **Mark payment**: paid / unpaid
- **View details**: client, service, staff, time, price, notes
- **Cancel**: cancelled appointments free the slot again

## Rescheduling
Open the appointment and update its time. Cancelled and no-show appointments are excluded from your revenue and no longer block that slot.

Your calendar updates instantly, and conflicting times are blocked automatically.`,
  },
  {
    slug: "group-bookings-and-capacity",
    title: "Setting up group bookings and capacity",
    category: "Booking Flow",
    excerpt: "Let multiple clients book the same slot for classes and group sessions.",
    keywords: ["group", "capacity", "class", "multiple", "session"],
    body: `For classes or group sessions, set a service's **capacity** above 1 (in **Dashboard → Services**).

## How it works
- Capacity **1** = a normal one-to-one appointment; any overlap blocks the slot.
- Capacity **>1** = multiple clients can book the **same start time** until the spots run out.

Calvy shows clients how many spots are left and stops accepting bookings once the slot is full. Group booking availability depends on your plan.`,
  },
  {
    slug: "reduce-no-shows-with-reminders",
    title: "Reducing no-shows with reminders",
    category: "Booking Flow",
    excerpt: "How Calvy's automatic reminders and prepayment cut no-shows.",
    keywords: ["no-show", "reminder", "reminders", "whatsapp", "email reminder"],
    body: `No-shows are the most expensive scheduling problem — and the easiest to fix.

## Automatic reminders
Calvy automatically reminds clients before their appointment by **email**, **WhatsApp**, and **push** (channels depend on your plan). Reminders go out the day before — nothing to send manually.

## Prepayment
Switch to **prepaid** bookings so clients pay when they book. People who've paid show up. See *Prepaid vs postpaid bookings*.

## Combine both
Reminders + prepayment together is the most effective setup for keeping your calendar full and your revenue protected.`,
  },

  // ─── Billing & Plans ──────────────────────────────────────────────
  {
    slug: "calvy-plans-explained",
    title: "Calvy plans explained",
    category: "Billing & Plans",
    excerpt: "What each plan includes — Free, Starter, Professional, and Business.",
    keywords: ["plans", "pricing", "free", "starter", "professional", "business", "features"],
    body: `Calvy has four plans. The **Free** plan is lifetime free — no card required.

## What changes between plans
Higher plans raise your limits and unlock features such as:
- More **staff**, **services**, and **monthly bookings**
- **Online payments**, **wallet & withdrawals**
- **WhatsApp reminders**, **broadcasts**, **analytics**
- **Custom branding**, **chatbot widget**, **group booking**
- **Remove "Powered by Calvy"** and **priority support** on the top tier

See the live pricing and full feature comparison on the **Pricing** section of our homepage, or in **Dashboard → Billing**.`,
  },
  {
    slug: "how-to-upgrade-your-plan",
    title: "How to upgrade your plan",
    category: "Billing & Plans",
    excerpt: "Upgrade to unlock more staff, payments, and features.",
    keywords: ["upgrade", "plan", "subscribe", "billing", "pay"],
    body: `Upgrade any time from **Dashboard → Billing**.

## Steps
1. Open **Billing** and choose **monthly** or **annual** (annual is cheaper).
2. Pick a plan and click upgrade.
3. You'll be taken to a secure **Razorpay** checkout to start your subscription.
4. Once payment is confirmed, your plan and limits update automatically.

If your plan doesn't update within a minute, use the **Sync** button on the Billing page to refresh it from Razorpay.`,
  },
  {
    slug: "change-or-cancel-subscription",
    title: "Changing or cancelling your subscription",
    category: "Billing & Plans",
    excerpt: "Switch plans or cancel — and what happens to your access.",
    keywords: ["cancel", "downgrade", "change plan", "subscription", "unsubscribe"],
    body: `Manage your subscription in **Dashboard → Billing**.

## Cancel
Click **Cancel subscription**. You keep your paid features until the **end of the current billing period**, then your account moves to the Free plan. No cancellation fees.

## Change plans
Upgrading or switching plans starts a new subscription and cancels the previous one so you're not billed twice.

Your data, bookings, and clients are never deleted when you downgrade — some features just become unavailable until you upgrade again.`,
  },
  {
    slug: "why-is-my-subscription-billed-in-usd",
    title: "Why is my subscription billed in USD?",
    category: "Billing & Plans",
    excerpt: "Platform subscription prices are shown and charged in USD.",
    keywords: ["usd", "currency", "subscription", "billing currency", "dollars"],
    body: `Your **Calvy subscription** (the platform fee) is priced and billed in **US Dollars (USD)** for everyone, so pricing is consistent worldwide.

This is separate from **your own business payments**. The money your clients pay you for bookings is always handled in **your configured currency** (for example, INR) — only the Calvy subscription itself is in USD.

You can see your plan price on the **Pricing** section and in **Dashboard → Billing**.`,
  },
  {
    slug: "fix-a-failed-subscription-payment",
    title: "Fixing a failed subscription payment",
    category: "Billing & Plans",
    excerpt: "What to do if your plan shows past due or a payment didn't go through.",
    keywords: ["failed payment", "past due", "declined", "subscription", "card"],
    body: `If a subscription charge fails, your plan status may show **past due**.

## How to fix it
1. Open **Dashboard → Billing**.
2. Click **Sync** to refresh the latest status from Razorpay.
3. If it's still past due, re-subscribe to the plan — you'll be taken to a fresh Razorpay checkout to update payment.

Common causes are an expired card, insufficient funds, or a bank decline. Using a different card usually resolves it. Your data is safe during this time.`,
  },
  {
    slug: "refunds-and-refund-policy",
    title: "Refunds and our refund policy",
    category: "Billing & Plans",
    excerpt: "When subscription refunds apply, and how booking refunds work.",
    keywords: ["refund", "money back", "cancel refund", "policy"],
    body: `## Subscription refunds
Subscription fees are billed in advance and are generally non-refundable, but we may issue a refund for a duplicate charge, a verified technical issue on our side, or a charge made after a valid cancellation. Annual plans can be fully refunded within the first 7 days if largely unused. To request one, email **${SUPPORT_EMAIL}** from your account email.

## Booking refunds (your clients)
When a client pays you for a booking, **you** handle any refund to that client — Calvy provides the payment technology but isn't a party to that transaction. Refund a client's booking payment from your Razorpay dashboard.

Full details are on our **Refund Policy** page.`,
  },

  // ─── Payments & Razorpay ──────────────────────────────────────────
  {
    slug: "connect-razorpay-to-accept-payments",
    title: "Connecting Razorpay to accept payments",
    category: "Payments & Razorpay",
    excerpt: "Set up Razorpay so clients can pay online when they book.",
    keywords: ["razorpay", "connect", "payments", "online payment", "setup", "keys"],
    body: `Calvy uses **Razorpay** to collect online (prepaid) booking payments.

## What you need
1. A **Razorpay account** (razorpay.com) — test mode is fine to start.
2. Your **bank/KYC details** added in **Settings → Payout**.
3. Choose **Prepaid** as your booking payment mode.

Once prepaid is enabled, clients who book are sent to a secure Razorpay payment page. After they pay, Calvy confirms the booking and notifies you automatically.

For automatic payouts to your own bank, see *Setting up automatic payouts (Razorpay Route)*.`,
  },
  {
    slug: "set-up-automatic-payouts-razorpay-route",
    title: "Setting up automatic payouts (Razorpay Route)",
    category: "Payments & Razorpay",
    excerpt: "Get booking payments sent straight to your bank automatically.",
    keywords: ["payout", "route", "automatic", "linked account", "kyc", "settlement"],
    body: `With **Razorpay Route**, prepaid booking payments are split to your own linked account automatically — no manual withdrawals.

## Steps
1. In **Settings → Payout**, fill in your **Business KYC** (legal name, business type, PAN, GST if any, registered address) and **bank details (account number + IFSC)**.
2. Click **Connect for automatic payouts**.
3. Razorpay verifies your details. Once your status shows **Active**, payments from bookings are transferred to your account at checkout.

> Note: **Razorpay Route must be enabled on your Razorpay account** for this to work. If you see "Route feature not enabled," activate Route from your Razorpay dashboard (or contact Razorpay support), then click Connect again.`,
  },
  {
    slug: "configure-razorpay-webhooks",
    title: "Configuring Razorpay webhooks",
    category: "Payments & Razorpay",
    excerpt: "Webhooks let Razorpay tell Calvy when a payment succeeds.",
    keywords: ["webhook", "razorpay", "signature", "secret", "events", "payment_link.paid"],
    body: `Webhooks are how Razorpay notifies Calvy that a payment or subscription event happened. Without them, a payment can succeed but the booking/plan won't update.

## Set up two webhooks (Razorpay → Settings → Webhooks)
| Endpoint | Events |
|---|---|
| \`https://calvy.io/api/razorpay/webhook\` | \`payment_link.paid\` |
| \`https://calvy.io/api/billing/webhook\` | all \`subscription.*\` events |

For each webhook, set a **secret**, and make sure the **same secret** is configured for Calvy. After saving, send a test event and confirm it returns **200** in Razorpay's "Recent Deliveries".

If bookings or plans aren't updating after payment, a missing or mismatched webhook secret is the most common cause.`,
  },
  {
    slug: "client-paid-but-no-booking",
    title: "A client paid but I didn't get the booking",
    category: "Payments & Razorpay",
    excerpt: "What to check when a payment went through but no appointment appeared.",
    keywords: ["paid", "no booking", "missing", "payment received", "webhook"],
    body: `If a client paid but the appointment didn't appear, the cause is almost always the **booking webhook**.

## Checklist
1. **Razorpay → Webhooks → Recent Deliveries**: is the \`payment_link.paid\` event returning **200**? A **400** means the webhook secret is missing or doesn't match.
2. Confirm the booking webhook secret in Razorpay matches the one configured for Calvy.
3. Open the appointment list — Calvy also has a **fallback** that creates the appointment when the client lands on the success page, so it may appear shortly after.

Once the webhook returns 200, paid bookings appear instantly. See *Configuring Razorpay webhooks*.`,
  },
  {
    slug: "wallet-balance-and-withdrawals",
    title: "Wallet balance and withdrawals",
    category: "Payments & Razorpay",
    excerpt: "How your wallet balance is calculated and how withdrawals work.",
    keywords: ["wallet", "withdraw", "balance", "payout", "earnings"],
    body: `If you collect prepaid payments **without** automatic Route payouts, the funds are tracked as your **wallet balance** in **Dashboard → Wallet**.

## How the balance works
Your withdrawable balance = **paid prepaid bookings − amounts already withdrawn**. Payments paid out automatically via Razorpay Route are **not** counted here (they already went to your bank).

## Withdrawing
Add your bank details in **Settings → Payout**, then request a withdrawal from the Wallet page. Withdrawals are reviewed and released by our team.

For instant, automatic settlement instead, set up *Razorpay Route* payouts.`,
  },
  {
    slug: "test-payments-with-razorpay-test-mode",
    title: "Testing payments with Razorpay test mode",
    category: "Payments & Razorpay",
    excerpt: "Try the full payment flow safely using Razorpay test cards.",
    keywords: ["test mode", "test card", "sandbox", "razorpay", "testing"],
    body: `Before going live, test the whole flow using **Razorpay test mode** (test API keys, \`rzp_test_…\`).

## Test card
- **Card:** 4111 1111 1111 1111
- **Expiry:** any future date · **CVV:** any 3 digits
- **OTP:** use \`1234\` or choose "Success" on the test page

## Test UPI
- Success: \`success@razorpay\` · Failure: \`failure@razorpay\`

Test mode uses **INR**, so keep your business currency on INR while testing. When you're ready, switch to your **live** Razorpay keys, re-create your webhooks for live mode, and complete Razorpay activation/KYC.`,
  },

  // ─── Account & Notifications ──────────────────────────────────────
  {
    slug: "enable-push-notifications",
    title: "Enabling push notifications (incl. iPhone)",
    category: "Account & Notifications",
    excerpt: "Get instant booking alerts on your phone — even when the app is closed.",
    keywords: ["push", "notifications", "iphone", "ios", "pwa", "install", "android"],
    body: `Push notifications alert you the moment a booking comes in — even with the app closed.

## Enable on any device
Open your dashboard, tap the **🔔 bell**, and choose **Enable push notifications**, then **Allow**.

## iPhone (important)
On iPhone, web push only works from an **installed app**, not a Safari tab:
1. Open **calvy.io** in Safari and log in to your dashboard.
2. Tap **Share → Add to Home Screen**.
3. Open the app **from your Home Screen**, then tap **Enable notifications** and **Allow**.

Requires iOS 16.4+. If notifications are silenced, also check **iOS Settings → Notifications → Calvy** and any **Focus** mode.

## Android / Desktop
Works in Chrome and most browsers once you've allowed notifications. On Android, installing the app to your home screen gives the most reliable delivery.`,
  },
  {
    slug: "not-receiving-emails",
    title: "Not receiving emails?",
    category: "Account & Notifications",
    excerpt: "Troubleshoot missing confirmation, reminder, or verification emails.",
    keywords: ["email", "not received", "spam", "verification", "confirmation", "deliverability"],
    body: `If you or your clients aren't getting emails (confirmations, reminders, or verification links):

## Check these first
1. **Spam / Promotions folder** — move Calvy to your primary inbox and mark "Not spam".
2. **Correct address** — confirm the email was typed correctly.
3. **Verification link** — new accounts must click the verification email before logging in. Don't see it? Try signing up again or **Continue with Google** (auto-verified).

## Still nothing?
Email delivery can occasionally be delayed. If it persists across multiple recipients, contact **${SUPPORT_EMAIL}** and we'll investigate.`,
  },
];

export function getArticle(slug: string): HelpArticle | undefined {
  return HELP_ARTICLES.find(a => a.slug === slug);
}

export function articlesByCategory(category: string): HelpArticle[] {
  return HELP_ARTICLES.filter(a => a.category === category);
}
