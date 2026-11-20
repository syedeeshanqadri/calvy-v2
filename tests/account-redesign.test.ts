import { describe, it, expect, vi } from "vitest";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import { barPercent, feeLines, ladderSteps, progressWords, referralRule, rupees, shareOrCopy, stampDots, STREAK_COPY } from "@/lib/my/levelUi";
import { levelFee, DEFAULT_LEVEL_CONFIG } from "@/lib/rewards/levels";
import { LEVELS } from "@/lib/rewards/levels";

// Step 36b: the customer dashboard. The level ladder, the plain-words progress, the stamps, the share fallback, and the wording rule: no fee amounts.

describe("the ladder", () => {
  it("has the five levels in order; past ones are done, the current one is highlighted, the next is the goal, the rest are locked", () => {
    expect(LEVELS).toEqual(["STARTER", "REGULAR", "INSIDER", "PRO", "LEGEND"]);
    expect(ladderSteps("INSIDER").map((s) => s.state)).toEqual(["done", "done", "current", "next", "locked"]);
    expect(ladderSteps("STARTER").map((s) => s.state)).toEqual(["current", "next", "locked", "locked", "locked"]);
    expect(ladderSteps("LEGEND").map((s) => s.state)).toEqual(["done", "done", "done", "done", "current"]);
  });
});

describe("progress is in words, never numbers", () => {
  it("maps the ratio to a phrase", () => {
    expect(progressWords(0, false)).toBe("Just getting started");
    expect(progressWords(0.3, false)).toBe("Making progress");
    expect(progressWords(0.5, false)).toBe("Halfway there");
    expect(progressWords(0.8, false)).toBe("Getting close");
    expect(progressWords(0.95, false)).toBe("Almost there");
    expect(progressWords(0.5, true)).toBe("You're at the top level");
    expect(progressWords(Number.NaN, false)).toBe("Just getting started");
    for (const r of [0, 0.1, 0.3, 0.5, 0.8, 0.95, 1]) expect(progressWords(r, false)).not.toMatch(/\d/);
  });
  it("the bar stays visible and never claims a full bar before the level is reached", () => {
    expect(barPercent(0, false)).toBe(6);
    expect(barPercent(1, false)).toBe(96);
    expect(barPercent(0.5, false)).toBe(50);
    expect(barPercent(0.1, true)).toBe(100);
    expect(barPercent(-4, false)).toBe(6);
  });
});

describe("fee wording: signed-in customers see their actual fee, the public marketing pages say \"nominal fee\"", () => {
  it("the hero shows the customer's real fee for their level, from the same function checkout uses, only where a fee applies", () => {
    expect(rupees(800)).toBe("\u20B98");
    for (const lvl of LEVELS) expect(feeLines(lvl, false, 800, 1000)).toEqual([]);
    expect(feeLines("INSIDER", true, 800, 1000)).toEqual(["Your booking fee: \u20B98 (instead of \u20B910)", "Your booking fee drops as you level up."]);
    expect(feeLines("STARTER", true, 1000, 1000)).toEqual(["Your booking fee: \u20B910", "Your booking fee drops as you level up."]);
    expect(feeLines("LEGEND", true, 600, 1000)).toEqual(["Your booking fee: \u20B96 (instead of \u20B910)"]);
    // The number is the level's configured fee: the same levelFee() the booking charge reads.
    for (const [lvl, rs] of [["STARTER", 10], ["REGULAR", 9], ["INSIDER", 8], ["PRO", 7], ["LEGEND", 6]] as const) {
      const fee = levelFee(lvl, 1000, DEFAULT_LEVEL_CONFIG);
      expect(feeLines(lvl, true, fee, 1000)[0]).toContain(`\u20B9${rs}`);
    }
  });
  it("the referral rule names the real free confirmation", () => {
    expect(referralRule(1000)).toBe("When your friend attends their first visit, you both get a free \u20B910 confirmation (up to 5 a month).");
  });
  const read = (p: string) => readFileSync(p, "utf8");
  const code = (p: string) => read(p).split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");
  const FEE = /(?:\u20B9|Rs\.?)\s?(?:10|[6-9])(?!\d)/;
  it("logged-in customer areas, emails and the tracking page keep exact amounts (no 'nominal' replacements there)", () => {
    for (const f of ["components/my/LevelHero.tsx", "app/account/(app)/LevelUpCelebration.tsx", "lib/customerView.ts", "lib/queue.ts", "app/booking/[code]/TrackClient.tsx", "emails/templates.tsx", "lib/notifications/templates.tsx"]) {
      expect(code(f), f).not.toMatch(/nominal/i);
    }
    expect(code("lib/customerView.ts")).toContain("Rs 10");
    expect(code("emails/templates.tsx")).toContain("Rs 10 confirmation fee");
    expect(code("lib/queue.ts")).toContain("Rs 10 confirmation fee");
    expect(code("app/booking/[code]/TrackClient.tsx")).toContain("Rs 10 confirmation fee");
    expect(code("app/account/(app)/LevelUpCelebration.tsx")).toContain("{feeLabel}");
    expect(code("lib/notifications/templates.tsx")).toMatch(/feeLabel=\{`Rs \$\{p\.feeMinor \/ 100\}`\}/);
  });
  it("the public marketing home page and About carry no Calvy fee amount (they say 'nominal fee'); checkout, terms, refund policy, help and owner settings keep exact amounts", () => {
    for (const f of ["app/page.tsx", "app/about/page.tsx", "lib/landingFeatures.ts", "lib/landingFaq.ts", "lib/pricing.ts", "lib/planCopy.ts", ...readdirSync("components/landing").map((n) => `components/landing/${n}`)]) expect(code(f), f).not.toMatch(FEE);
    expect(code("lib/landingFeatures.ts")).toMatch(/nominal confirmation fee/);
    expect(code("lib/planCopy.ts")).toMatch(/nominal platform fee/);
    expect(code("app/terms/page.tsx")).toContain("\u20B910");
    expect(code("app/refund-policy/page.tsx")).toContain("\u20B910");
    expect(code("lib/helpArticles.ts")).toContain("Rs 10");
  });
  it("level perks carry no amount", () => {
    const src = read("lib/rewards/levelService.ts");
    expect(src.slice(src.indexOf("export const PERK_TEXT"), src.indexOf("/** Pro and Legend"))).not.toMatch(FEE);
  });
});

