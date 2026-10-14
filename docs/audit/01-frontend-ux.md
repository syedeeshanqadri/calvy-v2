# 01 — Frontend / UX audit

Audited 2026-10-15 on branch `audit/phase-1`. Evidence: 112 screenshots in `docs/audit/screenshots/` (375px and 1440px), per-page DOM checks at 375px in `docs/audit/screenshots/DOM-CHECKS.json` (`scripts/audit-checks.ts`), and code. No app code was changed.

Method notes: the demo tenant is `alex-johnson-studio` (demo data). Blog posts, admin and onboarding pages use the seeded test accounts. Full-page screenshots are very tall (home is 10,281px at 1440 and 17,983px at 375), so I reviewed them in cropped sections. Contrast was judged by eye and by Tailwind classes, not measured with a tool, so treat contrast items as "likely" until measured. Payments are out of scope (see PLAN.md, "Deferred").

---

## Summary

### Verdict: **keep and polish. Do not redesign.**
The visual language is coherent and good-looking: one blue accent, dark navy ink, warm off-white surfaces, rounded cards, a clean dashboard with a mobile bottom-nav, and a booking flow that already works well on a phone. The problems are **content honesty, consistency, accessibility and missing states**, not the look. A redesign would spend the budget on the wrong thing. The one visual exception is the 375px homepage hero (clipped), which is a bug, not a style issue.

### Top 10 issues

| # | Sev | Issue | Where |
|---|---|---|---|
| 1 | **Critical** | Fabricated social proof: "12,000+ businesses", "3.2M appointments", "4.9 from 2,400+ reviews", "98% satisfaction", "Verified on Google/Trustpilot/Capterra", six invented testimonials. A pre-launch product cannot substantiate any of it. Legal and trust risk. | `components/landing/Hero.tsx:25,80,82`, `StatsBar.tsx:4-7`, `Testimonials.tsx:83,90`, `CTA.tsx:22`, `InlineCTABand.tsx:33`, `LeadMagnet.tsx:34` |
| 2 | **Critical** | Import-time crashes. `new Resend()` / `new Razorpay()` run at module load, so a missing env var 500s every page that imports them, including `/booking/success`. See "Bugs found during audit". | `lib/email.tsx:16`, `lib/razorpay.ts:3`, `app/api/broadcasts/send/route.ts:10` |
| 3 | **High** | The homepage hero is clipped at 375px: the headline is cut ("Your clients boo…"), and the paragraph and email input run off the right edge. This is the first thing a phone visitor sees. | `components/landing/Hero.tsx` (screenshot `marketing/home-375.png`) |
| 4 | **High** | The hero "Start free" email box is a lead-capture form, not signup. It posts to `/api/leads` and says "Check your inbox to get started". The visitor never reaches `/signup`. | `components/landing/HeroLeadForm.tsx`, `postLead.ts` |
| 5 | **High** | Pricing is placeholder-grade and in the wrong currency for the target market: $1 / $2 / $6 per month (annual) and $2 / $5 / $10 (monthly), USD, for an India-first product. | `lib/plans.ts:123-151`, `components/landing/Pricing.tsx` |
| 6 | **High** | Contradictory offer: "Free forever plan" (Hero, Pricing) vs "14-day free trial" (Hero, CTA) vs "Start your free trial" (signup). Stripe vs Razorpay: Features says "Stripe-powered … payouts to your bank", Pricing and the footer say Razorpay. | `Features.tsx:21`, `CTA.tsx:33`, `Hero.tsx:53`, `app/signup/page.tsx:92`, `Pricing.tsx:49` |
| 7 | **High** | No error boundaries at all: no `error.tsx`, `global-error.tsx` or `not-found.tsx` anywhere in `app/`. Any server error is the default Next.js page; an unknown URL is the unbranded 404. | `app/` |
| 8 | **High** | Accessibility: form inputs are not programmatically labelled (`<label>` without `htmlFor`/`id`) on signup (5), login (2), dashboard website editor (25), settings (9); 20 icon-only buttons with no accessible name on Services; tap targets under 44px on nearly every page (Dashboard 8, Appointments 20, Clients 23, Services 27). | `app/signup/page.tsx`, `app/login/page.tsx`, `app/dashboard/website/WebsiteEditorClient.tsx`, `app/dashboard/settings/SettingsClient.tsx`, `app/dashboard/services/` |
| 9 | **High** | Dead links: 7 `href="#"` in the footer (Integrations, Changelog, About, Careers, and three social icons). | `components/landing/Footer.tsx:9-15,42-44` |
| 10 | **Medium** | Design-system drift: two accent colours (platform blue `#0284c7` vs red `#e84545` in `globals.css` and tenant/booking pages), 58 distinct hex values hard-coded, `#6b6b80` hard-coded 424 times, the `ui/` kit used by only 34 files while 53 files hand-roll `<button>`. Font variables are named `--font-syne` but load Plus Jakarta Sans. | `tailwind.config.ts:20`, `app/globals.css:9`, `app/layout.tsx:8-17` |

