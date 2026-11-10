# Calvy admin panel

Internal tool for the Calvy team. Everything under `/admin`, `/api/admin` and `/crm`.

## Access
- **Super admin = a flag on the user in the database** (`User.isSuperAdmin`). The only way to set it is the script. No page or API can grant, change or show it.
  ```zsh
  cd ~/Projects/calvy-v2
  npm run admin:grant -- you@example.com      # make a Calvy login a super admin
  npm run admin:revoke -- you@example.com     # take it away (also clears 2FA, ends sessions)
  npm run admin:reset-2fa -- you@example.com  # lost phone and recovery codes: enroll again at the next /admin visit
  ```
  The scripts use the database in `DATABASE_URL`. `npm run` loads `.env.local` (your dev database); for production run them against the production URL on purpose.
- Everyone who is not a signed-in super admin (guests, owners, team members, customers) gets the same **404** as a page that does not exist, for pages and APIs.
- **2FA (authenticator app)** is required: first visit to `/admin` sets it up (setup key + 6-digit code) and shows 8 single-use **recovery codes once** (stored only as hashes). The TOTP secret is stored encrypted.
- An **admin session** is created after the code. It ends after **30 minutes idle**. Sensitive actions (every change in the console) need an authenticator code **within the last 5 minutes**.

## What it does
- **Overview:** businesses by type, region and plan; bookings today / 7 / 30 days; sign-ups; active vs dormant (a booking in the last 30 days); notification failures; the Rs 10 fee total (labelled sandbox unless `CASHFREE_ENV=production`).
- **Businesses:** server-side search and filters (type, region, plan, status, sign-up date), paginated. Detail page: profile, plan and payment settings (read-only), team, services, recent bookings, delivery log, audit trail.
- **Actions** (each needs a reason of at least 8 characters, and writes an audit row in the same transaction): create a business, edit details, suspend / unsuspend, plan override (optional end date), resend the setup email or the "business is live" email, reset onboarding.
- **Suspension:** public pages show "temporarily unavailable" and no NEW bookings are taken (public, dashboard, availability). Existing bookings, reminders and customer self-service carry on; customers are not emailed. The owner sees a notice in the dashboard.
- **Plan override:** `plan` is set to the override and the original is remembered. At the end date the cron (and any feature lookup) puts the original back. No end date = until an admin clears it.
- **View-as:** read-only by default, reason required, 30 minutes, red bar with an Exit button. **Act-as** (can edit) is a separate choice with its own reason and a fresh code. Read-only is enforced on the server for every write (only Exit, logout and re-auth still work). Owner-only areas (payments, billing, team, account) stay closed even when acting. Bank, PAN and gateway account details are masked everywhere an admin can look. Start and end (and every act-as edit) go in the admin audit log; act-as edits also appear in the business's own **Settings → Activity** as "Calvy admin".
- **Audit log:** `/admin/audit`, filterable, append-only (a database trigger refuses UPDATE, DELETE and TRUNCATE on `AdminAuditLog`).
- **Settings:** verified-customer booking limits (defaults 6 upcoming bookings per business and 5 new bookings per 24 hours; 0 = no limit).

## Booking limits
**Verified customer** (signed in to My bookings with a verified email, booking through one of their own links: Book again, Use credit, Free follow-up): the admin-set limits above.
**Guests** (anyone typing an email): 10 booking attempts a minute per device; one booking per person per day; six "already booked" answers an hour per contact and device before a cooldown; at most 4 different people per booker contact a day (each business can change that); no confirmation emails once one contact books 30 times in 24 hours.

## Not in the panel (on purpose)
Deleting a business (the old tenant delete was removed), bank/PAN/WhatsApp/API credentials, and anything that grants admin.
