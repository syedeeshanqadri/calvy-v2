// Input checks for creating or editing a coupon (admin screen and, later, the business screen). Dates arrive as ISO strings.
import { z } from "zod";
import { CODE_PATTERN, COUPON_TARGETS, normalizeCode } from "./rules";

const date = z.string().trim().min(1).max(40).refine((s) => !Number.isNaN(Date.parse(s)), "Not a valid date").transform((s) => new Date(s));
const ids = z.array(z.string().trim().min(1).max(60)).max(200).default([]);

export const couponInputSchema = z.object({
  code: z.string().trim().max(40).transform(normalizeCode).refine((c) => CODE_PATTERN.test(c), "Use 3 to 24 letters, digits, dashes or underscores"),
  name: z.string().trim().min(1).max(80),
  target: z.enum(COUPON_TARGETS as unknown as [string, ...string[]]),
  kind: z.enum(["PERCENT", "FLAT"]),
  value: z.number().int().min(1).max(10_000_000),
  minAmountMinor: z.number().int().min(0).max(100_000_000).default(0),
  startsAt: date.nullable().optional(),
  endsAt: date.nullable().optional(),
  maxRedemptions: z.number().int().min(1).max(1_000_000).nullable().optional(),
  perCustomerLimit: z.number().int().min(1).max(1000).default(1),
  firstBookingOnly: z.boolean().default(false),
  planIds: ids,
  businessIds: ids,
  serviceIds: ids,
  active: z.boolean().default(true),
}).superRefine((c, ctx) => {
  if (c.kind === "PERCENT" && c.value > 100) ctx.addIssue({ code: "custom", path: ["value"], message: "A percentage is 1 to 100" });
  if (c.startsAt && c.endsAt && c.endsAt <= c.startsAt) ctx.addIssue({ code: "custom", path: ["endsAt"], message: "The end must be after the start" });
  if (c.target === "SUBSCRIPTION" && c.planIds.some((p) => p !== "professional" && p !== "business")) ctx.addIssue({ code: "custom", path: ["planIds"], message: "Unknown plan" });
});

export type CouponInput = z.infer<typeof couponInputSchema>;

// ── Business side ──
const toDate = z.string().trim().min(1).max(40).refine((s) => !Number.isNaN(Date.parse(s)), "Not a valid date").transform((s) => new Date(s));

/** A business's own coupon: always for its services (target SERVICE); owner and business come from the session, never the body. */
export const businessCouponSchema = z.object({
  code: z.string().trim().max(40).transform(normalizeCode).refine((c) => CODE_PATTERN.test(c), "Use 3 to 24 letters, digits, dashes or underscores"),
  name: z.string().trim().min(1).max(80),
  kind: z.enum(["PERCENT", "FLAT"]),
  value: z.number().int().min(1).max(100_000_000),
  minAmountMinor: z.number().int().min(0).max(100_000_000).default(0),
  startsAt: toDate.nullable().optional(),
  endsAt: toDate.nullable().optional(),
  maxRedemptions: z.number().int().min(1).max(1_000_000).nullable().optional(),
  perCustomerLimit: z.number().int().min(1).max(1000).default(1),
  firstBookingOnly: z.boolean().default(false),
  serviceIds: z.array(z.string().trim().min(1).max(60)).max(100).default([]),
}).superRefine((c, ctx) => {
  if (c.kind === "PERCENT" && c.value > 100) ctx.addIssue({ code: "custom", path: ["value"], message: "A percentage is 1 to 100" });
  if (c.startsAt && c.endsAt && c.endsAt <= c.startsAt) ctx.addIssue({ code: "custom", path: ["endsAt"], message: "The end must be after the start" });
});

export const offerInputSchema = z.object({
  kind: z.enum(["NTH_VISIT", "HAPPY_HOUR", "BUNDLE"]),
  name: z.string().trim().min(1).max(80),
  percent: z.number().int().min(1).max(90),
  nth: z.number().int().min(2).max(100).nullable().optional(),
  days: z.array(z.number().int().min(0).max(6)).max(7).default([]),
  startMinute: z.number().int().min(0).max(1439).nullable().optional(),
  endMinute: z.number().int().min(1).max(1440).nullable().optional(),
  serviceIds: z.array(z.string().trim().min(1).max(60)).max(100).default([]),
  startsAt: toDate.nullable().optional(),
  endsAt: toDate.nullable().optional(),
  active: z.boolean().default(true),
  showOnSite: z.boolean().default(true),
}).superRefine((o, ctx) => {
  if (o.kind === "NTH_VISIT" && !o.nth) ctx.addIssue({ code: "custom", path: ["nth"], message: "Say which visit (2 or more)" });
  if (o.kind === "HAPPY_HOUR") {
    if (o.startMinute == null || o.endMinute == null) ctx.addIssue({ code: "custom", path: ["startMinute"], message: "Give a start and end time" });
    else if (o.endMinute <= o.startMinute) ctx.addIssue({ code: "custom", path: ["endMinute"], message: "The end time must be after the start" });
  }
  if (o.kind === "BUNDLE" && o.serviceIds.length < 2) ctx.addIssue({ code: "custom", path: ["serviceIds"], message: "Pick at least two services for a package" });
  if (o.startsAt && o.endsAt && o.endsAt <= o.startsAt) ctx.addIssue({ code: "custom", path: ["endsAt"], message: "The end must be after the start" });
});
export type OfferInput = z.infer<typeof offerInputSchema>;
