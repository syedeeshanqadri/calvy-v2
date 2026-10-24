import { z } from "zod";

export const PACK_IDS = ["CLINIC", "SALON_SPA", "LAWYER", "FITNESS", "OTHER"] as const;
export type PackId = (typeof PACK_IDS)[number];

export const TERM_KEYS = ["client", "staff", "service", "appointment", "business"] as const;
export type TermKey = (typeof TERM_KEYS)[number];

export const termSchema = z.object({
  singular: z.string().trim().min(1).max(40),
  plural: z.string().trim().min(1).max(40),
});
export type Term = z.infer<typeof termSchema>;

export const packSchema = z.object({
  id: z.enum(PACK_IDS),
  label: z.string().min(1).max(60),
  terms: z.object({
    client: termSchema,
    staff: termSchema,
    service: termSchema,
    appointment: termSchema,
    business: termSchema,
  }),
  /** lucide-react icon names, keyed by role. */
  icons: z.object({
    pack: z.string().min(1),
    client: z.string().min(1),
    staff: z.string().min(1),
    service: z.string().min(1),
    appointment: z.string().min(1),
  }),
  defaultBookingMode: z.enum(["SLOT", "TOKEN"]),
});
export type Pack = z.infer<typeof packSchema>;

/** Business.termsOverride: any subset of terms; a missing plural falls back to singular + "s". */
export const termsOverrideSchema = z
  .object({
    client: termSchema.partial(),
    staff: termSchema.partial(),
    service: termSchema.partial(),
    appointment: termSchema.partial(),
    business: termSchema.partial(),
  })
  .partial()
  .strict();
export type TermsOverride = z.infer<typeof termsOverrideSchema>;
