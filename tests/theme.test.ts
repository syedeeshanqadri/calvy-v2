import { describe, expect, it } from "vitest";
import {
  DEFAULT_THEME, PACK_THEME_PRESETS, bestContrast, brandInk, contrastRatio, isValidHex, normalizeHex, readableForeground,
  relativeLuminance, safeThemeColor, textOnWhiteWarning, themePresets, themeVars,
} from "@/lib/theme";
import { settingsPatchSchema } from "@/lib/validation/settings";

describe("hex helpers", () => {
  it("normalises 3 and 6 digit colours to lowercase #rrggbb", () => {
    expect(normalizeHex("#FA0")).toBe("#ffaa00");
    expect(normalizeHex(" #0284C7 ")).toBe("#0284c7");
  });
  it.each(["red", "#ff", "#ggg", "0284c7", "#12345", "", "#0284c7;}", "#fff;background:url(x)", "url(javascript:1)", null, undefined, 5])(
    "rejects %s", (v) => { expect(isValidHex(v)).toBe(false); expect(normalizeHex(v)).toBeNull(); });
  it("safeThemeColor falls back to the default for anything invalid", () => {
    expect(safeThemeColor("nope")).toBe(DEFAULT_THEME);
    expect(safeThemeColor(undefined)).toBe(DEFAULT_THEME);
    expect(safeThemeColor("#ABC")).toBe("#aabbcc");
  });
});

describe("contrast", () => {
  it("black and white are 21:1, same colour is 1:1", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrastRatio("#336699", "#336699")).toBeCloseTo(1, 5);
  });
  it("luminance runs 0..1", () => {
    expect(relativeLuminance("#000")).toBe(0);
    expect(relativeLuminance("#fff")).toBeCloseTo(1, 5);
  });
  it("picks white text on dark and near-black text on light backgrounds", () => {
    expect(readableForeground("#0f172a")).toBe("#ffffff");
    expect(readableForeground("#ffe14d")).toBe("#0f0f1a");
    expect(readableForeground("#ffffff")).toBe("#0f0f1a");
  });
  it("the chosen foreground is never worse than the other option", () => {
    for (const c of ["#0284c7", "#f59e0b", "#22c55e", "#ec4899", "#fde047", "#1e3a8a", "#777777"]) {
      const fg = readableForeground(c);
      const other = fg === "#ffffff" ? "#0f0f1a" : "#ffffff";
      expect(contrastRatio(c, fg)).toBeGreaterThanOrEqual(contrastRatio(c, other));
      expect(bestContrast(c)).toBeCloseTo(contrastRatio(c, fg), 5);
    }
  });
  it("warns only for colours too pale to read as text on white", () => {
    expect(textOnWhiteWarning("#fde047")).toMatch(/light/);
    expect(textOnWhiteWarning("#0284c7")).toBeNull();
  });
});

describe("themeVars and presets", () => {
  it("emits only safe values and falls back on bad input", () => {
    expect(themeVars("#0f172a")).toEqual({ "--brand": "#0f172a", "--brand-fg": "#ffffff", "--brand-soft": "#0f172a1a", "--brand-ink": "#0f172a" });
    const bad = themeVars("red;} body{display:none");
    expect(bad["--brand"]).toBe(DEFAULT_THEME);
    for (const v of Object.values(bad)) expect(v).toMatch(/^#[0-9a-f]{6,8}$/);
  });
  it("every preset is a valid hex, per pack and default", () => {
    for (const list of [...Object.values(PACK_THEME_PRESETS), themePresets("OTHER"), themePresets(undefined)]) {
      expect(list.length).toBeGreaterThanOrEqual(5);
      for (const c of list) expect(isValidHex(c)).toBe(true);
    }
    expect(themePresets("CLINIC")).toEqual(PACK_THEME_PRESETS.CLINIC);
  });
});

describe("brandInk", () => {
  it("keeps a colour that already reads on white", () => {
    expect(brandInk("#1e3a8a")).toBe("#1e3a8a");
  });
  it.each(["#fde047", "#f59e0b", "#22c55e", "#0ea5e9", "#ec4899", "#ffffff"])("darkens %s to AA on white", (c) => {
    const ink = brandInk(c);
    expect(contrastRatio(ink, "#ffffff")).toBeGreaterThanOrEqual(4.5);
    expect(isValidHex(ink)).toBe(true);
  });
  it("falls back to the default theme for junk input", () => {
    expect(brandInk("red;}")).toBe(brandInk(DEFAULT_THEME));
  });
});

describe("settings API colour validation", () => {
  it("stores a normalised colour, any plan", () => {
    const r = settingsPatchSchema.safeParse({ primaryColor: "#FA0" });
    expect(r.success && r.data.primaryColor).toBe("#ffaa00");
  });
  it.each(["red", "#ff", "#fff;}", "expression(1)", "#12345"])("rejects %s", (v) => {
    expect(settingsPatchSchema.safeParse({ primaryColor: v }).success).toBe(false);
  });
});
