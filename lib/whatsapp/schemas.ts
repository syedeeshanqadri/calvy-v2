import { z } from "zod";

const id = z.string().trim().regex(/^\d{5,25}$/, "Digits only (copy it from Meta)");

export const whatsappSaveSchema = z.object({
  phoneNumberId: id,
  wabaId: id,
  /** Blank keeps the stored value (the form shows only a masked copy). */
  accessToken: z.string().trim().max(1000).optional(),
  appSecret: z.string().trim().max(200).optional(),
});

export const whatsappTemplateActionSchema = z.object({ action: z.enum(["install", "refresh"]) });
export const whatsappTestSchema = z.object({ to: z.string().trim().min(5).max(30) });
