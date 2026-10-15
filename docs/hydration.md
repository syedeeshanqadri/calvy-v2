# Hydration and image warnings (S1-31, S1-32)

## S1-31: "Extra attributes from the server: style" / "Prop `style` did not match"

Status: **fix applied, not yet verified in a browser.** Verify in a clean profile (no extensions).

Likely causes, in order:

1. **Inline `style` with `env(safe-area-inset-*)`, `max()` or `calc()`** on shared layouts (`AuthShell`,
   `StatusPage`, dashboard/admin `Header`, `BottomNav`, `PWAInstallPrompt`). React compares the server HTML
   with what the browser re-serialises; browsers may normalise these values differently. Fix: the values now
   live in CSS classes (`safe-pt-4`, `safe-pb-4`, `safe-header-14`, ... in `app/globals.css`), so there is no
   inline style to compare.
2. **Inline `paddingLeft` next to a Tailwind class** (`HelpSearch`). Replaced by a `pl-13` class.
3. **Browser extensions** (password managers, Grammarly, dark-mode tools) inject `style` and other attributes
   into inputs before hydration. This cannot be fixed in code; it disappears in a clean profile.

Not changed: dynamic inline colours in `BookingClient` / `SettingsClient` (`style={{ background: color }}`).
They are computed from the same data on server and client, so they should not mismatch.

How to verify: open `/login`, `/signup`, `/b/<slug>`, `/blog`, `/help`, `/dashboard/settings` in a private
window with extensions disabled and check the console for hydration warnings.

## S1-32: `calvy.svg` "width or height modified, but not the other"

`calvy.svg` is 236x60. Tailwind preflight sets `img { height: auto }`, so a `height` attribute that differs
from the rendered height makes `next/image` warn. All uses now go through `components/ui/Logo.tsx`, which
derives `height` from `width` using the real aspect ratio and sets `style={{ width, height: "auto" }}`.
