import { z } from "zod";
import { text, id, emailField, dateField, timeField, phoneField, blankToUndef } from "./common";

export const bookingSchema = z
  .object({
    businessSlug: text(80).min(1),
    serviceId: id.optional(),
    serviceIds: z.array(id).max(10).optional(),
    staffId: z.preprocess(blankToUndef, id.optional()),
    date: dateField,
    time: timeField,
    clientName: text(120).min(1),
    clientEmail: emailField,
    clientPhone: z.preprocess(blankToUndef, phoneField.optional()),
    notes: z.preprocess(blankToUndef, text(1000).optional()),
  })
  .refine((b) => (b.serviceIds?.length ?? 0) > 0 || !!b.serviceId, {
    message: "serviceId or serviceIds is required",
    path: ["serviceIds"],
  });
export type BookingInput = z.infer<typeof bookingSchema>;

export const availabilityQuery = z.object({
  slug: text(100).min(1),
  date: dateField.refine((d) => !Number.isNaN(new Date(d + "T00:00:00Z").getTime()), "date must be a real date"),
  duration: z.coerce.number().int().min(1).max(1440).catch(30).default(30),
  serviceId: id.optional().catch(undefined),
});
