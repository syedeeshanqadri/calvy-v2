# Calvy — Product Specification (as built)

**What this document is:** a plain-language description of what Calvy actually does today, written from the source code, not from the README or the marketing website. File paths in [square brackets] point to where each thing lives, for anyone who wants to check.

**How it was written:** by reading the code and by opening the running app on a laptop and phone-sized screen (screenshots are in `docs/audit/screenshots/`). It was not tested with real email, WhatsApp, push or payment accounts, so "Working" means "the feature is built and reachable", not "proven in production". Where the website promises something the code does not do, this document says so in plain words.

**Status words used in the tables**
- **Working**: built, reachable, does what it says.
- **Partial**: built but missing important pieces or has a known problem.
- **Broken**: built but does not do its job.
- **Unreachable**: code exists but nothing in the app lets anyone use it.
- **Promised, missing**: the website or docs say it exists; the code has nothing.

**Companion documents:** problems and risks are in [audit/01-frontend-ux.md](audit/01-frontend-ux.md), [audit/02-backend.md](audit/02-backend.md) and [audit/03-product.md](audit/03-product.md). The fix list is [PLAN.md](PLAN.md). This document describes; those documents judge.

---

## 1. What Calvy is

Calvy is an online appointment-booking service for small businesses that sell time: salons, clinics, spas, coaches, trainers. A business owner signs up, adds the services they offer, and gets a ready-made booking page and a simple website at their own web address (for example `glow-studio.calvy.io`). Their clients open that page on a phone, pick a service and a time, and book without making an account. The owner manages everything from a dashboard: a calendar, a list of bookings, clients, staff, services, expenses and (on paid plans) reports, messages to clients and online payments.

**Who it is for:** owner-run service businesses, one location, from a solo practitioner to a small team.

**The core promise:** "Your clients book, pay and show up on autopilot" in about a minute of setup. **What is true today:** a solo practitioner can have a working booking page quickly and get email confirmations; the "autopilot" parts (reminders, WhatsApp, online payment) depend on third-party accounts being configured and have gaps listed below, and a business with several staff members cannot yet take simultaneous bookings (see section 10).

---

## 2. User types and roles

Calvy has one login system for owners and administrators. Everyone else uses it without logging in.

