import { z } from "zod";
import { PACK_IDS } from "@/lib/packs/types";
import { REGIONS } from "@/lib/regions";
import { isValidTimeZone } from "@/lib/time";
import { phoneField, text } from "@/lib/validation/common";
import { validateSlug } from "@/lib/slugs";

/** Wizard steps, in order. The number is what Business.onboardingStep stores. */
export const STEPS = ["region", "type", "basics", "mode", "services", "hours", "plan", "done"] as const;
export type StepName = (typeof STEPS)[number];
export const LAST_STEP = STEPS.length;
/** Steps the owner may skip (defaults stay in place). */
export const SKIPPABLE: ReadonlySet<StepName> = new Set(["region", "mode", "services", "hours", "plan"]);

export type RegionGroup = "IN" | "INTL";

export function detectRegion(timeZone: string | null | undefined, locale?: string | null): RegionGroup {
  if (timeZone && /^Asia\/(Kolkata|Calcutta)$/.test(timeZone)) return "IN";
  if (locale && /-IN$/i.test(locale)) return "IN";
  return "INTL";
}

/** Currency for the region picked in step 1. India is always INR; International uses the chosen country (default USD). */
export function currencyFor(group: RegionGroup, country?: string): string {
  if (group === "IN") return "INR";
  const c = REGIONS.find((r) => r.code === country && r.code !== "IN");
  return c?.currency ?? "USD";
}

export function clampStep(n: unknown): number {
  const v = Math.trunc(Number(n));
  return Number.isFinite(v) ? Math.min(LAST_STEP, Math.max(1, v)) : 1;
}

/** Where the wizard opens: the saved step, never past the last one. */
export function resumeStep(saved: number | null | undefined): number {
  return clampStep(saved ?? 1);
}

export const DAY_KEYS = ["0", "1", "2", "3", "4", "5", "6"] as const; // 0 = Sunday
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM");
const day = z.object({ enabled: z.boolean(), start: hhmm, end: hhmm }).refine((d) => !d.enabled || d.end > d.start, "Closing time must be after opening time.");
export const hoursSchema = z
  .object(Object.fromEntries(DAY_KEYS.map((k) => [k, day])) as Record<(typeof DAY_KEYS)[number], typeof day>)
  .refine((h) => Object.values(h).some((d) => d.enabled), "Open on at least one day.");
export type Hours = z.infer<typeof hoursSchema>;

function week(days: number[], start: string, end: string, extra?: Record<number, { start: string; end: string }>): Hours {
  const out: Record<string, { enabled: boolean; start: string; end: string }> = {};
  for (let d = 0; d < 7; d++) {
    const e = extra?.[d];
    out[String(d)] = e ? { enabled: true, ...e } : { enabled: days.includes(d), start, end };
  }
  return out as Hours;
}

export const HOURS_PRESETS: { id: string; label: string; hours: Hours }[] = [
  { id: "weekdays", label: "Mon–Fri, 9–6", hours: week([1, 2, 3, 4, 5], "09:00", "18:00") },
  { id: "sixdays", label: "Mon–Sat, 10–7", hours: week([1, 2, 3, 4, 5, 6], "10:00", "19:00") },
  { id: "clinic", label: "Mon–Sat, 9–1 & Sun off", hours: week([1, 2, 3, 4, 5, 6], "09:00", "13:00") },
  { id: "everyday", label: "Every day, 9–6", hours: week([0, 1, 2, 3, 4, 5, 6], "09:00", "18:00") },
];

export function hoursToJson(h: Hours): string {
  return JSON.stringify(h);
}

export const serviceInput = z.object({
  id: z.string().max(64).optional(),
  name: text(80).min(1, "Give each service a name."),
  duration: z.coerce.number().int().min(5, "Duration is at least 5 minutes.").max(480),
  price: z.coerce.number().min(0, "Price cannot be negative.").max(1_000_000),
});
export type ServiceInput = z.infer<typeof serviceInput>;

const timezone = z.string().max(64).refine(isValidTimeZone, "Invalid timezone.");

/** One schema per step; the API validates exactly the step it is saving. */
export const stepSchemas = {
  region: z.object({ region: z.enum(["IN", "INTL"]), country: z.string().max(4).optional() }),
  type: z.object({ packId: z.enum(PACK_IDS) }),
  basics: z.object({
    name: text(120).min(1, "Business name is required."),
    slug: z.string().max(60).transform((s, ctx) => {
      const r = validateSlug(s);
      if (!r.ok) { ctx.addIssue({ code: "custom", message: r.error }); return z.NEVER; }
      return r.slug;
    }),
    timezone,
    phone: z.preprocess((v) => (v === "" || v == null ? undefined : v), phoneField.optional()),
    address: z.preprocess((v) => (v === "" || v == null ? undefined : v), text(300).optional()),
  }),
  mode: z.object({ bookingMode: z.enum(["SLOT", "TOKEN"]) }),
  services: z.object({ services: z.array(serviceInput).max(20) }),
  hours: z.object({ hours: hoursSchema }),
  plan: z.object({ plan: z.enum(["free", "professional", "business"]) }),
} as const;

export type SavableStep = keyof typeof stepSchemas;
export function isSavableStep(s: string): s is SavableStep {
  return s in stepSchemas;
}