Also notable: the footer copyright says © 2025 (`Footer.tsx:69`), every app page shares the default `<title>` "Calvy — Smart Appointment Booking", the tenant site hero says "Professional services services" (`lib/website.ts:102`), and no page uses a currency other than USD in the demo.

---

## 1. Per-page findings

Severity is per finding. "375" and "1440" are the viewport widths.

### 1.1 Marketing site

**Home `/`** (`app/page.tsx`, `components/landing/*`)
- **High — hero clipped at 375.** Headline, subcopy and input run past the right edge and are cut off; `document.scrollWidth` equals the viewport, which means a parent has `overflow-hidden` and silently crops the content. The device mockup below is also cut. (`marketing/home-375.png`, top 1500px.) Fix by letting the hero grid shrink (`min-w-0`) and checking the decorative `-left-20 w-[500px]` blob and the mockup container.
- **Critical — fabricated claims** (see section 3).
- **High — email box is a lead form, not signup** (see Top 10 #4). On mobile the input is full width but the placeholder is the only label (no `<label>`).
- **Medium — tiny text in the phone mockups:** 6px to 9px text (`PhoneMockups.tsx`). Decorative, but it is rendered as real text, so screen readers read it and it counts toward the "43 elements under 12px" on the page.
- **Medium — too many stacked lead forms.** Eight separate lead-capture components (`HeroLeadForm`, `LeadCapture`, `LeadMagnet`, `InlineCTABand`, `FloatingLeadCTA`, `StickySidebarCTA`, `ExitIntentPopup`, `NewsletterForm`) all call the same `postLead`. On a 375px screen the floating CTA and chat bubble compete for the corner. The page is 17,983px tall on mobile.
- **Medium — 31 tap targets under 44px** on the homepage (carousel arrows 36x36, "Or book a personal demo" 188x20, footer links).
- **Low — the pricing "Annual" toggle is the default**, so the lowest numbers are shown first; the toggle has no visible focus style check done (needs keyboard test).
- **Low — hero says "ready in 60 seconds"**; signup says "under 10 minutes"; pricing FAQ says "under 10 minutes". Pick one.

**Pricing section** (`Pricing.tsx`, `PricingClient.tsx`): see section 3. In the 1440 screenshot the Professional card is taller than its neighbours and the Starter and Business cards leave a large empty area under the feature lists, which looks unfinished. Feature lists run to 20+ lines per card.

**Blog `/blog`, `/blog/[slug]`** (`app/blog`)
- **Medium — the blog cards use a flat blue gradient where a cover image should be** (`marketing/blog-1440.png`) when `coverImage` is null; it looks like a loading placeholder.
- **Medium — the blog post page has two `<h1>`s** (DOM check): the post title plus a second one, probably from the Markdown `# heading` in the post body. Seed content is the cause here, but the renderer should demote or strip a leading `#`.
- **Low — the date shows the creation day for both seeded posts** (14 Oct 2026); fine.

**Help `/help`, legal pages**: render fine at both widths with no overflow. **Low** — "Razorpay setup" sits in the footer "Support" column next to Contact, which is merchant-facing jargon for a public footer.

**Footer** (`Footer.tsx`): **Medium — low contrast.** Link text is `text-gray-500` on a near-black background, and the legal line is `text-gray-600`, both likely under the 4.5:1 WCAG AA ratio. 22 tap targets under 44px at 375.

### 1.2 Auth

**Login `/login`, Signup `/signup`** (`app/login/page.tsx`, `app/signup/page.tsx`)
- **High — labels not associated with inputs** (signup 5, login 2 unlabelled). Clicking a label does not focus the field, and screen readers announce "edit text".
- **Medium — the signup name/business-name pair is two columns at 375px**, so each field is about 135px wide and placeholders truncate ("Alex Johnson", "My Salon"). Stack them below `sm`.
- **Medium — placeholder text is the only hint for the password rule** ("Min. 8 characters"); once the user types, the hint is gone. There is no show-password toggle and no strength or inline validation (validation is server-side only, `app/api/signup/route.ts`).
- **Medium — copy contradicts the homepage:** "Start your free trial / under 10 minutes" vs "Free forever / 60 seconds".
- **Medium — dead end when a verification link expires:** the login page says "Please sign up again" (`app/login/page.tsx:20`). There is no "resend verification email" action, and signing up again fails with "An account with this email already exists" (`app/api/signup/route.ts`). A user whose first email never arrived is locked out.
- **Low — all three auth pages share the default site `<title>`.**
- Social sign-in buttons exist (`components/auth/SocialAuthButtons.tsx`); not exercised in this audit.

**Verify email `/verify-email`**: renders; no loading or retry state seen.

### 1.3 Onboarding (`/onboarding`)
Single form: business name + region/currency. It is only reached by OAuth users without a business; email signups create the business at signup (see section 4).
- **Medium — the validation error appears as a small red line under the select** only (`onboarding/2-validation-error-375.png`), not next to the empty field, and the button gives no field-level focus. 
- **Low — "Welcome, New!"**: the greeting uses the first word of the name, fine for real users.
- **Low — no progress indication or explanation of what happens next** ("Finish setup" then a blank dashboard).

### 1.4 Owner dashboard (`/dashboard/*`)
General (all sections):
- **Good:** mobile bottom-nav (Home / Calendar / Bookings / Clients / More), card-based stat tiles, consistent header; `loading.tsx` skeletons exist for every dashboard section (the only section with loading states).
- **High — accessibility:** 10 to 35 text nodes under 12px per page (10px used 60 times in source, e.g. nav labels and badges); icon-only buttons without names: Services 20, Booking page 11, Settings 11, Website 11, Staff 8; unlabelled fields on Settings (9) and Website editor (25).
- **Medium — page `<title>` is the generic site title on every dashboard page.** Browser tabs and history all read "Calvy — Smart Appointment Booking".
- **Medium — hydration warnings** in the browser console on `/dashboard/clients` (`<a>` nested inside `<a>` in `Card`), which React says "will cause a hydration error".
- **Medium — KPI tiles wrap labels awkwardly at 375** ("Today's appointments", "New clients this week" over 2 to 3 lines), tiles have uneven heights; the tile grid is 2 columns so the home page is a long scroll before any appointment list.

By section (screenshots in `docs/audit/screenshots/dashboard/`):
- **Home:** the 375 view shows 8 stat tiles before the schedule. "Show-up rate 100%" and "$0 expenses" are shown without any "no data yet" treatment, which is misleading on a new account. No first-run checklist (no "add a service / share your link") anywhere.
- **Calendar:** at 375 the week view crams 7 columns into about 40px each; event labels truncate to a single letter ("D…", "S…", "A…"), so the view is unusable for reading appointments on a phone. A day view exists but defaults to Week. **High on mobile**, since the target users run the business from a phone.
- **Appointments / Clients:** 20 and 23 small tap targets; row actions are icon-only.
- **Services:** card layout is good. Active toggle, kebab menu and delete are 14 to 34px targets with no labels; delete sits next to the kebab with no spacing. **Medium.** The soft-delete behaviour (CLAUDE.md) is not explained to the user.
- **Booking page / Website editor:** long forms with 25 unlabelled inputs, placeholder-only labels ("Brief description…", "Welcome to…"). **High (a11y).**
- **Settings:** the tab strip overflows at 375 (a `flex gap-1 w-fit` row is wider than the viewport, DOM check) so tabs are cut off. **Medium.**
- **Billing / Payments / Wallet:** Razorpay-era flows; not evaluated beyond layout (payments deferred).
- **Support, Broadcasts, Analytics, Expenses, Staff:** render without overflow; no empty-state copy was captured with demo data. **Medium**, empty states for a brand-new account were never seen (the demo account is populated). The seeded `newowner` account has no business, so it cannot show them either; this is a gap in the audit data.

### 1.5 Admin (`/admin/*`) and CRM (`/crm`) — internal tooling
- **Good:** consistent sidebar; overview tiles clear.
- **Medium — `/admin/settings` redirects to `/admin`** for the admin account (no settings page content, but a nav item or link points to it). Either the route is a stub or the link is dead.
- **Medium — hydration mismatch** on `/admin/plans` (a `className` differs between server and client: `w-2 h-2 rounded-full flex-shrink-0 bg-green-500`).
- **Medium — on mobile the admin tables have 13 to 22 small tap targets per page**; admin is desktop-first and that is acceptable, but the sidebar is the only navigation.
- **Low — CRM at 1440:** the "Won" column and the rest run off the right edge (horizontal scroll of the kanban); a title of "CRM · Calvy" is the only branded title in the app. Empty state is just "No leads".
- **Low — admin pages have the proper "Calvy Admin" title**, good.

### 1.6 Tenant public site (`/{slug}`, `/{slug}/book-now`)
- **Medium — copy bug:** the hero badge reads "Professional services services" because `lib/website.ts:102` builds `` `Professional ${typeLabel} services` `` and `typeLabel` is already "services" for the `general` business type.
- **Medium — default hero and about photos are stock imagery** (an office hallway, a whiteboard meeting) and do not match a hair/wellness studio; "Trusted by clients — 6+ Services" is a count, not trust. Fine as a default, but the business owner sees it as their live site until they edit it.
- **Medium — the tenant site's accent is red (`#e84545`) but the Calvy product is blue.** Acceptable for tenant branding if it is the owner's choice; it is not, it is the default, so the "no brand picked" state looks like a different product.
- **Medium — the translucent grey top bar** on the 375 hero (with "Book Now" wrapping onto two lines) looks washed out against the dark photo.
- **Low — the nav anchor `#about` is 28x28.** The floating chat bubble overlaps the hero's scroll cue.
- Page title is the business name; good.

### 1.7 Booking flow (`/b/{slug}`, `/{slug}/book-now`)
Five steps: service → staff → date/time → details → confirm. This is the best-designed part of the product (`booking-flow/*`).
- **Good:** large touch targets, clear step indicator, calendar with disabled past days, slot grid, "Taken" state, summary on confirm.
- **Medium — the "Taken" badge overlaps the 17:30 slot** and clips the time text (`3-datetime-selected-375.png`).
- **Medium — step labels are hidden below `sm`** (`hidden sm:block`), so at 375 users see only numbers 1 to 5, with no step names; the step content heading does say it.
- **Medium — the time zone is never shown** on the date/time step.
- **Medium — a customer who is on the details step has only a placeholder "Jane Smith" and an unlabelled input** (a11y).
- **Low — the "Continue" button is disabled with no explanation** (no hint saying "choose a time").
- **Low — the page `<title>` of `/b/{slug}` is the generic one**; `/{slug}/book-now` has a good one.
- The success screen could not be rendered without Razorpay keys (see bugs).

---

## 2. Design system inventory (as actually used)

Counts come from grepping `app/` and `components/` `.tsx` files.

**Colours (58 distinct hex values; Tailwind palette classes on top).**
| Role | Value | Uses |
|---|---|---|
| Muted text | `#6b6b80` | 424 |
| Border | `#e8e6e0` | 208 |
| Ink / brand | `#0f0f1a` (`brand.900`) | 133 |
| Page background | `#f8f7f4` (`--soft`) | 121 |
| Accent (platform) | `#0284c7` (`accent`), hover `#0369a1` | 115 + 10 |
| Soft fill | `#f0ede8` | 86 |
| Secondary text | `#3d3d4d` | 38 |
| Other surfaces | `#fafaf8` (23), `#f5f3ef` (18) | near-duplicates of `#f8f7f4` |
| Greys | `#9b9b9b`, `#c5c3bf`, `#b0b0c0`, `#d1d1d8`, `#6b7280`, `#374151` | scattered; `#6b6b80` / `#6b7280` and `#374151` / `#3d3d4d` are near-duplicates |
| Status / category | `#22c55e`, `#f59e0b`, `#8b5cf6`, `#ec4899`, `#3b82f6`, `#f97316`, `#14b8a6`, `#0ea5e9` | service/staff colours and statuses |
| Gold | `#f5a623` | stars |
| **Conflict** | `--accent: #e84545` (`app/globals.css:9`) vs Tailwind `accent #0284c7` | Two different "accents": the CSS variable is red and drives tenant/booking pages and seed colours; the Tailwind token is blue and drives the platform. |

**Fonts.** `next/font` loads **Plus Jakarta Sans** (variable `--font-syne`) and **DM Sans** (`--font-dm`) (`app/layout.tsx:8-17`). Tailwind names them `font-syne` / `font-dm` (`tailwind.config.ts:11-14`). The names are leftovers from an earlier Syne design: `font-syne` appears 150 times, `font-dm` only 2. Body is DM Sans (`globals.css:19`). Settings also renders `ui-monospace` once (an API key box). The tenant site uses DM Sans only.

**Font sizes.** Tailwind scale (`text-xs` … `text-5xl`) plus 9 arbitrary pixel sizes: `text-[10px]` ×60, `[11px]` ×26, `[15px]` ×14, `[9px]` ×9, `[16px]`, `[14px]`, `[13px]`, `[8px]`, `[7px]` (the last four are in phone mockups). Home page computes 17 distinct font sizes (6 to 48px), blog 6, dashboard 7.

**Radius.** `rounded-xl` ×296, `rounded-full` ×194, `rounded-2xl` ×130, `rounded-lg` ×89, `rounded-3xl` ×23, `rounded` ×10, `rounded-md` ×2. Cards use `2xl`, inputs/buttons `xl` or `full`. The shared `Button` is **pill-shaped** (`rounded-full`) but most hand-written buttons are `rounded-xl`, so two button shapes coexist.

**Shadows.** `shadow-2xl` ×29, `shadow-sm` ×18, `shadow-xl` ×17, `shadow-md` ×17, `shadow-lg` ×15, `shadow-sky-*` ×8, plus one custom ring. Heavy `2xl`/`xl` shadows on marketing; `sm` on dashboard cards.

**Buttons.** Shared `components/ui/Button.tsx`: variants primary / secondary / outline / ghost / danger; sizes sm/md/lg; pill. Imported by only **10 files**. Raw `<button>` appears in **53 files** with ad-hoc classes: marketing CTAs (`bg-sky-600 … rounded-2xl`, `HeroLeadForm.tsx`), booking buttons (`bg-[#0f0f1a] rounded-xl`), tenant sites (`style={{background: color}}`). Primary colour differs by surface: `bg-accent` (#0284c7), `bg-sky-600` (#0284c7-ish), `bg-[#0f0f1a]` (navy), inline tenant colour.

**Cards.** `components/ui/Card.tsx` (`bg-white rounded-2xl border-[#e8e6e0] shadow-sm`), imported by 18 files; `StatCard` ×3; many pages hand-roll `bg-white rounded-2xl border border-[#e8e6e0] p-5/p-6`.

**Inputs.** `components/ui/Input.tsx` imported by 9 files. Forms elsewhere hand-roll `w-full rounded-xl border border-[#e8e6e0] px-4 py-3` (booking, signup) vs `h-11 … rounded-xl` (onboarding) vs `rounded-2xl border-gray-200 px-5 py-4` (marketing lead forms).

**Loading / empty / error.** `components/ui/Shimmer.tsx` (14 importers) and 16 `loading.tsx` files in `app/dashboard/*`. No `loading.tsx` outside the dashboard, no `error.tsx` / `not-found.tsx` / `global-error.tsx` anywhere.

### Duplicated or near-duplicate components

| Duplicate | Files | Note |
|---|---|---|
| Lead-capture forms ×8 | `components/landing/HeroLeadForm.tsx`, `LeadCapture.tsx`, `LeadMagnet.tsx`, `InlineCTABand.tsx`, `FloatingLeadCTA.tsx`, `StickySidebarCTA.tsx`, `ExitIntentPopup.tsx`, `NewsletterForm.tsx` (all call `postLead.ts`) | Same email field, state machine and success message repeated; consolidate into one `<LeadForm variant>`. |
| Two Pricing components | `components/landing/Pricing.tsx` (server, builds `PlanDisplay`) + `PricingClient.tsx` | Intentional server/client split, but both hold plan copy (`Pricing.tsx:49` and `lib/plans.ts`). |
| Stat tiles | `components/ui/StatCard.tsx` (3 users), `components/dashboard/DashboardKPIStats.tsx`, inline tiles in `app/admin/*` and `app/dashboard/*` | Three implementations of "icon + number + label". |
| Layouts | `components/dashboard/DashboardLayout.tsx`, `components/admin/AdminLayout.tsx`, `components/legal/LegalLayout.tsx`, `app/crm/*` custom header | Sidebar/header chrome duplicated between dashboard and admin; CRM has its own. |
| Modal | `components/ui/Modal.tsx` (6 users) vs inline fixed-overlay modals in booking/ChatWidget/admin pages | |
| Form `Field` | `app/admin/blog/page.tsx:264` defines its own `Field` while `ui/Input.tsx` has labels | |
| Booking UI ×2 | `app/b/[slug]/BookingClient.tsx` and `components/chatbot/ChatWidget.tsx` | Per CLAUDE.md, both drive the same API; the UI logic (slots, validation) is implemented twice. |
| Dashboard nav ×2 | `components/dashboard/Sidebar.tsx` and `BottomNav.tsx` | Item lists are separate; they can drift (BottomNav has 5 items + More). |

---

## 3. Marketing-site honesty and trust

Every claim below is hard-coded and cannot be backed by anything in the repo or database.

| Claim | Where | Problem | Sev |
|---|---|---|---|
| "Trusted by 12,000+ service businesses" | `Hero.tsx:25` | Repeated in `StatsBar.tsx:4`, `CTA.tsx:22`, `InlineCTABand.tsx:33`, `Testimonials.tsx:83` heading. The demo database has **1 tenant**. | Critical |
| "3.2M appointments booked" | `StatsBar.tsx:5` | Unverifiable; the demo DB has 8. | Critical |
| "98% customer satisfaction" | `StatsBar.tsx:6` | No survey exists. | Critical |
| "80% fewer no-shows" | `StatsBar.tsx:7`, `Features.tsx:14` ("up to 80%") | No measurement. Testimonials also say 50%. | High |
| "★ 4.9 from 2,400+ reviews" | `Hero.tsx:80,82`, `LeadMagnet.tsx:34` ("Loved by 2,400+ owners") | No review source. The hero also shows five avatar bubbles (JM, RC, SR, MB, TK) styled as customers. | Critical |
| Six testimonials with names, roles and "Verified on Google/Trustpilot/Capterra" badges | `Testimonials.tsx:5-52,56-57,90` | Invented people presented as verified third-party reviews. Misleading-advertising and consumer-protection exposure (India CCPA, ASCI, FTC, UK ASA). Metrics such as "Zero cancellations" and "90% automated" are specific unsupported claims. | Critical |
| "Cut no-shows by up to 80% with automatic SMS and email reminders" | `Features.tsx:14` | The codebase sends email and WhatsApp; `lib/plans.ts:183` maps `whatsappReminders` to a field named `smsReminders`. There is no SMS provider in the repo. | High |
| "Stripe-powered … instant payouts to your bank" | `Features.tsx:21` | Live integration is Razorpay (`lib/razorpay.ts`); Pricing says "Online payments (Razorpay)"; README says Stripe. "Instant payouts" is not something the code guarantees. | High |
| Prices "$1 / $2 / $6 per month" (annual), "$2 / $5 / $10" (monthly) | `lib/plans.ts:123-151`, `Pricing.tsx` (may be overridden by `PlanConfig` rows) | Placeholder-scale numbers in USD; target market is India, so INR and GST handling are missing. Also invites the question "is this a real product?" | High |
| "Free forever" plan **and** "Free 14-day trial" **and** "Start your free trial" | `HeroLeadForm.tsx` / `Pricing.tsx`, `Hero.tsx:53`, `CTA.tsx:33`, `app/signup/page.tsx:92` | Three different offers. FAQ in `PricingClient.tsx:14` says free is lifetime. | High |
| "Ready in 60 seconds" vs "under 10 minutes" | `Hero.tsx:40`, `HeroLeadForm.tsx:50`, `ProblemStatement.tsx:65` vs `signup/page.tsx:93`, `PricingClient.tsx:15` | Inconsistent; the real path includes email verification. | Medium |
| "© 2025 Calvy" | `Footer.tsx:69` | It is 2026 (signup page already says 2026, `app/signup/page.tsx`). | Low |
| Footer links `href="#"`: Integrations, Changelog, About, Careers, 𝕏, in, f | `Footer.tsx:9-15,42-44` | 7 dead links; Careers/About/Integrations/Changelog pages do not exist. | High |
| "Made with ♥ for service businesses everywhere" / "Join 12,000+ businesses that stopped managing bookings on WhatsApp" | `Footer.tsx`, `CTA.tsx:22` | Same fabricated count. | (covered) |
| Currency/Imagery: US names, `$` everywhere, hero mock "Thursday, April 24" with "+$1,240" | `Hero.tsx`, `PhoneMockups.tsx` | Western framing for an India-first audience; no INR or regional example. | Medium |

Recommendation: remove or replace every metric and testimonial until real; replace with truthful, checkable statements ("Free plan: 30 bookings/month", "Set up in about 10 minutes"), real founder story, and a real demo booking link. Keep one offer language.

---

## 4. Onboarding: signup to a live booking page

Actual path, as built:

1. **Landing `/`.** The hero email box only creates a **Lead** (`/api/leads`) and shows "Check your inbox". The visitor must click "Get started free" (navbar) to reach `/signup`. *Friction: the primary CTA does not start signup.*
2. **`/signup`** (one page): name, business name, email, password (min 8), region & currency, plus Google/Facebook buttons. Creates the user **and** the business in one request (`app/api/signup/route.ts` → `createBusinessForUser`), sends a verification email (24h token). *Friction: currency is a required step before the user has seen anything; no password visibility toggle; two-column fields cramped on mobile.*
3. **Verify email.** The user must open the email and click the link. `lib/auth.ts:56` blocks credentials login until `emailVerified` is set. If Resend is not configured or the email is lost, there is no resend button; "sign up again" fails because the email exists. *Biggest drop-off risk; also a hard dependency on email delivery.*
4. **Back to `/login`** (the verify link redirects with a banner "Email verified! You can now sign in"). The user types the credentials again. *Friction: no auto-login after verification.*
5. **`/dashboard`** (the middleware redirects logged-in users here). There is **no first-run checklist** or empty-state guidance. A new owner has to discover that they must (a) add services, (b) add staff and working hours, (c) open Booking page / Website to copy their link.
6. **`/onboarding`** exists only for OAuth users with no business; it asks business name + region, then lands on the same empty dashboard.
7. **Live booking page.** `{slug}.calvy.io` or `/b/{slug}` is live immediately, but with **no services**, so the public page shows an empty booking flow until step 5(a) is done. The default tenant site also shows stock photos and the "Professional services services" badge.

Estimated steps to a first real booking: signup (1) → verify email (2) → login (3) → add service (4) → add staff + hours (5) → share link (6). That is realistically 10 to 15 minutes, not "60 seconds".

Fixes (see PLAN.md): make the hero CTA go to `/signup?email=…`; auto-login after verify; resend-verification action; a 3-step "get live" checklist on the dashboard; seed a sample service and default working hours at business creation; show a "your page is live" link with copy/share-to-WhatsApp.

---

## 5. Bugs found during audit

| Sev | Bug | Evidence | File |
|---|---|---|---|
| **Critical** | **Import-time crash: `new Razorpay()`** runs when the module loads. With `RAZORPAY_KEY_ID` unset it throws `key_id or oauthToken is mandatory`, and every page or route that imports `lib/razorpay.ts` fails to load (500). | Dev log; `curl /booking/success` → 500 | `lib/razorpay.ts:3-6` (`key_id: process.env.RAZORPAY_KEY_ID ?? ""`) |
| **Critical** | **Import-time crash: `new Resend()`** runs at module load. With `RESEND_API_KEY` unset it throws `Missing API key`. The helper at `lib/email.tsx` ~line 20 already guards for a missing key, but the constructor on line 16 runs first, so the guard never helps. `/api/broadcasts/send` has the same problem. | Dev log after setting only Razorpay vars | `lib/email.tsx:16`, `app/api/broadcasts/send/route.ts:10` |
| **High** | **`/booking/success` returns HTTP 500**, with or without query params, as a consequence of the two crashes above (it imports both). Fresh clone with no keys cannot render the post-payment page; a missing/rotated key in production breaks the customer's confirmation screen. Screenshots of the 500: `docs/audit/screenshots/bug-booking-success-500/`. Rendered page (with dummy keys): `docs/audit/screenshots/booking/booking-success-*.png`. | | `app/booking/success/page.tsx:4-5` |
| **Medium** | Hydration error on `/dashboard/clients`: `<a>` inside `<a>` within `Card`. | Console in `DOM-CHECKS.json` | `app/dashboard/clients/ClientsClient.tsx:76-99` (`mailto:`/`tel:` `<a>` inside `<Link>`) |
| **Medium** | Hydration mismatch on `/admin/plans` (`className` differs server/client). | Console | `app/admin/plans/PlansClient.tsx:283` (status dot class depends on `item.ok`) |
| **Medium** | Tenant hero badge "Professional services services". | `tenant-site/tenant-home-375.png` | `lib/website.ts:102` |
| **Medium** | `/admin/settings` redirects to `/admin`. | `RUN-REPORT.md` | `app/admin/` |
| **Low** | Blog post renders two `<h1>`. | DOM check | `app/blog/[slug]/page.tsx:119` renders the title as h1; the second comes from the Markdown body `# heading` |
| **Low** | Verification "expired" copy tells the user to sign up again, which then fails because the email exists. | Code read | `app/login/page.tsx:20` |

Environment note: the dev server here was started with dummy Razorpay/Resend values to capture the rendered success page. Nothing was sent.

---

## 6. Missing loading / empty / error states

| State | Present | Missing |
|---|---|---|
| Loading | `loading.tsx` for all 16 dashboard sections; `Shimmer` used in 14 files; spinners in booking and forms | No loading UI for marketing pages, blog, admin, CRM, tenant site or `/b/[slug]`; booking slot loading is a spinner only |
| Empty | CRM "No leads"; some lists | No first-run empty states for a new owner (never captured: the demo account is populated and the `newowner` account has no business). Zero-value KPI tiles show `$0` / `100%` |
| Error | Inline form errors (login, signup, booking) | **No `error.tsx`, `global-error.tsx`, `not-found.tsx` anywhere.** Failed fetches in dashboard clients mostly fail silently or `console.error` (to be confirmed in the backend audit) |

---

## 7. Issue index by severity

**Critical:** fabricated metrics/reviews (Hero, StatsBar, Testimonials, CTA); import-time crashes (`lib/email.tsx:16`, `lib/razorpay.ts:3`, `app/api/broadcasts/send/route.ts:10`).

**High:** hero clipped at 375 (`Hero.tsx`); hero CTA is a lead form (`HeroLeadForm.tsx`); placeholder USD pricing (`lib/plans.ts:123`); contradictory offer and Stripe/Razorpay copy (`Features.tsx:21`, `CTA.tsx:33`, `Hero.tsx:53`); no `error.tsx`/`not-found.tsx`; unlabelled inputs and nameless icon buttons (signup, login, website editor, settings, services); dead footer links (`Footer.tsx`); `/booking/success` 500; calendar unreadable at 375 (`app/dashboard/calendar`); "SMS" claim unsupported (`Features.tsx:14`); no resend-verification path.

**Medium:** accent colour conflict (`globals.css:9` vs `tailwind.config.ts:20`); token/hex sprawl and `ui/` kit underuse; generic `<title>` on app pages; eight duplicate lead forms; tenant default copy/imagery; settings tab strip overflow; "Taken" badge overlap; no first-run checklist; hydration warnings; admin `/settings` redirect; low-contrast footer; blog cover placeholder; signup two-column cramp; step labels hidden on mobile; no timezone shown in booking.

**Low:** © 2025 (`Footer.tsx:69`); font variable names (`--font-syne` loads Plus Jakarta); double `<h1>` in blog; "Razorpay setup" in public footer; disabled Continue with no hint; 60s vs 10min wording.
