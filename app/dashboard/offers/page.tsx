import { pageAccess } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { getBusinessFeatures } from "@/lib/getFeatures";
import { UpgradeGate } from "@/components/dashboard/UpgradeGate";
import { OffersClient } from "./OffersClient";
import { plansWith, cheapestPlanWith } from "@/lib/planCopy";

export const dynamic = "force-dynamic";

/** Offers & discounts (paid plans): business-funded offers that apply automatically, and coupon codes for this business's services. */
export default async function OffersPage() {
  const session = await pageAccess("services.manage");
  const businessId = session.user.businessId;
  const features = await getBusinessFeatures(businessId);
  if (!features.offers) {
    return (
      <UpgradeGate
        title="Offers & discounts"
        subtitle="Bring customers back"
        description={`Make coupon codes and offers such as every 5th visit, happy hours and packages. Available on the ${plansWith("offers")} plans.`}
      />
    );
  }
  const [offers, coupons, services] = await Promise.all([
    prisma.businessOffer.findMany({ where: { businessId }, orderBy: { createdAt: "desc" } }),
    prisma.coupon.findMany({ where: { ownerKey: businessId, businessId }, orderBy: { createdAt: "desc" }, include: { _count: { select: { redemptions: true } } } }),
    prisma.service.findMany({ where: { businessId, isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  return (
    <OffersClient
      services={services}
      offers={offers.map((o) => ({ id: o.id, kind: o.kind, name: o.name, percent: o.percent, nth: o.nth, days: o.days, startMinute: o.startMinute, endMinute: o.endMinute, serviceIds: o.serviceIds, active: o.active, showOnSite: o.showOnSite }))}
      coupons={coupons.map((c) => ({ id: c.id, code: c.code, name: c.name, kind: c.kind, value: c.value, minAmountMinor: c.minAmountMinor, endsAt: c.endsAt?.toISOString() ?? null, maxRedemptions: c.maxRedemptions, perCustomerLimit: c.perCustomerLimit, firstBookingOnly: c.firstBookingOnly, active: c.active, used: c._count.redemptions }))}
    />
  );
}
