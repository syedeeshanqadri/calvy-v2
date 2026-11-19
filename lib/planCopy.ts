// ONE source of truth for plan wording. Everything a customer reads about a plan (onboarding, the pricing page, Billing, upgrade prompts, admin labels)
// is derived here from the limits matrix in lib/planData.ts and the names in lib/planMeta.ts, so a limit changed in one place changes everywhere.
// Client-safe: no server imports.
import { PLAN_LIMITS, limitsForRegion, type PlanId, type PlanLimits } from "@/lib/planData";
import { PLAN_META } from "@/lib/planMeta";

/** The three plans a customer can see. "starter" is legacy and never shown. */
export type ShownPlanId = "free" | "professional" | "business";
export const SHOWN_PLANS: readonly ShownPlanId[] = ["free", "professional", "business"];
export type CopyRegion = "IN" | "INTL";

export const planName = (id: PlanId | string): string => PLAN_META[id as PlanId]?.name ?? "Free";

/** "Pro", "Business" -> the plan an `?plan=` query or stored value means, or null. */
export function parsePlanParam(v: string | null | undefined): "professional" | "business" | null {
  const s = (v ?? "").toLowerCase();
  if (s === "pro" || s === "professional") return "professional";
  if (s === "business") return "business";
  return null;
}
/** The short query value for a plan (the Billing link uses ?plan=pro). */
export const planQuery = (id: "professional" | "business"): "pro" | "business" => (id === "professional" ? "pro" : "business");

const join = (names: string[]) => (names.length <= 1 ? names[0] ?? "" : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`);

type BoolFlag = { [K in keyof PlanLimits]: PlanLimits[K] extends boolean ? K : never }[keyof PlanLimits];

/** The plans that include a feature, as words: "Pro and Business". Used in upgrade prompts and admin labels. */
export function plansWith(flag: BoolFlag): string {
  return join(SHOWN_PLANS.filter((p) => PLAN_LIMITS[p][flag]).map(planName));
}
/** The cheapest plan that includes a feature, by name. */
export function cheapestPlanWith(flag: BoolFlag): string {
  return planName(SHOWN_PLANS.find((p) => PLAN_LIMITS[p][flag]) ?? "business");
}

const limit = (n: number, one: string, many: string, unlimited: string) =>
  n < 0 ? unlimited : n === 1 ? `1 ${one}` : `Up to ${n.toLocaleString("en-US")} ${many}`;
export const staffLine = (n: number) => limit(n, "staff member", "staff", "Unlimited staff");
export const appointmentsLine = (n: number) => limit(n, "appointment/month", "appointments/month", "Unlimited appointments");

interface Item { label: string; on: (l: PlanLimits, region: CopyRegion) => boolean }

// Features that appear in the list the FIRST time a plan has them. Later plans inherit them through "Everything in <plan>, plus:", so nothing is listed twice.
const FEATURES: Item[] = [
  { label: "Booking page + business website", on: () => true },
  { label: "Email confirmations & reminders", on: (l) => l.emailReminders },
  { label: "Calendar invites", on: () => true },
  { label: "Mobile app: notifications, check, cancel & reschedule bookings", on: () => true },
  { label: "Expense tracking", on: (l) => l.expenseTracking },
  { label: "No platform fee", on: (l, r) => r === "IN" && l.platformFeeMinorIN === 0 },
  { label: "WhatsApp confirmations & reminders", on: (l) => l.whatsappReminders },
  { label: "Unlimited services", on: (l) => l.maxServices < 0 },
  { label: "Custom branding & colours", on: (l) => l.customBranding },
  { label: "Analytics dashboard", on: (l) => l.analytics },
  { label: "Image uploads & SEO controls", on: (l) => l.imageUpload && l.seoControls },
  { label: "CSV export", on: (l) => l.csvExport },
  { label: "Offers & discounts for your customers", on: (l) => l.offers },
  { label: "Take payments through your own gateway", on: (l) => l.stripePayments },
  { label: "Group bookings", on: (l) => l.groupBooking },
  { label: "Client broadcasts", on: (l) => l.broadcasts },
  { label: "Custom slot lengths", on: (l) => l.customSlotInterval },
  { label: "Premium mobile app: 40+ features", on: (l) => l.prioritySupport },
  { label: "Remove \"Powered by Calvy\"", on: (l) => l.removeBranding },
  { label: "Priority support", on: (l) => l.prioritySupport },
];
const IN_FREE_FEE = "A nominal platform fee per confirmed online booking, paid by customers";

/** The feature list shown for a plan. Limits lead, then (for Pro and Business) an "Everything in X, plus:" heading, then only what is NEW at this tier. */
export function planFeatures(id: ShownPlanId, region: CopyRegion): string[] {
  const i = SHOWN_PLANS.indexOf(id);
  const l = limitsForRegion(PLAN_LIMITS[id], id, region);
  const prev = i > 0 ? limitsForRegion(PLAN_LIMITS[SHOWN_PLANS[i - 1]], SHOWN_PLANS[i - 1], region) : null;
  const out: string[] = [staffLine(l.maxStaff), appointmentsLine(l.maxMonthlyAppointments)];
  if (!prev) out.push(`Up to ${l.maxServices} services`);
  if (l.maxTeamMembers > 0 && l.maxTeamMembers !== prev?.maxTeamMembers) out.push(`Up to ${l.maxTeamMembers} team logins`);
  if (prev) out.push(`Everything in ${planName(SHOWN_PLANS[i - 1])}, plus:`);
  if (!prev && region === "IN") out.push(IN_FREE_FEE);
  for (const f of FEATURES) {
    if (!f.on(l, region)) continue;
    if (prev && f.on(prev, region)) continue;
    out.push(f.label);
  }
  return out;
}
