import { z } from "zod";
import { text, emailField, blankToUndef, money } from "./common";

const hexColor = z.string().trim().regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "color must be a hex colour like #0284c7");
const looseEmail = z.string().trim().toLowerCase().max(254).regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "Please enter a valid email address");
const clientPhone = z
  .string()
  .trim()
  .regex(/^\+?[0-9\s\-.()]{10,20}$/, "Please enter a valid phone number");

export const clientCreateSchema = z.object({
  name: text(120).min(1, "Name is required"),
  email: emailField,
  phone: z.preprocess(blankToUndef, clientPhone.optional()),
  notes: z.preprocess(blankToUndef, text(2000).optional()),
});

export const staffCreateSchema = z.object({
  name: text(120).min(1),
  role: text(80).min(1),
  email: looseEmail,
  phone: z.preprocess(blankToUndef, text(40).optional()),
  color: z.preprocess(blankToUndef, hexColor.optional()),
});

export const staffPatchSchema = z.object({
  name: text(120).min(1).optional(),
  role: text(80).min(1).optional(),
  email: looseEmail.optional(),
  phone: text(40).optional(),
  color: hexColor.optional(),
  isActive: z.boolean().optional(),
});

const serviceCore = {
  name: text(120).min(1, "Name is required"),
  description: text(2000),
  duration: z.coerce.number().int("Duration must be a whole number of minutes").min(1, "Duration must be at least 1 minute").max(1440),
  price: money,
  color: hexColor,
  category: text(80).min(1),
  capacity: z.coerce.number().int().min(1).max(500),
};

export const serviceCreateSchema = z.object({
  name: serviceCore.name,
  description: z.preprocess(blankToUndef, serviceCore.description.optional()),
  duration: serviceCore.duration,
  price: serviceCore.price,
  color: z.preprocess(blankToUndef, serviceCore.color.optional()),
  category: z.preprocess(blankToUndef, serviceCore.category.optional()),
  capacity: z.preprocess(blankToUndef, serviceCore.capacity.optional()),
});

/** Allow-list only: businessId, isActive and any other column cannot be mass-assigned. */
export const servicePatchSchema = z.object({
  name: serviceCore.name.optional(),
  description: serviceCore.description.optional(),
  duration: serviceCore.duration.optional(),
  price: serviceCore.price.optional(),
  color: serviceCore.color.optional(),
  category: serviceCore.category.optional(),
  capacity: serviceCore.capacity.optional(),
  isActive: z.boolean().optional(),
});

const expenseDate = z
  .string()
  .max(40)
  .refine((d) => !Number.isNaN(new Date(d).getTime()), "Invalid date");

export const expenseCreateSchema = z.object({
  amount: z.coerce.number({ error: "Valid amount required" }).finite().gt(0, "Valid amount required").max(100_000_000),
  category: text(80).min(1, "Category required"),
  description: z.preprocess(blankToUndef, text(500).optional()),
  date: z.preprocess(blankToUndef, expenseDate.optional()),
});

export const expensePatchSchema = z.object({
  amount: z.coerce.number().finite().gt(0).max(100_000_000).optional(),
  category: text(80).min(1).optional(),
  description: text(500).nullable().optional(),
  date: expenseDate.optional(),
});

export const expenseListQuery = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "month must be YYYY-MM").optional(),
});
