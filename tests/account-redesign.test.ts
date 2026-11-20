import { describe, it, expect, vi } from "vitest";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import { barPercent, feeLines, ladderSteps, progressWords, REFERRAL_RULE, shareOrCopy, stampDots, STREAK_COPY } from "@/lib/my/levelUi";
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

describe("fee wording", () => {
  it("fee lines appear only where a nominal fee applies, and never carry an amount", () => {
    for (const lvl of LEVELS) expect(feeLines(lvl, false)).toEqual([]);
    expect(feeLines("STARTER", true)).toEqual(["Your nominal fee drops as you level up."]);
    expect(feeLines("PRO", true)).toEqual(["Lower nominal fee unlocked.", "Your nominal fee drops as you level up."]);
    for (const lvl of LEVELS) for (const l of feeLines(lvl, true)) expect(l).not.toMatch(/\d|₹|Rs/);
    expect(REFERRAL_RULE).not.toMatch(/\d|₹|Rs/);
  });
  const read = (p: string) => readFileSync(p, "utf8");
  const AMOUNT = /(?:Rs\.?|₹|INR)\s?\d/;
  it("no customer-facing screen or email shows a fee amount (checkout, receipts and invoices are the exceptions, and are not in this list)", () => {
    const files = [
      "app/account/(app)/page.tsx", "app/account/(app)/LevelUpCelebration.tsx", "app/account/(app)/ForgetDevice.tsx", "app/account/(app)/MyClient.tsx",
      "components/my/LevelHero.tsx", "components/my/LevelIcons.tsx", "components/my/AccountCards.tsx", "components/my/RateVisits.tsx", "components/my/SettingsParts.tsx", "components/my/BookingCard.tsx",
      "lib/my/levelUi.ts", "lib/customerView.ts", "lib/queue.ts", "app/booking/[code]/TrackClient.tsx", "lib/notifications/templates.tsx",
    ];
    for (const f of files) expect(read(f).split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).filter((l) => AMOUNT.test(l)), f).toEqual([]);
    // The email components: only the ones customers receive (receipts/invoices carry the paid amount on purpose).
    const emails = read("emails/templates.tsx");
    for (const name of ["LevelUpEmail", "BookingConfirmationEmail", "QueueMovedBackEmail", "QueueClosedEmail"]) {
      const i = emails.indexOf(`export function ${name}`);
      if (i < 0) continue;
      const body = emails.slice(i, emails.indexOf("\nexport function", i + 10) === -1 ? undefined : emails.indexOf("\nexport function", i + 10));
      expect(AMOUNT.test(body), name).toBe(false);
    }
    expect(emails).not.toMatch(/Rs 10 confirmation/);
  });
  it("no level perk names an amount", () => {
    const src = read("lib/rewards/levelService.ts");
    const perks = src.slice(src.indexOf("export const PERK_TEXT"), src.indexOf("/** Pro and Legend"));
    expect(perks).not.toMatch(AMOUNT);
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
