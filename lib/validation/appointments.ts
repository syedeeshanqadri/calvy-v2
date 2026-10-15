import { z } from "zod";
import { text, id, emailField, dateField, timeField, phoneField, blankToUndef } from "./common";

export const APPOINTMENT_STATUSES = ["confirmed", "pending", "completed", "cancelled", "no-show"] as const;
export const PAYMENT_STATUSES = ["unpaid", "paid", "refunded"] as const;
export const PAYMENT_MODES = ["prepaid", "postpaid"] as const;

export const appointmentListQuery = z.object({
  date: dateField.optional(),
  status: z.enum(APPOINTMENT_STATUSES).optional(),
  staffId: id.optional(),
});

export const appointmentCreateSchema = z
  .object({
    clientName: text(120).min(1),
    clientEmail: emailField,
    clientPhone: z.preprocess(blankToUndef, phoneField.optional()),
    serviceId: id.optional(),
    serviceIds: z.array(id).max(10).optional(),
    staffId: z.preprocess(blankToUndef, id.optional()),
    date: dateField,
    time: timeField,
    notes: z.preprocess(blankToUndef, text(1000).optional()),
    allowOverlap: z.boolean().optional(),
  })
  .refine((b) => (b.serviceIds?.length ?? 0) > 0 || !!b.serviceId, {
    message: "serviceId or serviceIds is required",
    path: ["serviceIds"],
  });

export const appointmentPatchSchema = z.object({
  status: z.enum(APPOINTMENT_STATUSES).optional(),
  paymentStatus: z.enum(PAYMENT_STATUSES).optional(),
  paymentMode: z.enum(PAYMENT_MODES).optional(),
  date: z
    .string()
    .max(40)
    .refine((d) => !Number.isNaN(new Date(d).getTime()), "Invalid date")
    .optional(),
});
