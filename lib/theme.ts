// Theme colour helpers for the public website and booking page. Only validated
// hex colours ever reach a style attribute, so a tenant cannot inject CSS.

export const DEFAULT_THEME = "#0284c7";

const HEX_RE = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

export function isValidHex(v: unknown): v is string {
  return typeof v === "string" && HEX_RE.test(v.trim());
}

/** "#FA0" -> "#ffaa00". Returns null for anything that is not a 3 or 6 digit hex colour. */
export function normalizeHex(v: unknown): string | null {
  if (!isValidHex(v)) return null;
  let h = v.trim().slice(1).toLowerCase();
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  return `#${h}`;
}

/** A safe colour for rendering: the normalized value, or the default when invalid/empty. */
export function safeThemeColor(v: unknown): string {
  return normalizeHex(v) ?? DEFAULT_THEME;
}

function channel(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

/** WCAG relative luminance (0 = black, 1 = white). */
export function relativeLuminance(hex: string): number {
  const h = safeThemeColor(hex).slice(1);
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG contrast ratio between two colours, 1 to 21. */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const LIGHT_FG = "#ffffff";
const DARK_FG = "#0f0f1a";

/** Text colour (white or near-black) that reads best on the given background. */
export function readableForeground(bg: string): string {
  return contrastRatio(bg, LIGHT_FG) >= contrastRatio(bg, DARK_FG) ? LIGHT_FG : DARK_FG;
}

/** Contrast of the best foreground on this background. WCAG AA for normal text needs 4.5. */
export function bestContrast(bg: string): number {
  return Math.max(contrastRatio(bg, LIGHT_FG), contrastRatio(bg, DARK_FG));
}

/** The colour as text on a white page (prices, links): warn the owner when it is too pale. */
export function textOnWhiteWarning(hex: string): string | null {
  return contrastRatio(hex, "#ffffff") < 3
    ? "This colour is quite light. Prices and links on a white background may be hard to read."
    : null;
}

/** CSS custom properties for the brand colour; safe to spread into a style prop. */
export function themeVars(hex: unknown): Record<string, string> {
  const brand = safeThemeColor(hex);
  return { "--brand": brand, "--brand-fg": readableForeground(brand), "--brand-soft": `${brand}1a` };
}

/** Quick-pick colours per business pack (any pack id not listed gets the default set). */
const DEFAULT_PRESETS = ["#0284c7", "#3b82f6", "#8b5cf6", "#22c55e", "#f59e0b", "#ec4899", "#14b8a6", "#f97316", "#0f0f1a"];
export const PACK_THEME_PRESETS: Record<string, string[]> = {
  CLINIC: ["#0ea5e9", "#0284c7", "#14b8a6", "#22c55e", "#6366f1", "#0f766e", "#1d4ed8", "#0f0f1a"],
  SALON_SPA: ["#ec4899", "#be185d", "#8b5cf6", "#f59e0b", "#e84545", "#14b8a6", "#a16207", "#0f0f1a"],
  LAWYER: ["#1e3a8a", "#0f172a", "#7c2d12", "#166534", "#6d28d9", "#334155", "#92400e", "#0f0f1a"],
  FITNESS: ["#ef4444", "#f97316", "#f59e0b", "#22c55e", "#0ea5e9", "#7c3aed", "#14b8a6", "#0f0f1a"],
};

export function themePresets(packId: string | null | undefined): string[] {
  return (packId && PACK_THEME_PRESETS[packId]) || DEFAULT_PRESETS;
}
