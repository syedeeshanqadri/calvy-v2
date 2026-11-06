import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { SettingsClient } from "./SettingsClient";
import { getBusinessFeatures } from "@/lib/getFeatures";
import { serializeSession } from "@/lib/tokenSessionsDb";
import { getEffectiveLimits } from "@/lib/getFeatures";
import { isFeatureEnabled } from "@/lib/flags";
import { FULL_ONLINE_ENABLED, countryFromCurrency } from "@/lib/fees";

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
        paymentMode: true, bankAccountName: true, bankAccountNumber: true,
        bankRoutingNumber: true, bankIban: true,
        legalBusinessName: true, rzpBusinessType: true, rzpCategory: true, rzpSubcategory: true,
        panNumber: true, gstNumber: true,
        addressStreet: true, addressCity: true, addressState: true, addressPostalCode: true,
        routeStatus: true, razorpayConnectAccountId: true,
        plan: true, planStatus: true, trialEndsAt: true, onlinePayMode: true, feePayer: true,
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
        ...business,
        phone: business.phone ?? "",
        email: business.email ?? "",
        address: business.address ?? "",
        website: business.website ?? "",
        description: business.description ?? "",
        availabilityJson: business.availabilityJson ?? "{}",
        currency: business.currency ?? "USD",
        paymentMode: business.paymentMode ?? "prepaid",
        bankAccountName: business.bankAccountName ?? "",
        bankAccountNumber: business.bankAccountNumber ?? "",
        bankRoutingNumber: business.bankRoutingNumber ?? "",
        bankIban: business.bankIban ?? "",
        slotInterval: business.slotInterval ?? 30,
        followUpDays: business.followUpDays ?? 0,
        legalBusinessName: business.legalBusinessName ?? "",
        rzpBusinessType: business.rzpBusinessType ?? "",
        rzpCategory: business.rzpCategory ?? "",
        rzpSubcategory: business.rzpSubcategory ?? "",
        panNumber: business.panNumber ?? "",
        gstNumber: business.gstNumber ?? "",
        addressStreet: business.addressStreet ?? "",
        addressCity: business.addressCity ?? "",
        addressState: business.addressState ?? "",
        addressPostalCode: business.addressPostalCode ?? "",
        routeStatus: business.routeStatus ?? "not_started",
        razorpayConnectAccountId: business.razorpayConnectAccountId ?? "",
      }}
      tokenSessions={tokenRows.map(serializeSession)}
      staff={staff}
      payments={{
        mode: business.onlinePayMode, payer: business.feePayer, feeMinorIN: limits.platformFeeMinorIN,
        currency: business.currency ?? "INR", isIndia: countryFromCurrency(business.currency) === "IN",
        live: isFeatureEnabled("onlinePayments"), fullOnlineAvailable: FULL_ONLINE_ENABLED,
      }}
      customSlotInterval={features.customSlotInterval}
      stripePayments={features.stripePayments}
    />
  );
}
