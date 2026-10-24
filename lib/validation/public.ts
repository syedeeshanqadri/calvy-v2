import { z } from "zod";
import { text, emailField, blankToUndef } from "./common";
import { CURRENCIES } from "@/lib/currency";
import { isValidTimeZone } from "@/lib/time";
import { PACK_IDS } from "@/lib/packs/types";

const currencyCodes = CURRENCIES.map((c) => c.code) as [string, ...string[]];
const timezone = z.string().max(64).refine(isValidTimeZone, "Invalid timezone.").optional().catch(undefined);
/** Business pack picked at signup/onboarding; anything missing or unknown becomes OTHER. */
const packId = z.enum(PACK_IDS).optional().catch(undefined);
const currency = z.enum(currencyCodes, { error: "Please select your region." });

export const signupSchema = z.object({
  name: text(120).min(1, "All fields are required."),
  businessName: text(120).min(1, "All fields are required."),
  email: emailField,
  password: z.string().min(8, "Password must be at least 8 characters.").max(200),
  currency,
  timezone,
  packId,
  /** The plan the visitor chose on the signup page. Reported to the owner only; accounts always start on Free. */
  plan: z.enum(["free", "professional", "business"]).optional().catch(undefined),
});

export const onboardingSchema = z.object({
  businessName: text(120).min(1, "Business name is required."),
  currency,
  timezone,
  packId,
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
