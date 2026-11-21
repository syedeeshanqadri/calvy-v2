# Step 36c: admin and dashboard shell

Screenshots here are taken by `tests/e2e/shell.spec.ts` (`SHELL_SHOTS=1`), one per page per width (375, 768, 1024, 1440). The same run asserts, for every page and width:
main starts below the header, main sits inside the viewport, and the page never scrolls sideways.

## What was wrong (admin)
- The shell was `h-screen` (100vh): the bottom of every page was cut off under a phone's address bar.
- `<main>` had no padding, so each page padded itself, differently: six pages (Billing, Coupons, Customers, Offers, Referrals, Rewards) had none and sat flush against the header and the screen edges.
- The sidebar turned into a drawer below 768px (not 1024px) and had no focus trap, no Escape, and stayed in the tab order when closed.
- Tables were clipped or squashed instead of scrolling inside their card; long cells had no truncation or tooltip.
- Header buttons were 36px targets; the loading skeleton added its own padding on top.

## What changed
- One shell (`components/admin/AdminLayout.tsx`): `h-dvh`, sticky header, ONE scrolling `<main>` that supplies the padding (`p-4 / sm:p-6 / lg:p-8`) and a 1400px max width. Pages render content only.
- Drawer under 1024px: backdrop, Escape, focus trap, focus returned to the menu button, `inert` while closed, closes on navigation and when the window widens.
- Layers: header 30, drawer backdrop 40, drawer 50, notifications backdrop 60, notifications panel 61, toast 70. Opening the notifications panel closes the drawer.
- `TableCard` and `TruncCell`: tables scroll inside their card, long text truncates with a tooltip.
- Dashboard: the shell was already `h-dvh`; its two visual problems are fixed (see below).

## Fixed list
| Page | 375 | 768 | 1024 | 1440 | What was fixed |
|---|---|---|---|---|---|
| /admin | fixed | fixed | fixed | fixed | padding, dvh |
| /admin/businesses | fixed | fixed | fixed | fixed | table scrolls inside its card, long names truncate |
| /admin/businesses/new | fixed | fixed | fixed | fixed | padding |
| /admin/businesses/[id] | fixed | fixed | fixed | fixed | padding, two-column grids can shrink |
| /admin/plans | fixed | fixed | fixed | fixed | padding |
| /admin/revenue | fixed | fixed | fixed | fixed | tenant table scrolls inside its card |
| /admin/billing | fixed | fixed | fixed | fixed | had no padding |
| /admin/offers | fixed | fixed | fixed | fixed | had no padding |
| /admin/coupons | fixed | fixed | fixed | fixed | had no padding |
| /admin/customers | fixed | fixed | fixed | fixed | had no padding |
| /admin/referrals | fixed | fixed | fixed | fixed | had no padding |
| /admin/rewards | fixed | fixed | fixed | fixed | had no padding |
| /admin/notifications | fixed | fixed | fixed | fixed | padding |
| /admin/notifications/log | fixed | fixed | fixed | fixed | failure table scrolls inside its card |
| /admin/whatsapp-review | fixed | fixed | fixed | fixed | padding |
| /admin/blog | fixed | fixed | fixed | fixed | double padding removed |
| /admin/support | fixed | fixed | fixed | fixed | status tabs no longer wrap or overflow |
| /admin/audit | fixed | fixed | fixed | fixed | table scrolls, reason/detail/email truncate with tooltip |
| /admin/settings | fixed | fixed | fixed | fixed | padding |
| /admin/2fa | not in scope | | | | separate full-screen layout, not the admin shell |

## Dashboard (checked at the same four widths, no overlap found)
/dashboard, appointments, calendar, clients, services, staff, queue, analytics, expenses, offers, website, booking-page, payments, settings, support, billing (layout only): all pass.
Two visual fixes: the "Tap to enable sound" chip now sits above the bottom tabs with safe-area padding, can be dismissed (remembered on this device, tested), and disappears once sound is on; the collapsed sidebar shows the icon mark at 30px instead of a 28px-wide wordmark.

## Not re-photographed
The chip's no-wrap tweak (one line instead of two on a 375px phone) was made after the last screenshot run.
