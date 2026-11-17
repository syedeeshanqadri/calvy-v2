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
  "Payments",
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
5. Depending on your plan and payment options, they pay a **Rs 10 confirmation fee**, pay **online** to your own gateway, or simply **confirm** and pay at the visit.

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
    slug: "how-customers-pay",
    title: "How customers pay",
    category: "Booking Flow",
    excerpt: "Choose whether clients pay at the venue, in full online, or an advance.",
    keywords: ["pay online", "advance", "deposit", "pay at venue", "payment option"],
    body: `Where a client pays depends on your plan.

## Basic plan
Clients pay a **Rs 10 confirmation fee** online when they book, and pay for the service **at the venue**. The Rs 10 is Calvy's. If the booking is cancelled or the client doesn't attend, the Rs 10 is kept, the booking shows **Not attended — confirmation still valid**, and the client can rebook **once** at your business without paying the Rs 10 again.

## Pro and Business plans
There is **no Rs 10 fee**. You connect **your own payment gateway** (**Settings → Payments → Add payment gateway**), and clients pay straight into your account. Calvy never holds your money. Choose what clients pay:
- **Pay at venue**: nothing online.
- **Pay online in full**.
- **Advance**: a fixed amount or a percentage online, the rest at the venue.

You can set a different option for a single service.`,
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
Take a payment when clients book (a Rs 10 confirmation fee on Basic, or an advance into your own gateway on Pro and Business). People who've paid show up. See *How customers pay*.

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
- **Online payments** into your own gateway (no Rs 10 fee)
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
1. Open **Billing** to see your current plan.
2. Ask support to change it.
3. Online subscription payments are coming soon. For now, email **support@calvy.io** and we will switch your plan.`,
  },
  {
    slug: "change-or-cancel-subscription",
    title: "Changing or cancelling your subscription",
    category: "Billing & Plans",
    excerpt: "Switch plans or cancel — and what happens to your access.",
    keywords: ["cancel", "downgrade", "change plan", "subscription", "unsubscribe"],
    body: `Plan changes are handled by our team for now: email **support@calvy.io**.

## Cancel
Ask support to cancel. You keep your paid features until the **end of the current billing period**, then your account moves to the Free plan. No cancellation fees.

## Change plans
Upgrading or switching plans is done by support, so you're not billed twice.

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
1. Email **support@calvy.io** with your business name.
2. We will check the status and send you a fresh payment link.

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
When a client pays you for a booking, **you** handle any refund to that client — Calvy provides the payment technology but isn't a party to that transaction. Refund a client's booking payment from **Payments → Refund** (it uses your own payment gateway).

Full details are on our **Refund Policy** page.`,
  },

  // ─── Payments ──────────────────────────────────────────
  {
    slug: "connect-your-payment-gateway",
    title: "Connecting your payment gateway",
    category: "Payments",
    excerpt: "Add Razorpay, Cashfree or PhonePe so clients pay straight into your account.",
    keywords: ["gateway", "razorpay", "cashfree", "phonepe", "connect", "keys", "payments"],
    body: `Available on the **Pro and Business** plans (India).

## Steps
1. Open **Settings → Payments → Add payment gateway**.
2. Pick **Razorpay**, **Cashfree** or **PhonePe PG**. A short guide shows where the keys are in that dashboard, with links.
3. Choose **Test** or **Live** mode, paste the keys, and click **Save and verify**. Calvy makes a real, lightweight call to confirm the keys work, and shows **Connected** or the reason it failed.
4. Copy the **webhook URL** shown and paste it into the provider's dashboard (the screen says exactly where). This is how your gateway tells Calvy a payment succeeded.
5. Choose **how customers pay** below it: at the venue, in full online, or an advance.

You can add more than one gateway, make one the **default**, and enable or disable each. Your keys are encrypted and never shown again.`,
  },
  {
    slug: "refund-a-customer-payment",
    title: "Refunding a customer's payment",
    category: "Payments",
    excerpt: "Refund an online payment through your own gateway, or mark it refunded manually.",
    keywords: ["refund", "customer", "gateway", "manual"],
    body: `Open **Payments**, find the booking, and click **Refund**. Calvy asks your gateway to refund the customer.

If the gateway can't do it (or you already refunded the customer yourself, for example from the gateway's dashboard or in cash), you are offered **Mark refunded manually**, which only records it in Calvy.

Calvy's **Rs 10 confirmation fee** (Basic plan) is not refunded from here: it is kept when a booking is cancelled or not attended.`,
  },
  {
    slug: "gateway-webhooks",
    title: "Gateway webhooks",
    category: "Payments",
    excerpt: "Webhooks let your gateway tell Calvy when a payment succeeds.",
    keywords: ["webhook", "signature", "secret", "events", "payment"],
    body: `A webhook is how your gateway tells Calvy that a payment succeeded. Each gateway you add has its **own webhook URL** (shown in **Settings → Payments**, with a copy button). Calvy checks each message with **your own** secret, so nobody else can confirm a payment.

| Gateway | Where to paste it | What to tick |
|---|---|---|
| Razorpay | Account & Settings → Webhooks → Add New Webhook (choose a secret, then enter the same secret in Calvy) | \`payment_link.paid\` |
| Cashfree | Developers → Webhooks → Add Webhook Endpoint | Payment success, failed, user dropped |
| PhonePe | Developer Settings → Webhook (choose a username and password, then enter them in Calvy as username:password) | order completed, order failed |

Without a webhook the customer still pays, and the booking is confirmed when they come back to the page.`,
  },
  {
    slug: "client-paid-but-no-booking",
    title: "A client paid but I didn't get the booking",
    category: "Payments",
    excerpt: "What to check when a payment went through but no appointment appeared.",
    keywords: ["paid", "no booking", "missing", "payment received", "webhook"],
    body: `If a client paid but the appointment didn't appear, the cause is almost always the **booking webhook**.

## Checklist
1. In your gateway's dashboard, open the webhook deliveries: is the payment event returning **200**? A **401** means the webhook secret (or username:password) doesn't match what you entered in Calvy.
2. Confirm the webhook URL in your gateway is the one shown in **Settings → Payments** for that gateway.
3. Open the appointment list — Calvy also has a **fallback** that creates the appointment when the client lands on the success page, so it may appear shortly after.

Once the webhook returns 200, paid bookings appear instantly. See *Gateway webhooks*.`,
  },
  {
    slug: "kept-confirmation-fee",
    title: "Not attended: the Rs 10 confirmation fee",
    category: "Payments",
    excerpt: "What happens to the Rs 10 when a booking is cancelled or not attended.",
    keywords: ["not attended", "no show", "confirmation fee", "rebook", "rs 10"],
    body: `On the Basic plan, the Rs 10 confirmation fee is **never refunded** when a confirmed booking is cancelled or not attended. The booking shows **Not attended — confirmation still valid**.

The customer can **rebook once** at your business without paying the Rs 10 again (or use a free follow-up if you enabled them). There is no wallet balance and nothing to withdraw.`,
  },
  {
    slug: "test-payments-in-test-mode",
    title: "Testing payments in test mode",
    category: "Payments",
    excerpt: "Try the full payment flow safely before going live.",
    keywords: ["test mode", "sandbox", "test card", "testing"],
    body: `Add your gateway in **Test mode** (test keys from the provider's dashboard) and book on your own page. Use the test cards or UPI IDs from your provider's documentation. When you're ready, add the gateway again in **Live mode** with live keys and make it the default.

Keep your business currency on INR while testing.`,
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