| Who | What they are | How they get in | What they can see and do |
|---|---|---|---|
| **Visitor** | Anyone on the Calvy marketing site | No login | Home page, blog, help center, legal pages, signup/login pages. Can submit their email on several "get started" boxes; this saves them as a **lead**, it does not create an account. [app/page.tsx, components/landing/] |
| **Business owner** (called "tenant" in the code; role `user`) | The person who signed up. One account owns exactly one business. | Email + password (after verifying email), or Google/Facebook sign-in if those are configured | The whole dashboard for **their own business only**: appointments, calendar, clients, staff, services, payments, wallet, analytics, expenses, broadcasts, booking page, website editor, billing, support, settings. Plan limits decide which parts are open. [app/dashboard/, lib/auth.ts] |
| **Staff member** | A person listed under Staff (stylist, therapist…) | **Cannot log in.** Staff are only records the owner keeps. | Nothing. They appear on the booking page as people clients can choose, get a colour on the calendar, and show on the business website. They receive no messages. The "role" (Owner, Manager, Receptionist…) is only a label. [app/dashboard/staff/] |
| **End client** (the owner's customer) | Someone booking an appointment | **No account and no login** | The public booking page, the chat widget, the business website. They receive emails and a calendar file. They cannot view, cancel or change a booking later (section 3e). [app/b/[slug]/, app/[slug]/] |
| **Super admin** | Calvy's own team (role `admin`, or the email set as `SUPER_ADMIN_EMAIL`) | Same login page as owners; the admin area appears for them at `/admin` | The platform control room: all businesses, plan settings, revenue overview, withdrawal approvals, announcements, blog, support inbox, sales leads (CRM). Section 7. [app/admin/, app/crm/, lib/adminAuth.ts] |
| **Lead** (not a user) | A visitor who left their email | No login | A row in the admin CRM board. Gets one automatic thank-you email. [app/api/leads/route.ts] |

Notes
- Admin rights are granted two ways: by setting the `SUPER_ADMIN_EMAIL` setting, or by an existing admin promoting an email through `/api/admin/make-admin`. A one-time setup secret (`ADMIN_SETUP_SECRET`) can create the *first* admin, and stops working once any admin exists.
- There is no "customer account", "staff login", "manager" or "read-only" role.
- A person's permissions are fixed when they log in and refreshed only at the next login.

---

## 3. End-to-end journeys

### 3a. A business owner signs up and goes live

1. **Landing page** [app/page.tsx]. The visitor reads the page. The big email box in the top section ("Start free") does **not** start signup: it saves the email as a lead and shows "You're in! Check your inbox" [components/landing/HeroLeadForm.tsx]. To actually sign up the visitor must click **Get started free** in the top bar or elsewhere.
2. **Signup page** [app/signup/page.tsx]. Fields: your name, business name, email, password (at least 8 characters), and **Region & currency** (a list including India/INR, USD, EUR, GBP, AED and others; all prices will use this currency). There are also Google and Facebook buttons, but they only work if Calvy's team has set those logins up.
   - *Decision points:* email already used → "An account with this email already exists." Too many attempts from one connection → asked to wait a minute. Missing region → asked to pick one.
3. **What happens behind the button** [app/api/signup/route.ts, lib/createBusiness.ts]: the account is created and the business is created immediately, with a web address made from the business name (`my-salon` → `my-salon.calvy.io`, with a number added if taken). The business starts on the **Free plan** (lifetime, 30 bookings a month). It starts with one sample service ("Consultation", 30 min, price 50), the owner as the first staff member, and a default website. No trial period is started, whatever the website says about a 14-day trial.
4. **"Check your email" screen.** The owner is told a verification link was sent (valid 24 hours). **They cannot log in until they click it.**
5. **Verification email** [emails/templates.tsx]: "Verify your email — confirm your email address to activate your account and start taking bookings", button *Verify my email*. If email sending is not configured, nothing arrives and the account is stuck (see "what breaks without it", section 9).
6. **Clicking the link** → the address is marked verified and the owner lands on the **login page** with "Email verified! You can now sign in." They must type their email and password again. *Decision points:* expired link → "Your verification link has expired. Please sign up again." (which fails because the email is already taken, and there is no "resend" button); invalid link → similar message.
7. **Login** [app/login/page.tsx]: email + password → goes to the dashboard. Wrong details → "Invalid email or password." Unverified → "Please verify your email first." There is **no "forgot password"** anywhere.
8. **Google/Facebook route:** if the owner signed in with Google/Facebook and has no business yet, they are sent to **Onboarding** [app/onboarding/] — one screen asking business name and region, then "Finish setup". (Email signups skip this screen because the business is already created.)
9. **Dashboard home** [app/dashboard/page.tsx]: greeting, today's bookings, key numbers (today's appointments, today's revenue, new clients this week, show-up rate, monthly revenue/expenses/profit, total clients), a mini calendar, revenue chart, team list and quick actions. There is **no step-by-step "get started" checklist**; the owner has to discover what to do next.
10. **Setup the owner has to do themselves**, in any order:
    - **Services** → edit or replace the sample service; add the real ones (name, description, length in minutes, price, colour, category, and, on paid plans, "max participants" for group sessions).
    - **Settings → Availability** → turn each weekday on/off and set opening and closing time; pick the slot spacing (10/15/20/30/45/60 minutes; locked to 30 on the Free plan).
    - **Settings → Business Profile** → type of business, description, phone, email, address, website, currency, brand colour (brand colour is a paid feature).
    - **Staff** → add people (name, role, email, phone, colour). **There is nowhere to set a staff member's own working hours or which services they do.**
    - **Booking Page** → copy the link, share to WhatsApp, copy the embed code, choose the name/description/colour shown.
    - **Website** → edit the public website text and images (3g below).
    - **Settings → Payout** → choose "pay at venue" (postpaid) or "pay online" (prepaid; paid plans, needs bank details).
11. **Live.** The booking page is live from the moment the account exists, at `{slug}.calvy.io` (the business website) and `{slug}.calvy.io/book-now`, and also at `/b/{slug}`. Until the owner adds services and sets hours, clients see the sample service and default hours (Monday–Friday, 9:00–18:00).

**Decision point summary:** verify email (required) → log in again → set up. Typical time to a real, usable page is 10–15 minutes, not the "60 seconds" the website says.

### 3b. A client books an appointment

Where: `{slug}.calvy.io/book-now`, `/b/{slug}`, or the chat widget on the business website. The full-page flow has five steps and a progress bar [app/b/[slug]/BookingClient.tsx]:

1. **Choose services.** A list of the business's active services with length and price; a search box appears when there are more than four. Clients can tick **more than one**. *Decision:* "Continue" stays disabled until one is chosen. Group services show spots left.
2. **Choose your provider.** "No preference" or any active staff member (name, role). Staff are **not filtered by service**: every active staff member is offered for every service.
3. **Pick a date and time.** A month calendar (past days greyed out) and, after a date is picked, a grid of time slots. Slots are every N minutes (the business's slot spacing), must fit before closing time for the total length of the chosen services, and are marked "Taken" if the business already has a booking that overlaps. *Important:* "taken" is judged for the **whole business**, not for the chosen staff member, and staff schedules are ignored. If the day is closed, the message says there is no availability.
4. **Your details.** Full name, email (required, format checked), phone (optional), notes (optional).
5. **Confirm.** A summary (services, provider, date/time, total length, total price). Button **Confirm booking**.
   - **Pay at venue (postpaid, default):** the booking is created immediately and the client sees a success screen ("booking confirmed", confirmation sent to their email).
   - **Pay online (prepaid):** the client is redirected to a Razorpay payment page; after paying they return to a thank-you page [app/booking/success/page.tsx] and the booking is created. If online payments are not set up for that business, the server refuses ("Online payments are temporarily unavailable") in production.
   - *Errors the client can see:* "This time slot is no longer available" (someone else got it first), "That time has already passed", "Too many booking attempts" (more than 10 in a minute from one connection), "Business not found".

The **chat widget** [components/chatbot/ChatWidget.tsx] (a floating chat bubble on the business website, Professional plan and up) does the same through a scripted conversation: services → date → time → details → confirm. It has **no "choose a provider" step**, so chat bookings have no staff member attached. It is a fixed script, not artificial intelligence.

What the client sees afterwards: a success message on screen, then the emails in 3c. They get **no link to view, change or cancel** the booking.

### 3c. What happens after a booking: notifications

| What | To whom | When | Content | Notes |
|---|---|---|---|---|
| **Confirmation email** [lib/email.tsx, emails/templates.tsx] | The client | Immediately, when the booking is made (public booking or owner-created in the dashboard) | Subject "Booking confirmed — {service} at {business}". Heading "You're booked! 🎉"; business, service, provider, date, time, length and price; "We've added this to your calendar (see the attachment)". A calendar file (`appointment.ics`) is attached. | Sent from Calvy's sender address, not the business's. Needs the email service configured. The calendar file's time is built without the business's timezone, so it can be off by hours if the server is not in the business's timezone. |
| **Owner notification** [lib/push.ts] | The owner | Immediately | In-app bell entry "New booking received — {client} — {service} on {date} at {time}", plus a phone/browser push if the owner enabled push | The owner is **not emailed** about new bookings. |
| **WhatsApp confirmation** [lib/whatsapp.ts] | The client (only if they gave a phone number) | Immediately, public bookings only | "Hi {name}! ✅ Your *{service}* at *{business}* is confirmed for *{date} at {time}*. See you then! — Calvy" | Sent as a plain text message from one shared Calvy number. WhatsApp only delivers such messages to people who recently messaged that number, so for most new clients it will not arrive (needs approved templates). Not sent for owner-created bookings. |
| **Reminder** [app/api/cron/reminders/route.ts] | The client by email and WhatsApp; the owner by push | **Once a day, at 06:00 UTC**, for every booking happening "tomorrow" (UTC day) that has not been reminded | Email: "Reminder: {service} tomorrow at {time}"; heading "Your appointment is tomorrow 🗓"; "If you need to make a change, just reply to this email" (replies go to Calvy's address, not the business). WhatsApp: "Hi {name}! 🗓 Reminder: your *{service}* is *tomorrow at {time}*. See you then! — Calvy". Owner push: "Appointment reminder — {client} — {service} tomorrow at {time}". | Not once per business, not "24 hours before": the actual lead time is roughly 18–42 hours. Not limited by plan even though the plans say reminders are a paid feature. Failed sends are still marked as sent. |
| **Cancellation email** | The client | When the owner sets the status to Cancelled | "Your appointment at {business} was cancelled"; details; "Book again" button to the business website | Email only. |
| **Reschedule email** | The client | When the owner changes the date (only possible through the API; there is no screen for it, see 3d) | "Your appointment was moved to {date} at {time}", old and new time | Email only. |
| **Receipt email** | The client | When the owner marks the booking **Paid** | "Receipt from {business} — {amount}", a "Paid" badge, receipt number `INV-xxxxxxxx`, payment reference if online | Email only. This is the only "invoice" Calvy produces; there is no invoice page or PDF. |
| **No-show / Completed** | — | — | **Nothing is sent.** | |
| **In-app notification centre** [components/dashboard/Header.tsx] | The owner | Stored for every new booking, reminder run and admin announcement; the bell polls every 30 seconds | List of messages; "mark all read" | Works even when push is off. |
| **Push notifications** [lib/push.ts, public/sw.js] | The owner | Same events | Phone/browser popup, if the owner clicked "Enable push notifications" and the push keys are configured | Owner only. Staff and clients never get push. |

### 3d. The owner manages a booking

Where: **Appointments** (list) and **Calendar** in the dashboard; the **New** button creates bookings. [app/dashboard/appointments/, app/dashboard/calendar/]

- **See bookings:** the list has tabs (All, Pending, Confirmed, Completed, Cancelled…), a search box, filters for staff and date range, and a payment-status badge. The calendar shows a **week or day** view with coloured blocks; it is read-only (you cannot click to create or drag to move).
- **Open a booking:** clicking a row opens a window showing client, service, staff, date, time, length, price and notes, with three dropdowns: **Appointment status**, **Payment status**, **Payment mode**, and a *Save changes* button.
- **Confirm:** every booking is created already as **Confirmed** (there is no approval step). "Pending" can only be chosen by hand.
- **Mark no-show / completed:** change the status dropdown to *No-show* or *Completed* and save. Nothing is sent to the client. A no-show or cancelled booking frees the time slot.
- **Cancel:** change status to *Cancelled* and save → the slot is freed and the client is emailed (3c).
- **Mark paid:** set payment status to *Paid* → the client gets a receipt email. Revenue, profit and the wallet only count bookings marked Paid.
- **Reschedule:** the system can move a booking (and emails the client), but **the screen has no date or time field**. Today an owner has to cancel and create a new booking. *(Status: code exists, unreachable from the screen.)* The move is also **not checked** against other bookings.
- **Delete:** the system can delete a booking, but there is no delete button anywhere in the dashboard. *(Unreachable.)*
- **Create a booking by hand ("New"):** client name, email (required), phone, one or more services, staff member (optional), date, time, notes. This is how **walk-ins and phone bookings** are entered; there is no separate walk-in feature, and an email address is always required. The plan's monthly booking limit applies here. The client gets the confirmation email. The system does not check for clashes with other bookings, so the owner can double-book by hand.
- **Export:** a CSV download button on Appointments (paid plans) saves the filtered list: client, email, service, staff, date, time, duration, price, status, payment.

### 3e. Can a client cancel or reschedule?

**No.** There is no page, link or message that lets a client cancel, change or even look up a booking. The confirmation and reminder emails contain no manage link; the reminder says "just reply to this email", and that reply goes to Calvy's sending address, not to the business. The only client-facing change is that the owner cancels, and the client is then emailed. *(Section 10; this is a major gap for the target market.)*

### 3f. The owner upgrades or downgrades a plan

Where: **Billing** [app/dashboard/billing/, app/api/billing/]. This depends on Razorpay being configured; payments were outside the audit, so this describes the intended behaviour from the code.

1. **Billing page** shows the current plan, a Monthly/Annual switch, a card per plan with price and features, and a comparison table.
2. **Upgrade / "Switch plan":** pick a plan → Calvy creates a Razorpay subscription and sends the owner to Razorpay's page to pay. The plan changes only after Razorpay confirms payment (an automatic message from Razorpay, or the owner pressing *Sync*). Abandoning payment leaves the plan unchanged.
   - If the owner already had a paid subscription, it is **cancelled immediately** before the new one is created. If the new payment is then abandoned, the owner may be left on Free.
3. **Downgrade:** there is no dedicated downgrade button. The owner either "switches" to a cheaper plan (same process as above) or presses **Cancel subscription**, which cancels at the end of the paid period ("You'll keep access until the end of the billing period"). When the subscription ends, the business drops to **Free**.
4. **Payment fails:** the plan shows "past due", a red banner appears across the dashboard ("Payment failed. Update your payment method to restore access."), and **creating new appointments, staff and services is blocked** (the message says "Your trial has expired. Please upgrade", which is the wrong wording). Public bookings by clients are not blocked.
5. **What happens to existing data on downgrade/expiry:** nothing is deleted or hidden. A business that had 10 services and drops to Free (limit 3) **keeps all 10** and simply cannot add more. Pages for features the Free plan lacks (Analytics, Broadcasts, Wallet, Support) show an "Upgrade" screen instead of the data. See section 5.
6. **Trial:** there is no working free trial (section 5).

### 3g. A super admin's day

Where: `/admin` (section 7 lists everything). A typical day:
1. Open **Overview**: total businesses, clients, bookings, "revenue" and plan mix.
2. Check **Support**: read new tickets, reply, set status (a reply moves an open ticket to "in progress").
3. Check **Withdrawals**: approve, reject or mark "released" owners' withdrawal requests (the actual money transfer is done by the admin outside Calvy; marking it "released" simply lowers the owner's wallet balance).
4. Check **CRM**: change the stage of new website leads (New → Contacted → Qualified → Demo → Won / Lost).
5. Look at **Tenants** to help a business: change its plan or status, give a 14-day "trial" label, open its booking page, or delete it and all its data.
6. Publish **Blog** posts; send an **announcement** (push + in-app) to all businesses or to everyone on one plan; adjust **Plans & Pricing** limits.

---

## 4. Feature inventory

Where "Who uses it" is "Client" the person is the owner's customer; "Owner" is the business owner; "Admin" is Calvy staff.

| Feature | What it does | Who uses it | Where in the app | Status | Notes |
|---|---|---|---|---|---|
| **Public booking page** | Five-step booking flow: services → provider → date/time → details → confirm | Client | `{slug}.calvy.io/book-now`, `/b/{slug}` [app/b/[slug]/BookingClient.tsx] | **Partial** | Works and is pleasant on a phone. Ignores staff schedules; availability is for the whole business; two people can book the same slot at the same moment; no timezone. |
| **Demo booking page** | A static sample with fake staff and star ratings | Anyone | `/booking` [app/booking/page.tsx] | **Partial** | Sample data only, not linked from the site; a user who lands there can click through a fake booking. Should be removed or clearly labelled. |
| **Public business website** | A one-page site for the business: top section, about, services, team, contact | Client | `{slug}.calvy.io` [app/[slug]/page.tsx] | **Working** | Built from the owner's text plus live services and staff. Default photos are stock images that may not suit the business. |
| &nbsp;&nbsp;↳ editable parts | Each section can be switched on/off. **Hero:** background image, small badge, headline, subheadline, two button labels. **About:** image, badge, heading, body text, floating badge label, link text. **Services:** badge, heading, subtitle, button text. **Team:** badge, heading, subtitle. **Contact:** badge, heading, subtext, call-to-action heading/subtext/note, show phone/email/address. **Search-engine title and description.** | Owner | Dashboard → Website [app/dashboard/website/] | **Working** | Images: choose from built-in stock photos or upload (upload needs a paid plan and Calvy's storage). Search-engine fields hidden on Free. No custom pages, no logo, no gallery, no map, no opening-hours block. |
| **Services** | Name, description, length, price, category, colour, active on/off, max participants | Owner | Dashboard → Services | **Working** | Deleting a service that has bookings only hides it. Free plan: 3 services. |
| **Group bookings** | A service can have "max participants"; several clients may book the same start time | Owner / Client | Services form (paid plans); booking page shows spots | **Partial** | Only for bookings starting at exactly the same time. Capacity comes from the first selected service only. Paid plans (Professional+). |
| **Multiple services in one booking** | Client ticks several services; length and price are added up | Client | Booking page | **Partial** | Works, but the extra services are stored as text inside the notes field, so renaming a service later garbles old bookings. |
| **Staff** | Add, edit, switch active/inactive, delete; name, role, email, phone, colour | Owner | Dashboard → Staff | **Partial** | No working hours editor, no service assignment, no login, no time off. Roles are labels only. Free: 1 staff; Starter: 2; Professional: 5; Business: unlimited. |
| **Staff working hours** | Each staff member has a stored weekly schedule | — | Not editable anywhere [app/api/staff/route.ts] | **Unreachable / unused** | A default is saved when staff are created and never read when computing availability. |
| **Business working hours** | One opening and closing time per weekday (or closed) | Owner | Settings → Availability | **Working** | One block per day: no lunch break, no split shifts. Missing config means Mon–Fri 9–18. |
| **Breaks / lunch** | — | — | — | **Promised, missing** | Not built. |
| **Holidays / time off / blocked dates** | — | — | — | **Promised, missing** | Not built; no way to close a single day or mark leave. |
| **Slot intervals** | How far apart time slots appear (10/15/20/30/45/60 min) | Owner | Settings → Availability | **Working** | Locked to 30 minutes on Free. |
| **Buffers between bookings** | — | — | — | **Promised, missing** | Not built. |
| **Booking limits / notice rules** | Minimum notice, how far ahead, per-day caps | — | — | **Promised, missing** | Not built. Only the plan's monthly count exists (and it is not applied to public bookings). |
| **Clients (CRM)** | List with search, email/phone buttons, visit count, total spent, last visit; add client; a "VIP" badge when total spent is above 500 | Owner | Dashboard → Clients | **Partial** | Cannot edit or delete a client. "VIP" is a fixed amount of 500 in whatever currency. Clients are added automatically from bookings. |
| **Client notes & history** | Notes field (set when adding a client or from a booking); a detail page with total visits, total paid and an "Appointment Ledger" | Owner | Clients → client name | **Partial** | Notes cannot be edited after creation. No intake forms, files, or treatment notes. |
| **Calendar views** | Week and day views of bookings, coloured by service | Owner | Dashboard → Calendar | **Partial** | Read-only. Hard to read on a phone (labels cut to one letter). No month view, no staff filter. |
| **Appointments list** | Search, status tabs, staff/date filters, detail window, status/payment edits, CSV | Owner | Dashboard → Appointments | **Working** | No reschedule field, no delete button. |
| **Walk-ins / phone bookings** | Owner creates a booking by hand | Owner | Appointments → New | **Partial** | No special walk-in mode; email required; no clash check. |
| **Chat booking widget** | Floating chat that books through a scripted conversation | Client | Business website (Professional+) [components/chatbot/ChatWidget.tsx] | **Partial** | No provider choice; not artificial intelligence, a fixed script. |
| **Email confirmations** | Confirmation with calendar file | Client | Automatic | **Working** (needs email service) | Sender is Calvy; English only. |
| **Reminders (email + WhatsApp)** | Day-before reminder | Client | Automatic daily job | **Partial** | Once a day; timing inexact; not tied to the plan; WhatsApp unlikely to deliver. The website says "automatic SMS": there is no SMS. |
| **WhatsApp messages** | Confirmation and reminder text | Client | Automatic | **Partial** | See 3c. |
| **Broadcasts** | Send a message to **all** clients by email, WhatsApp or both | Owner | Dashboard → Broadcasts (Professional+) | **Partial** | No client selection, no opt-out link, no per-month limit enforced. Shows counts and recent history. |
| **Reviews / ratings** | — | — | — | **Promised, missing** | There is no review feature. The website's testimonials and ratings are not connected to any real data. |
| **Invoices / receipts** | Receipt email when marked paid; number `INV-…` | Owner / Client | Automatic on "Paid" | **Partial** | No invoice page, PDF, GST or tax details, or invoice list. |
| **Expenses** | Record spending by category (Rent, Utilities, Staff/Salaries, Supplies, Marketing, Software, Equipment, Other); add/edit/delete | Owner | Dashboard → Expenses | **Working** | Available on every plan (the docs say paid only). Feeds profit figures. |
| **Analytics** | Revenue/expenses/profit for 12 months, bookings per day this week, services breakdown, top clients by spend | Owner | Dashboard → Analytics (Professional+) | **Working** | Counts only bookings marked Paid. |
| **Dashboard home** | Today's bookings and key numbers, mini calendar, revenue chart, team widget, quick actions | Owner | Dashboard → Home | **Working** | Shows $0 / 100% for new accounts. |
| **CSV export** | Download appointments or payments list | Owner | Appointments and Payments pages (Starter+) | **Partial** | Built in the browser; the plan limit is enforced only by hiding the button. |
| **Payments page** | Totals of prepaid money collected, pending, monthly revenue, paid count; mark-as-paid | Owner | Dashboard → Payments | **Working** | Money-handling code was outside this review. |
| **Wallet / withdrawals** | Balance from online payments, request withdrawal to a bank account, history | Owner / Admin | Dashboard → Wallet (Professional+); admin → Withdrawals | **Partial** | Admin pays out by hand. Balance is calculated from paid bookings minus released withdrawals. Not reviewed in depth. |
| **Online payments (prepaid)** | Client pays at booking through Razorpay | Client | Settings → Payout (Professional+) | **Partial** | Not reviewed. The website says "Stripe"; the code uses Razorpay. |
| **Branding** | One brand colour used on the booking page and website | Owner | Settings → Business Profile; Booking Page → Appearance | **Partial** | Colour only (paid). No logo upload. The "Remove Calvy branding" feature on the Business plan does nothing, because the owner's pages show no Calvy branding to remove. |
| **Subdomain** | Each business gets `{slug}.calvy.io` automatically | Owner / Client | Automatic | **Working** | The name cannot be changed later; names such as `admin` or `login` are not reserved. |
| **Custom domain** | Use `www.mybusiness.com` | — | — | **Promised, missing** | Not built. |
| **Search-engine settings (SEO)** | Page title and description for the business site; site map; "canonical" address | Owner | Website → SEO (Starter+); automatic sitemap [app/sitemap.ts] | **Working** | Business sites appear in the sitemap. |
| **Image uploads** | Upload pictures for the website | Owner | Website image picker (Starter+) | **Partial** | Works only with Vercel's storage (needs a key); public files. |
| **Blog** | Articles written in Markdown with cover image, tags, search-engine fields, FAQ | Admin / Visitor | Admin → Blog; public `/blog` | **Working** | Business owners cannot write posts. |
| **Help center** | 24 how-to articles | Owner | `/help` [lib/helpArticles.ts] | **Working** | Articles live in code; an admin cannot edit them in the app. Some mention Stripe/USD. |
| **Notifications (in-app)** | Bell with latest events | Owner | Dashboard header | **Working** | |
| **Push notifications** | Browser/phone popups for the owner | Owner | "Enable push" prompts | **Partial** | Needs keys; owner only. |
| **Mobile app / PWA** | Installable web app with offline page | Owner | Install prompt; manifest [public/manifest.json] | **Partial** | The installed app opens the login page. Phone-friendly bottom menu (Home, Calendar, Bookings, Clients, More). No offline data. |
| **Multi-language** | — | — | — | **Promised, missing** | English only. Currency is multi-country; language is not. |
| **Multi-currency** | Each business picks a currency; prices are stored and shown in it | Owner | Signup/Settings | **Partial** | Prices are stored in the business's own currency. Admin totals add different currencies together and print them with "$". |
| **Support tickets** | Owner opens a ticket, admin replies | Owner / Admin | Dashboard → Support; Admin → Support | **Partial** | The owner's Support page and API require the Business plan ("priority support"), so Free/Starter/Professional owners cannot raise a ticket in the app. |
| **Billing & plans** | View/change/cancel subscription | Owner | Dashboard → Billing | **Partial** | See 3f and section 5. Prices are in US dollars. |
| **Social login** | Google/Facebook sign-in | Owner | Login/Signup | **Working if configured** | Buttons do nothing unless Calvy sets the keys. |
| **Lead capture** | Eight email-capture boxes on the marketing site; one thank-you email | Visitor / Admin | Marketing pages | **Working** | Only saves a lead; does not start signup. |
| **Admin panel** | See section 7 | Admin | `/admin` | **Working** | |
| **Admin CRM** | Kanban of sales leads | Admin | `/crm` | **Working** | |
| **Login security** | Password hashing, limits on tries | All | Login | **Partial** | No password reset; limits reset when the server restarts. |

---

## 5. Plans and limits

### 5.1 What each plan includes (from the code)

Limits and switches are stored in two places: built-in defaults in the code [lib/plans.ts] and a database table the admin can edit at **Admin → Plans & Pricing** [PlanConfig]. Pages read the database values; some limits are enforced from the **code defaults** (see "enforced where"), so an admin's edit to those limits does not take effect.

| Setting | Free | Starter | Professional | Business | Enforced where |
|---|---|---|---|---|---|
| **Staff** | 1 | 2 | 5 | Unlimited | API when adding staff (**code default**); Staff page greys the Add button |
| **Services** | 3 | 5 | Unlimited | Unlimited | API when adding services (**code default**) |
| **Bookings per month** | 30 | 100 | Unlimited | Unlimited | API for bookings the **owner** creates (**code default**). **Not applied to client bookings from the public page.** |
| **Broadcasts per month** | 0 | 0 | Unlimited | Unlimited | **Nowhere** (the Broadcasts page and API only check "not on Free/trial") |
| Analytics | No | No | Yes | Yes | Page (shows Upgrade screen) |
| Custom branding (colour) | No | Yes | Yes | Yes | Settings screen only |
| Image upload (website) | No | Yes | Yes | Yes | Website editor screen only; the upload API itself does not check the plan |
| SEO controls | No | Yes | Yes | Yes | Website editor screen only |
| Chat booking widget | No | No | Yes | Yes | Business website (widget not shown) |
| Group booking | No | No | Yes | Yes | Services screen only |
| Multi-service booking | Yes | Yes | Yes | Yes | **Nowhere** (always on) |
| Online payments (`stripePayments`, legacy name; really Razorpay) | No | No | Yes | Yes | Settings → Payout screen |
| Email reminders | No | Yes | Yes | Yes | **Nowhere**: reminders go to every plan |
| WhatsApp reminders | No | No | Yes | Yes | **Nowhere**: sent to every plan if a number is given |
| Broadcasts | No | No | Yes | Yes | Page (Upgrade screen) and API (by plan name) |
| CSV export | No | Yes | Yes | Yes | Hides the button only |
| Expense tracking | **Yes** | Yes | Yes | Yes | Page; Free is allowed in code (docs say paid) |
| Wallet & withdrawals | No | No | Yes | Yes | Page (Upgrade screen) |
| Custom slot interval | No | Yes | Yes | Yes | Settings screen only; the API accepts any value |
| Remove Calvy branding | No | No | No | Yes | **Nowhere** (there is nothing to remove) |
| Priority support (also gates **all** support tickets) | No | No | No | Yes | Page and API |

There is a legacy plan name `trial`, treated exactly as Free.

### 5.2 Prices

| Plan | In the code (per month) | Annual (per month) | On the website | Notes |
|---|---|---|---|---|
| Free | $0 | $0 | "Lifetime free" | |
| Starter | $2 | $1 | $2 monthly / $1 annual | |
| Professional | $5 | $2 | $5 / $2 | The product docs [Documentation.md] say $5 / $4 |
| Business | $10 | $6 | $10 / $6 | Docs say $10 / $8 |

Prices are in US dollars, edited in the code [lib/plans.ts] and, for what the website shows, possibly overridden by the admin's plan table. The website's "−20%" annual badge does not match the actual annual discount (about 50–60%). The real charge is whatever Razorpay plan IDs are configured in the environment (`RAZORPAY_PLAN_*`); the website numbers and Razorpay plans are not tied together in code.

### 5.3 What happens when a limit is hit

| Situation | What the owner sees |
|---|---|
| Adding a staff/service/booking over the plan limit | A message "…limit reached. Upgrade your plan." (code `LIMIT_REACHED`); nothing is created |
| Opening a page the plan does not include (Analytics, Broadcasts, Wallet, Support) | A full-page "Upgrade" panel instead of the page |
| A greyed-out control (brand colour, slot interval, group capacity, CSV, image upload, SEO) | The control is locked with a small lock icon and a hint to upgrade |
| Clients booking on the public page after the owner passed the monthly limit | **Nothing**: the booking succeeds (the limit is not applied there) |
| Past-due payment on a paid plan | A red banner and a block on adding bookings/staff/services (message wrongly says "trial has expired"); public bookings still work |

### 5.4 Trial logic

There is **no working trial**. New businesses start on Free ("lifetime"). The code reads a trial end date but never uses it [lib/plans.ts: `trialDaysLeft` always returns 0, `isActivePlan` ignores the date]. The admin's **"+14 day trial"** button changes the business's plan to `trial`, which behaves like Free, so it has no visible effect except a label. The website's "14-day free trial" therefore does not exist.

### 5.5 Downgrade and expiry

- Paid → cancelled, ended or expired: the business is set to Free immediately by Razorpay's message (or when the owner presses Sync). Nothing is deleted and over-limit items stay (new ones are blocked).
- Features lost on Free: pages for Analytics, Broadcasts, Wallet and Support show the Upgrade panel; brand colour, slot spacing (stays at the saved value but cannot be changed), image upload and SEO controls lock; the chat widget disappears from the website. **Reminders and WhatsApp messages keep being sent** because they are not tied to the plan.
- A past-due business is not downgraded; it is limited as described above until payment is fixed.

---

## 6. Settings an owner can change

**Settings → Business Profile** [app/dashboard/settings/]
- Business name; Business type (Hair Salon, Barbershop, Medical Clinic, Spa & Wellness, Dental, Physiotherapy, Coaching/Consulting, Tattoo, Beauty & Nails, Fitness/Personal Training, Therapy/Counseling, Other): affects default website photos and wording.
- Description; Phone; Business email; Address; Website.
- **Currency**: all prices on the dashboard and booking page.
- **Brand colour** (paid plans): colour of buttons and accents on the booking page and website. Default is a red (`#e84545`), which differs from Calvy's own blue.

**Settings → Availability**
- **Slot spacing** (10/15/20/30/45/60 minutes; Starter and up).
- **Weekly availability**: for each day, open/closed and start/end time.

**Settings → Payout Settings**
- **Payment mode**: *Postpaid* (client pays at the venue, always allowed) or *Prepaid* (client pays online when booking; needs a paid plan with online payments and saved bank details).
- **Bank details**: account holder name, account number, IFSC (India) or IBAN (international).
- **Razorpay linked-account details** for automatic payouts: legal business name, business type, PAN, Razorpay category/subcategory, GST number, address, city, state, postal code.

**Booking Page** [app/dashboard/booking-page/]
- Copy link, Share via WhatsApp, Copy embed code, Copy URL; "Appearance": business name, description, brand colour (shown in a live phone preview).

**Website** [app/dashboard/website/]: the section texts, images and on/off switches in section 4; search-engine title and description (Starter+).

**Staff, Services, Clients, Expenses**: each page edits its own records (section 4).

**Billing**: subscribe, switch plan, cancel, sync status.

**Notifications**: "Enable push notifications" on the bell; install-the-app prompt.

Not settable anywhere: language, timezone, reminder timing, notification preferences, cancellation policy, booking notice, holidays, who may book which service, message wording, email sender name, logo, the business's web address.

---

## 7. Admin panel

All under `/admin` for super admins (the left menu: Overview, Tenants, Plans & Pricing, Revenue, Withdrawals, Notifications, Blog, CRM (Leads), Support, and a link back to "My Dashboard"). [app/admin/, app/api/admin/]

| Page | What the admin sees | What the admin can change |
|---|---|---|
| **Overview** | Total businesses and how many are active; total clients; "Month revenue" and total bookings; plan mix chart; counts of active subscriptions, "on free trial" and past due; recent businesses | Nothing (read-only) |
| **Tenants** | Table of every business: name, owner email, address slug, plan and plan status, counts of bookings/clients/staff, this month's revenue, sign-up date. Search and filters by plan and status | Change a business's **plan** and **plan status** from drop-downs; **+14 day trial** button (see 5.4: no real effect); open its public booking page; **delete the business and all its data** (confirmation prompt only) |
| **Plans & Pricing** | Each plan's limits and every feature switch, a "feature health" check list | Edit limits (staff, services, bookings, broadcasts) and turn features on/off per plan, effective without redeploying. *Staff/service/booking limits are enforced from code defaults, so edits to those three do not change enforcement.* |
| **Revenue** | A 6-month chart and totals, top businesses | Read-only. **This is the businesses' own paid-booking totals, added together across all currencies and printed with "$"**, not Calvy's own subscription income. |
| **Withdrawals** | Owners' withdrawal requests with amount, bank details, status | Approve, reject or mark **released**, with a note. Calvy does not move the money; "released" lowers the owner's wallet balance. |
| **Notifications** | A form | Send an announcement (title, message, link) by push and in-app to **all** businesses or to all on one plan |
| **Blog** | All posts, drafts and published | Create/edit/delete posts: title, address slug, author, excerpt, cover image (upload or URL), Markdown content, tags, search-engine title/description, FAQ, publish on/off |
| **CRM (Leads)** `/crm` | A board of sales leads from the website forms: New, Contacted, Qualified, Demo, Won, Lost; shows name, email, source, note | Change a lead's stage with a drop-down (not drag and drop), delete |
| **Support** | Tickets from Business-plan owners | Read, reply (first reply sets "in progress"), change status |
| **Settings** `/admin/settings` | — | **Not a real page**: it redirects to the Overview. A "settings" store exists in the database and an API can write it, but nothing in the app reads those values. |

Admin cannot, from the app: impersonate an owner, see email delivery logs (they exist in the database), refund anything, edit help articles, or reset an owner's password.

---

## 8. Data the product stores

All in one PostgreSQL database [prisma/schema.prisma]. Every owner-related record carries the business it belongs to, which is how one business is kept away from another's data.

**The main chain:** a **User** owns one **Business**. A business has many **Staff**, **Services** and **Clients**. A staff member and a service can be linked (**StaffService**). An **Appointment** ties together one business, one client, one service (the first one chosen) and, optionally, one staff member.

| Model | One-line explanation |
|---|---|
| **User** | A login: name, email, password (scrambled), role (`user` or `admin`), email-verified date, optional profile image. One user owns at most one business. |
| **VerificationToken** | A one-time code emailed to confirm an email address; expires in 24 hours. |
| **Business** | The tenant: name, web address slug, plan and plan status, business type, contact details, brand colour, currency, weekly opening hours (stored as text), slot spacing, website content (stored as text), payment mode, bank details, tax/legal details for payouts, Razorpay subscription and account IDs. Bank and PAN details are stored as plain text. |
| **Staff** | A team member of a business: name, role label, email, phone, colour, active flag, a weekly-hours field that nothing uses. |
| **Service** | Something a business sells: name, description, length, price, category, colour, capacity (spots), active flag. Deleted services that have bookings are kept but hidden. |
| **StaffService** | Link table: which staff member can do which service. Filled only by the demo seed; no screen edits it and the booking logic does not use it. |
| **Client** | A customer of a business, unique by email within that business: name, email, phone, notes, visit count, total spent, last visit. |
| **Appointment** | A booking: business, client, service, optional staff, start date/time, length, price, status (pending/confirmed/completed/cancelled/no-show), payment status (unpaid/paid/refunded), payment mode (prepaid/postpaid), Razorpay payment/transfer IDs, notes (extra services are hidden inside notes), a "reminder sent" flag. |
| **PlanConfig** | The admin-editable limits and feature switches for each plan. |
| **WithdrawalRequest** | An owner's request to take money out of the wallet: amount, status, bank snapshot, admin notes. |
| **PushSubscription** | A phone/browser registered to receive push notifications for a business. |
| **AppSetting** | A key/value store for platform settings. Currently unused by the app. |
| **Broadcast** | A record of a message an owner sent to all clients: subject, message, medium, number sent. |
| **Expense** | An owner's cost entry: title, amount, category, date, notes. |
| **Notification** | An in-app bell message for an owner: title, body, link, read flag. |
| **SupportTicket** | A help request from an owner: subject, status, priority. |
| **SupportMessage** | One message in a ticket thread, from the owner or from admin. |
| **Post** | A blog article in Markdown with search-engine fields and FAQ. |
| **Lead** | A sales lead from the marketing site: name, email, phone, business type, source, status, notes. |
| **EmailLog** | A record of each email Calvy tried to send: type, recipient, subject, sent/failed/skipped, error. |

Money amounts are stored as decimal numbers with no minor-unit precision; dates are stored without a timezone.

---

## 9. Integrations and external services

| Service | Used for | What breaks or degrades without it |
|---|---|---|
| **PostgreSQL (Neon)** | All data | Everything. The app needs `DATABASE_URL` to run. |
| **NextAuth login** (`NEXTAUTH_SECRET`) | Sessions and sign-in | Nobody can log in. |
| **Resend** (email) [lib/email.tsx] | Verification, confirmation, reminder, cancellation, reschedule, receipt and lead emails | New owners **cannot verify their email, so cannot log in**; clients get no confirmation. With the key missing, the app currently **crashes on pages that load the email code**. With the default test sender address, mail reaches only Calvy's own inbox, not customers. |
| **WhatsApp Cloud API** (Meta) [lib/whatsapp.ts] | Confirmation and reminder texts to clients; broadcasts | Messages are skipped quietly. Even when configured, plain-text messages do not reach clients who have not messaged the business number recently (templates needed); all messages come from one shared Calvy number and are signed "— Calvy". |
| **Web Push** (browser push keys) [lib/push.ts] | Phone/browser alerts to the owner | Bell notifications inside the dashboard still work; no popups. |
| **Vercel Blob** (file storage) [app/api/upload/] | Website images uploaded by owners and the blog | Uploading fails with "Image upload not configured". Stock-photo choices still work. |
| **Razorpay** [lib/razorpay.ts, app/api/razorpay/, app/api/billing/] | Calvy's own subscriptions (Billing), online payment of bookings, payouts to businesses | No paid plans, no prepaid bookings, no automatic payouts. With the key missing, pages that load the payment code **crash** (including the post-payment thank-you page). |
| **Google / Facebook login** | One-click sign-in | The buttons do nothing; email + password still works. |
| **Vercel (hosting + daily scheduled job)** [vercel.json] | Runs the site and the once-a-day reminder job | Without the scheduled job, **no reminders** are sent. |
| **Unsplash and ui-avatars** (images) | Stock photos on business websites; avatar pictures | Images do not load. |
| **Exchange-rate lookup** [lib/geo.ts, app/api/geo/rate] | A USD-based rate lookup; the settings screen says amounts are shown "using estimated exchange rates" | Not traced to every screen (prices are stored in the business's own currency). Expect no conversion if the lookup is unavailable. |
| **IndexNow** [lib/indexnow.ts] | Tells search engines about new/updated blog posts | Search engines find posts more slowly. |
| **Calendar** | A one-off `.ics` file attached to the client's confirmation email | There is **no calendar sync** with Google or Apple calendars for owners or staff. |
| **SMS** | — | **Not integrated**, although the website mentions SMS reminders. |

---

## 10. Known gaps

Things a booking product normally has that Calvy lacks. Details, severity and what to build are in [audit/03-product.md](audit/03-product.md) and the backlog in [PLAN.md](PLAN.md).

1. **Per-staff scheduling**: staff schedules, staff-to-service links and several people working at once are not supported; a business with three stylists can take one booking per time slot.
2. **No protection against double bookings** when two clients book at the same moment.
3. **No timezone**: times work correctly only when the server runs in the business's timezone.
4. **No holidays, time off, breaks, buffers, minimum notice or advance-booking limits.**
5. **Clients cannot cancel, reschedule or view a booking**, and there is no reschedule or delete button for the owner.
6. **WhatsApp messages are not template-based** and so mostly will not deliver; reminders are once a day and imprecise; no SMS.
7. **No password reset and no way to resend the verification email.**
8. **No staff logins or roles** (receptionist, stylist view).
9. **No custom domain, no logo, no language other than English, no INR pricing for Calvy's own plans or GST invoices.**
10. **No reviews, intake forms, packages/memberships, recurring appointments, waitlist, resources (rooms/chairs), or Google Calendar sync.**
11. **No free trial** and several plan limits that are shown but not enforced (reminders, WhatsApp, broadcasts per month, public booking limit).
12. **Marketing claims that the product cannot back up**: customer counts, ratings, testimonials, "SMS", "Stripe", "14-day trial", "60 seconds".
