import { z } from "zod";
import { text } from "./common";

const section = (extra: z.ZodRawShape = {}) =>
  z.looseObject({ enabled: z.boolean().optional(), badge: text(120).optional(), ...extra }).optional();
const httpUrlOrEmpty = z
  .string()
  .max(1000)
  .refine((v) => v === "" || /^(https?:\/\/|\/)/i.test(v), "image must be an http(s) URL");

/** Known fields are type-checked and capped; unknown keys pass through (the editor owns the shape). */
export const websiteConfigSchema = z.looseObject({
  metaTitle: text(200).optional(),
  metaDescription: text(500).optional(),
  hero: section({ image: httpUrlOrEmpty.optional(), headline: text(300).optional(), subheadline: text(1000).optional() }),
  about: section({ image: httpUrlOrEmpty.optional(), title: text(300).optional(), body: text(5000).optional() }),
  services: section({ title: text(300).optional() }),
  team: section({ title: text(300).optional() }),
  contact: section({ title: text(300).optional() }),
});

export const websitePatchSchema = z.object({
  websiteJson: z
    .string()
    .max(100_000)
    .transform((v, ctx) => {
      try {
        return JSON.parse(v) as unknown;
      } catch {
        ctx.addIssue({ code: "custom", message: "Invalid JSON" });
        return z.NEVER;
      }
    })
    .pipe(websiteConfigSchema)
    .transform((cfg) => JSON.stringify(cfg)),
});

export const pushSubscribeSchema = z.object({
  endpoint: z.string().trim().max(1000).url().refine((u) => u.startsWith("https://"), "endpoint must be https"),
  keys: z.object({ p256dh: z.string().min(1).max(300), auth: z.string().min(1).max(300) }),
});
export const pushUnsubscribeSchema = z.object({ endpoint: z.string().trim().max(1000).optional() });

export const ticketCreateSchema = z.object({
  subject: text(200).min(1, "Subject and message are required"),
  body: text(5000).min(1, "Subject and message are required"),
  priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"),
});
export const ticketMessageSchema = z.object({ body: text(5000).min(1, "Message body is required") });
