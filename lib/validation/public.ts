import { z } from "zod";
import { text, emailField, blankToUndef } from "./common";
import { CURRENCIES } from "@/lib/currency";
import { isValidTimeZone } from "@/lib/time";

const currencyCodes = CURRENCIES.map((c) => c.code) as [string, ...string[]];
const timezone = z.string().max(64).refine(isValidTimeZone, "Invalid timezone.").optional().catch(undefined);
const currency = z.enum(currencyCodes, { error: "Please select your region." });

export const signupSchema = z.object({
  name: text(120).min(1, "All fields are required."),
  businessName: text(120).min(1, "All fields are required."),
  email: emailField,
  password: z.string().min(8, "Password must be at least 8 characters.").max(200),
  currency,
  timezone,
});

export const onboardingSchema = z.object({
  businessName: text(120).min(1, "Business name is required."),
  currency,
  timezone,
});

export const leadSchema = z.object({
  name: z.preprocess(blankToUndef, text(120).optional()),
  email: emailField,
  phone: z.preprocess(blankToUndef, text(40).optional()),
  businessType: z.preprocess(blankToUndef, text(80).optional()),
  demoRequested: z.coerce.boolean().optional(),
  message: z.preprocess(blankToUndef, text(2000).optional()),
  source: z.string().max(64).optional().catch(undefined),
});