describe("stamps and streak", () => {
  it("seven dots, filled for each attended visit, never more than seven", () => {
    expect(stampDots(0, 7)).toEqual(Array(7).fill(false));
    expect(stampDots(3, 7).filter(Boolean)).toHaveLength(3);
    expect(stampDots(9, 7).filter(Boolean)).toHaveLength(7);
    expect(stampDots(-2, 7).filter(Boolean)).toHaveLength(0);
    expect(stampDots(3, 7)).toHaveLength(7);
  });
  it("streak copy", () => {
    expect(STREAK_COPY(0)).toMatch(/start a streak/);
    expect(STREAK_COPY(1)).toMatch(/^1-month streak/);
    expect(STREAK_COPY(4)).toMatch(/^4-month streak/);
  });
});

describe("referral: share with the Web Share API, fall back to copying", () => {
  const data = { title: "t", text: "x", url: "https://a.calvy.io/book?cref=ABC" };
  it("shares when the browser can", async () => {
    const share = vi.fn(async () => undefined), copy = vi.fn(async () => undefined);
    expect(await shareOrCopy(data, { share, copy })).toBe("shared");
    expect(share).toHaveBeenCalledWith(data);
    expect(copy).not.toHaveBeenCalled();
  });
  it("copies the link when there is no share sheet, or sharing fails for any reason except the person cancelling", async () => {
    const copy = vi.fn(async () => undefined);
    expect(await shareOrCopy(data, { copy })).toBe("copied");
    expect(copy).toHaveBeenCalledWith(data.url);
    expect(await shareOrCopy(data, { share: async () => { throw new Error("nope"); }, copy })).toBe("copied");
    const abort = Object.assign(new Error("closed"), { name: "AbortError" });
    expect(await shareOrCopy(data, { share: async () => { throw abort; }, copy })).toBe("cancelled");
    expect(await shareOrCopy(data, {})).toBe("failed");
    expect(await shareOrCopy(data, { copy: async () => { throw new Error("blocked"); } })).toBe("failed");
  });
});

describe("the page structure", () => {
  const page = readFileSync("app/account/(app)/page.tsx", "utf8");
  it("sections come in the agreed order, and every list has an empty state", () => {
    const order = ["<LevelHero", "<StampsCard", "<StreakCard", "<ReferralCard", 'id="upcoming"', 'id="past"', "<RateVisits", 'id="settings"'].map((s) => page.indexOf(s));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(page.match(/<EmptyState/g)!.length).toBeGreaterThanOrEqual(2);
    expect(readFileSync("components/my/RateVisits.tsx", "utf8")).toContain("<EmptyState");
  });
  it("settings hold profile, Link Google, set password, notifications, forget this device and account deletion", () => {
    for (const piece of ["<ProfileCard", "<LinkGoogle", "<SetPasswordCard", "<NotificationsCard", "<ForgetDevice", "<DeleteAccountCard"]) expect(page).toContain(piece);
  });
  it("animations switch off for reduced motion", () => {
    expect(readFileSync("app/globals.css", "utf8")).toMatch(/@media \(prefers-reduced-motion: reduce\) \{ \.acct-bar-fill, \.acct-step, \.acct-dot-on \{ animation: none; \} \}/);
  });
  it("the notifications row is read-only and uses the optional-email unsubscribe link", () => {
    const parts = readFileSync("components/my/SettingsParts.tsx", "utf8");
    expect(parts).toContain("Unsubscribe from offers &amp; reminders");
    expect(readFileSync("lib/customerData.ts", "utf8")).toContain("unsubscribeLinks(");
  });
});

describe("no payment or billing file is touched by this step", () => {
  it("the customer files only import (never edit) the region helper", () => {
    expect(readdirSync("components/my").length).toBeGreaterThan(5);
    expect(readFileSync("lib/customerData.ts", "utf8")).toContain('from "@/lib/payments/region"');
    expect(join("lib", "payments")).toBe("lib/payments");
  });
});
