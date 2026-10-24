import { z } from "zod";
import { text, emailField } from "./common";

export const PLAN_IDS = ["free", "trial", "starter", "professional", "business"] as const;
export const PLAN_STATUSES = ["free", "trialing", "active", "past_due", "cancelled", "canceled", "expired"] as const;
export const TICKET_STATUSES = ["open", "in_progress", "resolved", "closed"] as const;
export const TICKET_PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export const LEAD_STAGES = ["new", "contacted", "qualified", "demo", "won", "lost"] as const;

export const adminPageQuery = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  limit: z.coerce.number().int().min(1).max(500).default(200),
});

export const tenantPatchSchema = z.object({
  plan: z.enum(PLAN_IDS).optional(),
  planStatus: z.enum(PLAN_STATUSES).optional(),
  trialEndsAt: z
    .string()
    .max(40)
    .refine((d) => !Number.isNaN(new Date(d).getTime()), "Invalid trialEndsAt")
    .nullable()
    .optional(),
});

/** Destructive: the caller must echo the tenant's slug. */
export const tenantDeleteSchema = z.object({ confirm: text(100).min(1, "confirm is required") });

export const makeAdminSchema = z.object({
  email: emailField,
  secret: z.string().max(300).optional(),
});

const settingKey = z.string().regex(/^[a-zA-Z0-9_.-]{1,64}$/, "Invalid setting key");
export const appSettingsPatchSchema = z
  .record(settingKey, z.union([z.string().max(2000), z.number(), z.boolean()]))
  .refine((o) => Object.keys(o).length <= 50, "Too many settings");

export const adminNotificationSchema = z
  .object({
    title: text(120).min(1, "title and body are required"),
    body: text(500).min(1, "title and body are required"),
    url: z.string().trim().max(500).regex(/^(\/|https:\/\/)/, "url must be a path or https URL").optional().or(z.literal("")),
    targetPlan: z.enum(PLAN_IDS).optional(),
    targetAll: z.boolean().optional(),
  })
  .refine((v) => v.targetAll || v.targetPlan, { message: "Specify targetAll or targetPlan" });

export const adminTicketListQuery = adminPageQuery.extend({ status: z.enum(TICKET_STATUSES).optional() });
export const adminTicketPatchSchema = z.object({
  status: z.enum(TICKET_STATUSES).optional(),
  priority: z.enum(TICKET_PRIORITIES).optional(),
});

export const leadPatchSchema = z.object({
  status: z.enum(LEAD_STAGES, { error: "Invalid stage" }).optional(),
  notes: z.string().max(5000).nullable().optional(),
});

const optText = (max: number) => z.string().max(max).nullish();
export const postCreateSchema = z.object({
  title: text(300).min(1, "Title and content are required."),
  content: z.string().trim().min(1, "Title and content are required.").max(300_000),
  slug: optText(200),
  excerpt: optText(1000),
  coverImage: optText(1000),
  authorName: optText(120),
  tags: z.string().max(500).optional(),
  seoTitle: optText(300),
  seoDescription: optText(500),
  faq: z.unknown().optional(),
  published: z.boolean().optional(),
});
export const postPatchSchema = z.object({
  title: text(300).optional(),
  content: z.string().max(300_000).optional(),
  slug: optText(200),
  excerpt: optText(1000),
  coverImage: optText(1000),
  authorName: optText(120),
  tags: z.string().max(500).optional(),
  seoTitle: optText(300),
  seoDescription: optText(500),
  faq: z.unknown().optional(),
  published: z.boolean().optional(),
});

const nonNeg = z.coerce.number().finite().min(0).max(10_000_000);
const limitNum = z.coerce.number().int().min(-1).max(1_000_000);
const PLAN_FLAGS = [
  "analytics", "customBranding", "imageUpload", "seoControls", "chatbotWidget", "groupBooking",
  "multiService", "stripePayments", "emailReminders", "smsReminders", "broadcasts", "csvExport",
  "expenseTracking", "wallet", "customSlotInterval", "removeBranding", "prioritySupport",
] as const;
const flagShape = Object.fromEntries(PLAN_FLAGS.map((k) => [k, z.boolean().optional()])) as Record<
  (typeof PLAN_FLAGS)[number],
  z.ZodOptional<z.ZodBoolean>
>;
export const planPatchSchema = z.object({
  name: text(80).min(1).optional(),
  price: nonNeg.optional(),
  annualPrice: nonNeg.optional(),
  description: text(500).optional(),
  maxStaff: limitNum.optional(),
  maxServices: limitNum.optional(),
  maxMonthlyAppointments: limitNum.optional(),
  maxBroadcastsPerMonth: limitNum.optional(),
  platformFeeMinorIN: z.coerce.number().int().min(0).max(100_000).optional(),
  ...flagShape,
  features: z.array(z.string().max(200)).max(50).optional(),
});
export const adminMessageSchema = z.object({ body: text(5000).min(1, "Message body is required") });
