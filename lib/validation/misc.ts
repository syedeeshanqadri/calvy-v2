import { z } from "zod";
import { text } from "./common";
import { SITE_CAPS, isSafeImageUrl } from "@/lib/siteSections";

const section = (extra: z.ZodRawShape = {}) =>
  z.looseObject({ enabled: z.boolean().optional(), badge: text(120).optional(), ...extra }).optional();
const imageFocus = z.enum(["top", "center", "bottom"]);
const httpUrlOrEmpty = z
  .string()
  .max(1000)
  .refine((v) => v === "" || /^(https?:\/\/|\/)/i.test(v), "image must be an http(s) URL");

const safeImage = z.string().max(SITE_CAPS.url).refine(isSafeImageUrl, "image must be an https URL or an uploaded file");

const gallerySchema = z.looseObject({
  enabled: z.boolean().optional(),
  title: text(SITE_CAPS.title).optional(),
  images: z.array(z.object({ url: safeImage, alt: text(SITE_CAPS.altText) })).max(SITE_CAPS.galleryImages).optional(),
});
const offerSchema = z.looseObject({
  enabled: z.boolean().optional(),
  text: text(SITE_CAPS.offerText).optional(),
  endsOn: z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/, "invalid date").optional(),
});
const faqSchema = z.looseObject({
  enabled: z.boolean().optional(),
  title: text(SITE_CAPS.title).optional(),
  items: z.array(z.object({ q: text(SITE_CAPS.faqQuestion).min(1), a: text(SITE_CAPS.faqAnswer).min(1) })).max(SITE_CAPS.faqItems).optional(),
});

/** Known fields are type-checked and capped; unknown keys pass through (the editor owns the shape). */
export const websiteConfigSchema = z.looseObject({
  metaTitle: text(200).optional(),
  metaDescription: text(500).optional(),
  hero: section({ image: httpUrlOrEmpty.optional(), imageFocus: imageFocus.optional(), headline: text(300).optional(), subheadline: text(1000).optional() }),
  about: section({ image: httpUrlOrEmpty.optional(), imageFocus: imageFocus.optional(), title: text(300).optional(), body: text(5000).optional() }),
  services: section({ title: text(300).optional() }),
  team: section({ title: text(300).optional() }),
  contact: section({ title: text(300).optional() }),
  heroLook: z.enum(["split", "arch", "dark"]).optional(),
  serviceLayout: z.enum(["list", "cards"]).optional(),
  gallery: gallerySchema.optional(),
  offer: offerSchema.optional(),
  faq: faqSchema.optional(),
  reviews: z.looseObject({ enabled: z.boolean().optional() }).optional(),
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

/** Email only. WhatsApp broadcasts are parked until approved MARKETING templates and marketing consent exist (ROADMAP). */
export const broadcastSchema = z.object({
  subject: text(200).min(1, "Subject is required"),
  message: text(5000).min(1, "Message is required"),
});
