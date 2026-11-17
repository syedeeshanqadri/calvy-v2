import { NextResponse } from "next/server";
import { getBusinessFeatures } from "@/lib/getFeatures";

/**
 * Business gateways and online service payments are a Mid/Top feature. Basic businesses (the plan with the Rs 10 confirmation
 * fee, platformFeeMinorIN > 0) only ever pay that fee through Calvy's Cashfree. Plan enforcement is still OFF, but the plan's own
 * fee is not touched by it (lib/plans), so this check is real today.
 */
export const canUseOwnGateway = (limits: { platformFeeMinorIN: number }) => limits.platformFeeMinorIN === 0;

export async function gatewayPlanBlock(businessId: string): Promise<NextResponse | null> {
  const limits = await getBusinessFeatures(businessId);
  if (canUseOwnGateway(limits)) return null;
  return NextResponse.json({ error: "Connecting your own payment gateway is available on the Pro and Business plans. Upgrade to take online payments straight into your own account.", code: "UPGRADE_REQUIRED" }, { status: 403 });
}
