import { z } from "zod";

export const PACK_IDS = ["CLINIC", "SALON_SPA", "LAWYER", "FITNESS", "CONSULTANT", "OTHER"] as const;
export type PackId = (typeof PACK_IDS)[number];

export const TERM_KEYS = ["client", "staff", "service", "appointment", "business"] as const;
export type TermKey = (typeof TERM_KEYS)[number];

export const termSchema = z.object({
  singular: z.string().trim().min(1).max(40),
  plural: z.string().trim().min(1).max(40),
});
export type Term = z.infer<typeof termSchema>;

export const defaultServiceSchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().max(300),
  duration: z.number().int().min(5).max(480),
  price: z.number().min(0).max(1_000_000),
  category: z.string().min(1).max(40),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
});
export type DefaultService = z.infer<typeof defaultServiceSchema>;

export const packSchema = z.object({
  id: z.enum(PACK_IDS),
  label: z.string().min(1).max(60),
  /** One-line description shown in the pack picker. */
  blurb: z.string().min(1).max(120),
  /** Canonical legacy Business.businessType for this pack; packForBusinessType() maps it back. */
  businessType: z.string().min(1).max(40),
  /** Service form placeholders. */
  placeholders: z.object({ serviceName: z.string().min(1).max(80), serviceDescription: z.string().min(1).max(160) }),
  /** Staff role dropdown options (the form also offers "Other" with free text). */
  staffRoles: z.array(z.string().trim().min(1).max(40)).min(2).max(10),
  /** At most 3 so a new Free workspace (3 services) can take all of them. Prices are in the business currency, owners edit them. */
  defaultServices: z.array(defaultServiceSchema).min(1).max(3),
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
