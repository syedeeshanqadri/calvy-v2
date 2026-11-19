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
