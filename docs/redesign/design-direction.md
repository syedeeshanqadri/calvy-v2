# Public website + booking redesign: design direction

Scope: tenant site `{slug}` and booking page `/b/{slug}`. Mobile-first at 375px, scales to 1440px. Mockups in `mockups/` (open `mockups/index.html`), screenshots in `screenshots/`. Demo data only: no reviews, ratings or customer counts anywhere.

**Idea:** a booking site's most useful content is *when can I come in*. Every hero carries a live availability card (next free times, today's token sessions, or upcoming classes) pulled from `/api/availability`. That card is the one bold element; everything else stays quiet.

## Hero system (from the five reference designs in etc/)
One component, three looks by pack: **split** (clinic, consultant, other: framed photo in a soft brand shape), **arch** (salon: arched window plus a round "book online" seal), **immersive** (lawyer, fitness: full-bleed dark photo, white type). Shared: two-tone headline (business name or last two words in the brand colour), trust row, floating chips, a thin top info bar, service shortcut tiles overlapping the hero edge, a desktop contact rail. The photo frame always fills the full height of the hero. Chips and trust items show only real data (open now, price from, team and service counts), never invented ratings, patient counts or years.

## Page sections (top to bottom)
1. **Header** (sticky, 64px): logo (or monogram in theme colour), name + area, section links (desktop), one primary button ("Book" / "Get appointment").
2. **Hero**: headline (owner-editable, ≤ 2 lines on desktop), one-sentence lede, primary + secondary CTA, availability card. Three layouts, chosen by pack: *split* (photo right, card overlapping the photo), *full-bleed* photo with dark gradient, *text-only*.
3. **Facts strip**: open/closed today with hours, area, and the online-consultation badge (or phone if no online services).
4. **Services**: a price list, not a card grid. Grouped by category; each row = name, tags, description, duration, price, "Book" (deep-links to that service). Desktop: sticky heading column on the left.
5. **Team**: initials avatar (photo when uploaded), name, role, "Book with {name}". Horizontal snap scroll on mobile, 4-column grid on desktop. Hidden for solo consultants.
6. **About**: image + 2 short paragraphs.
7. **Visit**: hours table (today highlighted, split shifts on two lines), phone / WhatsApp / email as 48px rows, map with address card and "Directions" link (Google Maps embed in the app).
8. **Review + social**: "Review us on Google" button (only if `googleReviewUrl` is set; never a star rating) and social icon buttons (only those set).
9. **Footer**: name + address, "Online booking by Calvy". **Mobile:** sticky bottom bar with the primary CTA; hidden ≥ 900px.

## Tokens
- **Type scale:** 1.25 ratio on mobile (14 / 16 / 20 / 25 / 36, hero 40), 1.333 from 900px (14 / 17 / 22 / 32 / 48, hero 60). Body is always Figtree 400-700, line-height 1.55, max ~70 characters per line.
- **Fonts:** loaded with `next/font/google`, `subsets: ["latin"]`, `display: "swap"`, only the weights used. Each tenant page loads Figtree plus **its own pack's** display font, never the other five (the mockups' Google links stand in for this).
- **Spacing:** 4px base (4, 8, 12, 16, 20, 24, 32, 40, 48, 64). Section padding 40px mobile / 64px desktop; hero top padding 20px / 40px (tight under the header). Gutter 20px, container 1160px.
- **Neutrals:** ink `#16181d`, muted `#586070` (6.3:1 on white), line `#e3e6eb`, page white, per-pack surface tint.
- **Touch targets:** every button, chip, slot and contact row is ≥ 48px tall.

## Theme colour, logo, imagery
- `--brand` = `Business.themeColor` via `themeVars()`: primary buttons, chips, selected states, links, map pin, avatar tint. `--brand-soft` (8% mix) for selected backgrounds; `--brand-fg` from `readableForeground()`.
- Text in brand colour needs 4.5:1 on white. If `contrastRatio(brand, #fff) < 4.5`, darken it for text and keep the original for fills (new helper `brandInk()`). Pack presets should all pass.
- Logo replaces the monogram in the header, booking header and favicon. Pack icon (lucide, `pack.icons`) is used only where there is no logo or photo, never as decoration.
- Hero/about photos: owner upload first, then the pack default. The hero photo always fills the full height of the hero panel (`object-fit: cover`). Uploads are smart-cropped server-side to 4:3 (1600x1200 hero, 1200x900 about) and saved as WebP, so any dimensions look right; the library and URL options rely on the same cover crop. **Bug found:** `HERO_IMAGES.salon` (`photo-1560472354…`) in `lib/website.ts` shows an analytics dashboard, not a salon; the clinic "Healthcare" photo is a surgery shot. Replace both.

## Per-pack differences (colour always comes from the tenant)
| Pack | Display face | Hero | Corners | Availability card |
|---|---|---|---|---|
| Clinic | Instrument Sans 600 | split | 16px | Today's sessions (token) |
| Salon & Spa | Bodoni Moda 500 | full-bleed | 2px, pill buttons | Next free times |
| Lawyer | Newsreader 500 | text-only + rule | 4px | Next free meeting times |
| Fitness | Archivo 800 condensed, uppercase headings | full-bleed | 6px | Upcoming classes + spots left |
| Consultant | Familjen Grotesk 600 | split, first-person copy | 22px, pill buttons | Next free intro calls; no team section, "About me" |
| Other | Onest 600 | split | 12px | Next free times |

## Booking flow
- **Slot:** service (multi-select, category tabs, live total) → staff ("Any available" first, each with next free time) → date & time (date strip, closed days struck through, slots grouped by part of day, "India Standard Time" stated) → who is this for (Myself / Someone else + name) → details (name, email, phone, optional notes; WhatsApp reminders box only when WhatsApp is enabled for the business) → pay → confirmation.
- **Token:** service → date & session (doctor, hours, places left, the patient's estimated time; sessions not open yet are disabled with the time booking opens) → who → details → pay → confirmation with a large queue number, estimated time, "Track your place in line". No staff step: the session belongs to a doctor.
- **Copy rule:** "token" is an internal setting name only. Customers never see it: buttons say "Get appointment" / "Get another appointment", the number is "your number in the queue", capacity is "places left".
- **Contact rules (as shipped):** India: phone and email both required. Other countries: email required, phone optional.
- **Pay** is shown only when online payment is on; options follow PayConfig (full now / booking fee now / pay at venue). Otherwise skipped, and the last button reads "Confirm booking" / "Get appointment".
- **Confirmation:** outcome headline, ticket (what, who for, when, with whom, where, payment), "Add to calendar", two buttons, **"For me, on another date"** and **"For someone else"** (both keep contact details), change/cancel link, then Google review + socials.
- **Chrome:** back button, "Step n of N" + progress bar (real sequence), summary panel on the right on desktop; on mobile the summary collapses into a bottom bar with total + Continue.
- **Online badge:** dashed outline pill with video icon on services and in the facts strip. Placeholder until online consultations ship; hide when no service is online.

## Accessibility (WCAG 2.2 AA)
Body and muted text ≥ 4.5:1; brand text via `brandInk()`; visible 3px focus ring in brand colour; skip link; one `h1` per page; hours as a real table; options as `radio`/`checkbox` with `aria-checked`; disabled slots and dates use strike-through plus colour, never colour alone; progress bar has `aria-valuenow`; the tenant's photos get alt text or are decorative (`alt=""`); `prefers-reduced-motion` respected (the mockups have no motion).
