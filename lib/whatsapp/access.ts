import { NextResponse } from "next/server";
import { getBusinessFeatures } from "@/lib/getFeatures";
import { plansWith } from "@/lib/planCopy";

/** WhatsApp is a mid-and-up plan feature (the whatsappReminders flag; applyEnforcement is inside getBusinessFeatures). */
export async function whatsappPlanBlock(businessId: string): Promise<NextResponse | null> {
  const limits = await getBusinessFeatures(businessId);
  if (limits.whatsappReminders) return null;
  return NextResponse.json({ error: `WhatsApp is available on the ${plansWith("whatsappReminders")} plans. Upgrade to connect your WhatsApp Business Account.`, code: "UPGRADE_REQUIRED" }, { status: 403 });
}
