import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { normalizePlanId } from "@/lib/plans";
import { isFeatureEnabled } from "@/lib/flags";
import { REGION_PRICING, isFeatureHeading } from "@/lib/pricing";
import { INTERVALS, PAID_PLANS, overrideActive, plansAboveNoAfaLimit, planName, planPriceFor } from "@/lib/subscriptions/rules";
import { billingGateway, intlBillingEnabled } from "@/lib/subscriptions/razorpayService";
import { currentSubscription, reconcileSubscription } from "@/lib/subscriptions/service";
import BillingClient, { type BillingData } from "./BillingClient";
import { parsePlanParam } from "@/lib/planCopy";

export const dynamic = "force-dynamic";

/** The owner's plan page: current plan, next bill, payment method, invoices, upgrade / downgrade / cancel. India: rupees via Cashfree. International: dollars via Razorpay (when switched on). */
export default async function BillingPage({ searchParams }: { searchParams: Promise<{ subscription_id?: string; plan?: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.businessId) redirect("/login");
  const businessId = session.user.businessId;

  // Back from Cashfree's authorisation page: ask Cashfree where it stands, so the plan activates even before the webhook arrives.
  const { subscription_id: returned, plan: planParam } = await searchParams;
  let returnState: string | null = null;
  if (returned && /^calvy_sub_/.test(returned)) {
    const owned = await prisma.subscription.findFirst({ where: { cashfreeSubscriptionId: returned, businessId }, select: { id: true } });
    if (owned) returnState = await reconcileSubscription(returned).catch(() => "pending");
  }

  const business = await prisma.business.findUnique({ where: { id: businessId }, select: { plan: true, planStatus: true, currency: true, planOverridePlan: true, planOverrideUntil: true } });
  if (!business) redirect("/login");
  const sub = await currentSubscription(prisma, businessId);
  const invoices = await prisma.subscriptionInvoice.findMany({ where: { businessId }, orderBy: { issuedAt: "desc" }, take: 36 });
  const now = new Date();
  const above = plansAboveNoAfaLimit();
  const gateway = billingGateway(business);
  const priceList = REGION_PRICING[gateway === "RAZORPAY" ? "INTL" : "IN"];

  const data: BillingData = {
    isIndia: gateway === "CASHFREE",
    gateway,
    currency: gateway === "RAZORPAY" ? "USD" : "INR",
    intlOn: intlBillingEnabled(),
    billingMode: sub && sub.gateway === "RAZORPAY" ? (sub.billingMode === "LINKS" ? "LINKS" : "RECURRING") : null,
    renewalLinkUrl: sub && sub.gateway === "RAZORPAY" ? sub.renewalLinkUrl : null,
    paymentsOn: isFeatureEnabled("onlinePayments"),
    planId: normalizePlanId(business.plan),
    planLabel: planName(normalizePlanId(business.plan)),
    override: overrideActive(business, now) ? { planLabel: planName(business.planOverridePlan ?? ""), until: business.planOverrideUntil?.toISOString() ?? null } : null,
    returnState,
    preselectPlan: parsePlanParam(planParam),
    subscription: sub && sub.state !== "PENDING" ? {
      state: sub.state, planId: sub.planId, planLabel: planName(sub.planId), interval: sub.interval, amountMinor: sub.amountMinor,
      periodEnd: sub.currentPeriodEnd?.toISOString() ?? null, method: sub.paymentMethodLabel,
      pendingPlanId: sub.pendingPlanId, pendingPlanLabel: sub.pendingPlanId ? (sub.pendingPlanId === "free" ? "Free (cancelled)" : planName(sub.pendingPlanId)) : null, pendingInterval: sub.pendingInterval,
      graceUntil: sub.graceUntil?.toISOString() ?? null, endedReason: sub.endedReason,
    } : null,
    plans: PAID_PLANS.map((id) => ({
      id, name: planName(id), blurb: priceList.plans.find((p) => p.id === id)?.description ?? "",
      features: (priceList.plans.find((p) => p.id === id)?.features ?? []).filter((f) => !isFeatureHeading(f)).slice(0, 6),
      prices: Object.fromEntries(INTERVALS.map((i) => [i, planPriceFor(gateway, id, i)])) as Record<"MONTHLY" | "YEARLY", number>,
    })),
    invoices: invoices.map((i) => ({ id: i.id, number: i.number, kind: i.kind, issuedAt: i.issuedAt.toISOString(), amountMinor: i.amountMinor, planLabel: planName(i.planId), interval: i.interval })),
    extraAuthPlans: above.map((a) => `${planName(a.planId)} ${a.interval === "YEARLY" ? "yearly" : "monthly"}`),
  };
  return <BillingClient data={data} />;
}
