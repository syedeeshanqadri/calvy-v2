import { z } from "zod";
import { text, emailField, blankToUndef } from "./common";
import { CURRENCIES } from "@/lib/currency";
import { isValidTimeZone } from "@/lib/time";
import { PACK_IDS } from "@/lib/packs/types";
import { REGION_CODES, currencyForRegion } from "@/lib/regions";

const currencyCodes = CURRENCIES.map((c) => c.code) as [string, ...string[]];
const timezone = z.string().max(64).refine(isValidTimeZone, "Invalid timezone.").optional().catch(undefined);
/** Business pack picked at signup/onboarding; anything missing or unknown becomes OTHER. */
const packId = z.enum(PACK_IDS).optional().catch(undefined);
const REGION_REQUIRED = "Please select your country or region.";
/** The form sends `region`; the currency is derived from it. `currency` is still accepted from older clients. */
const regionFields = {
  region: z.enum(REGION_CODES, { error: REGION_REQUIRED }).optional(),
  currency: z.enum(currencyCodes, { error: REGION_REQUIRED }).optional(),
};
function withCurrency<T extends { region?: string; currency?: string }>(v: T, ctx: z.RefinementCtx): T & { currency: string } {
  const currency = currencyForRegion(v.region) ?? v.currency;
  if (!currency) {
    ctx.addIssue({ code: "custom", message: REGION_REQUIRED, path: ["region"] });
    return z.NEVER;
  }
  return { ...v, currency };
}

export const signupSchema = z.object({
  name: text(120).min(1, "All fields are required."),
  businessName: text(120).min(1, "All fields are required."),
  email: emailField,
  password: z.string().min(8, "Password must be at least 8 characters.").max(200),
  ...regionFields,
  timezone,
  packId,
  /** The plan the visitor chose on the signup page. Reported to the owner only; accounts always start on Free. */
  plan: z.enum(["free", "professional", "business"]).optional().catch(undefined),
}).transform(withCurrency);

export const onboardingSchema = z.object({
  businessName: text(120).min(1, "Business name is required."),
  ...regionFields,
  timezone,
  packId,
}).transform(withCurrency);

export const leadSchema = z.object({
  name: z.preprocess(blankToUndef, text(120).optional()),
  email: emailField,
  phone: z.preprocess(blankToUndef, text(40).optional()),
  businessType: z.preprocess(blankToUndef, text(80).optional()),
  demoRequested: z.coerce.boolean().optional(),
  message: z.preprocess(blankToUndef, text(2000).optional()),
  source: z.string().max(64).optional().catch(undefined),
});
