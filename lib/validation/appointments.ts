import { z } from "zod";
import { meetingUrlOrEmpty } from "@/lib/online";
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
    clientEmail: z.preprocess(blankToUndef, emailField.optional()),
    clientPhone: z.preprocess(blankToUndef, phoneField.optional()),
    serviceId: id.optional(),
    serviceIds: z.array(id).max(10).optional(),
    staffId: z.preprocess(blankToUndef, id.optional()),
    date: dateField,
    time: timeField,
    notes: z.preprocess(blankToUndef, text(1000).optional()),
    allowOverlap: z.boolean().optional(),
    mode: z.preprocess(blankToUndef, z.enum(["in_person", "online"]).optional()),
  })
  .refine((b) => (b.serviceIds?.length ?? 0) > 0 || !!b.serviceId, {
    message: "serviceId or serviceIds is required",
    path: ["serviceIds"],
  })
  .refine((b) => !!b.clientEmail || !!b.clientPhone, {
    message: "Enter a phone number or an email address for the client.",
    path: ["clientPhone"],
  });

/** Status and payment changes, and/or a reschedule (date + time, optionally another staff member). */
export const appointmentPatchSchema = z
  .object({
    status: z.enum(APPOINTMENT_STATUSES).optional(),
    paymentStatus: z.enum(PAYMENT_STATUSES).optional(),
    paymentMode: z.enum(PAYMENT_MODES).optional(),
    date: dateField.optional(),
    time: timeField.optional(),
    staffId: z.preprocess(blankToUndef, id.optional()),
    /** Online appointments: the link for this booking. Empty clears it (the service / staff link applies again). */
    meetingUrl: meetingUrlOrEmpty.optional(),
  })
  .refine((b) => (b.date === undefined) === (b.time === undefined), {
    message: "date and time must be sent together",
    path: ["time"],
  });

/** Owner-side slot lookup used by the new-booking and reschedule pickers. */
export const ownerSlotsQuery = z.object({
  date: dateField,
  serviceIds: z
    .string()
    .max(1000)
    .optional()
    .transform((v) => (v ? v.split(",").map((x) => x.trim()).filter(Boolean).slice(0, 10) : [])),
  staffId: z.preprocess(blankToUndef, id.optional()),
  /** Appointment being rescheduled: its own slot counts as free. */
  excludeId: z.preprocess(blankToUndef, id.optional()),
});

export const appointmentExportQuery = z.object({
  status: z.preprocess(blankToUndef, z.enum(APPOINTMENT_STATUSES).optional()),
  staffId: z.preprocess(blankToUndef, id.optional()),
  from: z.preprocess(blankToUndef, dateField.optional()),
  to: z.preprocess(blankToUndef, dateField.optional()),
  q: z.preprocess(blankToUndef, text(100).optional()),
});
