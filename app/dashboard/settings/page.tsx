import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { SettingsClient } from "./SettingsClient";
import { getBusinessFeatures } from "@/lib/getFeatures";
import { redactSecrets } from "@/lib/admin/redact";
import { serializeSession } from "@/lib/tokenSessionsDb";
import { getEffectiveLimits } from "@/lib/getFeatures";
import { isFeatureEnabled } from "@/lib/flags";
import { countryFromCurrency } from "@/lib/fees";
import { canUseOwnGateway } from "@/lib/payments/access";
import { listGateways } from "@/lib/payments/gatewayStore";

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.businessId) redirect("/login");

  const [business, features, tokenRows, staff] = await Promise.all([
    prisma.business.findUnique({
      where: { id: session.user.businessId },
      select: {
        id: true, name: true, slug: true, businessType: true, packId: true, bookingMode: true, termsOverride: true,
        phone: true, email: true, address: true, website: true,
        description: true, primaryColor: true, availabilityJson: true, currency: true,
        slotInterval: true, maxPeoplePerBooker: true, followUpDays: true,
        paymentMode: true,
        plan: true, planStatus: true, trialEndsAt: true, payOption: true, advanceKind: true, advanceValue: true,
      },
    }),
    getBusinessFeatures(session.user.businessId),
    prisma.tokenSession.findMany({ where: { businessId: session.user.businessId }, orderBy: [{ startMin: "asc" }, { createdAt: "asc" }] }),
    prisma.staff.findMany({ where: { businessId: session.user.businessId, isActive: true }, select: { id: true, name: true }, orderBy: { createdAt: "asc" } }),
  ]);

  if (!business) redirect("/login");
  const limits = await getEffectiveLimits(business);

  return (
    <SettingsClient
      business={{
        ...(session.user.viewAs ? redactSecrets(business) : business),
        phone: business.phone ?? "",
        email: business.email ?? "",
        address: business.address ?? "",
        website: business.website ?? "",
        description: business.description ?? "",
        availabilityJson: business.availabilityJson ?? "{}",
        currency: business.currency ?? "USD",
        paymentMode: business.paymentMode ?? "prepaid",
        slotInterval: business.slotInterval ?? 30,
        followUpDays: business.followUpDays ?? 0,
      }}
      tokenSessions={tokenRows.map(serializeSession)}
      staff={staff}
      payments={{
        currency: business.currency ?? "INR", isIndia: countryFromCurrency(business.currency) === "IN",
        live: isFeatureEnabled("onlinePayments"),
        canUseOwnGateway: canUseOwnGateway(limits), feeMinorIN: limits.platformFeeMinorIN,
        gateways: canUseOwnGateway(limits) && !session.user.viewAs ? await listGateways(business.id) : [],
        payOption: business.payOption, advanceKind: business.advanceKind, advanceValue: business.advanceValue,
        services: (await prisma.service.findMany({ where: { businessId: business.id, isActive: true }, select: { id: true, name: true, price: true, payOption: true, advanceKind: true, advanceValue: true }, orderBy: { name: "asc" } })),
      }}
      customSlotInterval={features.customSlotInterval}
      stripePayments={features.stripePayments}
    />
  );
}
