import { z } from "zod";
import { PATIENT_GENDERS, PATIENT_RELATIONS } from "@/lib/patients";
import { text, id, emailField, dateField, timeField, phoneField, blankToUndef } from "./common";

export const bookingSchema = z
  .object({
    businessSlug: text(80).min(1),
    serviceId: id.optional(),
    serviceIds: z.array(id).max(10).optional(),
    staffId: z.preprocess(blankToUndef, id.optional()),
    date: dateField,
    time: timeField.optional(),
    /** Token businesses: the session to take a token in (no time). */
    tokenSessionId: z.preprocess(blankToUndef, id.optional()),
    clientName: text(120).min(1),
    /** Who the appointment is for when booking for someone else (defaults to the booker). */
    patientName: z.preprocess(blankToUndef, text(120).min(1).optional()),
    /** Only with patientName: how they relate to the booker, and (clinic pack) their age and gender. */
    patientRelation: z.preprocess(blankToUndef, z.enum(PATIENT_RELATIONS).optional()),
    patientAge: z.preprocess(blankToUndef, z.coerce.number().int().min(0).max(120).optional()),
    patientGender: z.preprocess(blankToUndef, z.enum(PATIENT_GENDERS).optional()),
    clientEmail: emailField,
    clientPhone: z.preprocess(blankToUndef, phoneField.optional()),
    notes: z.preprocess(blankToUndef, text(1000).optional()),
    /** For services offered both in person and online: the customer's choice. */
    mode: z.preprocess(blankToUndef, z.enum(["in_person", "online"]).optional()),
    /** Signed ticket from the customer's "My bookings" follow-up link. Whether it makes the booking free is decided on the server. */
    followUpTicket: z.preprocess(blankToUndef, z.string().max(800).optional()),
  })
  .refine((b) => (b.serviceIds?.length ?? 0) > 0 || !!b.serviceId, {
    message: "serviceId or serviceIds is required",
    path: ["serviceIds"],
  })
  .refine((b) => !!b.time || !!b.tokenSessionId, { message: "time or tokenSessionId is required", path: ["time"] });
export type BookingInput = z.infer<typeof bookingSchema>;

export const availabilityQuery = z.object({
  slug: text(100).min(1),
  date: dateField.refine((d) => !Number.isNaN(new Date(d + "T00:00:00Z").getTime()), "date must be a real date"),
  duration: z.coerce.number().int().min(1).max(1440).catch(30).default(30),
  serviceId: id.optional().catch(undefined),
  // comma-separated ids for multi-service bookings; staffId limits the answer to one staff member
  serviceIds: z.string().max(1000).optional().transform((v) => (v ? v.split(",").map((x) => x.trim()).filter(Boolean).slice(0, 10) : undefined)),
  staffId: id.optional().catch(undefined),
});

export const tokenAvailabilityQuery = z.object({
  slug: text(100).min(1),
  date: dateField.refine((d) => !Number.isNaN(new Date(d + "T00:00:00Z").getTime()), "date must be a real date"),
  serviceIds: z.string().max(1000).optional().transform((v) => (v ? v.split(",").map((x) => x.trim()).filter(Boolean).slice(0, 10) : [])),
});

export const monthAvailabilityQuery = z.object({
  slug: text(100).min(1),
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "month must be YYYY-MM"),
  duration: z.coerce.number().int().min(1).max(1440).catch(30).default(30),
  serviceIds: z.string().max(1000).optional().transform((v) => (v ? v.split(",").map((x) => x.trim()).filter(Boolean).slice(0, 10) : undefined)),
  staffId: id.optional().catch(undefined),
});
