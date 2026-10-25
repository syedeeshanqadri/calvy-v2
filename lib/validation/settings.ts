import { normalizeHex } from "@/lib/theme";
import { z } from "zod";
import { parseHHMM } from "@/lib/booking";

const text = (max: number) => z.string().trim().max(max);
const optionalText = (max: number) => text(max).nullable();

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

const dayConfig = z
  .object({
    enabled: z.boolean(),
    start: z.string().regex(HHMM, "start must be HH:MM"),
    end: z.string().regex(HHMM, "end must be HH:MM"),
  })
  .refine(
    (d) => !d.enabled || (parseHHMM(d.end) ?? 0) > (parseHHMM(d.start) ?? 0),
    { message: "end must be after start" },
  );

export const availabilitySchema = z.record(
  z.string().regex(/^[0-6]$/, "day keys must be 0-6"),
  dayConfig,
);

/** availabilityJson arrives as a JSON string; parse and validate it. */
const availabilityJsonField = z
  .string()
  .max(5000)
  .superRefine((val, ctx) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(val);
    } catch {
      ctx.addIssue({ code: "custom", message: "availabilityJson must be valid JSON" });
      return;
    }
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      ctx.addIssue({ code: "custom", message: "availabilityJson must be a JSON object" });
      return;
    }
    const r = availabilitySchema.safeParse(parsed);
    if (!r.success) {
      ctx.addIssue({
        code: "custom",
        message: `availabilityJson invalid: ${r.error.issues[0]?.message ?? "bad shape"}`,
      });
    }
  });

/** Unknown keys are stripped, which preserves the previous allow-list behaviour. */
export const settingsPatchSchema = z.object({
  name: text(120).min(1, "name cannot be empty").optional(),
  businessType: text(80).optional(),
  phone: optionalText(40).optional(),
  email: optionalText(254).optional(),
  address: optionalText(300).optional(),
  website: optionalText(300).optional(),
  description: optionalText(2000).optional(),
  primaryColor: z
    .string()
    .trim()
    .regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "primaryColor must be a hex colour like #0284c7")
    .transform((v) => normalizeHex(v) as string) // stored as lowercase #rrggbb
    .optional(),
  availabilityJson: availabilityJsonField.optional(),
  currency: z
    .string()
    .trim()
    .regex(/^[A-Z]{3}$/, "currency must be 3 uppercase letters")
    .optional(),
  minNoticeMinutes: z.coerce
    .number({ error: "minNoticeMinutes must be a number" })
    .int()
    .min(0, "minNoticeMinutes must be between 0 and 43200")
    .max(43200, "minNoticeMinutes must be between 0 and 43200")
    .optional(),
  maxAdvanceDays: z.coerce
    .number({ error: "maxAdvanceDays must be a number" })
    .int()
    .min(1, "maxAdvanceDays must be between 1 and 730")
    .max(730, "maxAdvanceDays must be between 1 and 730")
    .optional(),
  maxPeoplePerBooker: z.coerce
    .number({ error: "maxPeoplePerBooker must be a number" })
    .int()
    .min(1, "maxPeoplePerBooker must be between 1 and 20")
    .max(20, "maxPeoplePerBooker must be between 1 and 20")
    .optional(),
  cancellationCutoffHours: z.coerce
    .number({ error: "cancellationCutoffHours must be a number" })
    .int()
    .min(0, "cancellationCutoffHours must be between 0 and 720")
    .max(720, "cancellationCutoffHours must be between 0 and 720")
    .optional(),
  slotInterval: z.coerce
    .number({ error: "slotInterval must be a number" })
    .int("slotInterval must be an integer")
    .min(5, "slotInterval must be between 5 and 240")
    .max(240, "slotInterval must be between 5 and 240")
    .optional(),
});

export type SettingsPatch = z.infer<typeof settingsPatchSchema>;
