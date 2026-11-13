import { NextResponse } from "next/server";
import { getBusinessFeatures } from "@/lib/getFeatures";

/** WhatsApp is a mid-and-up plan feature (the whatsappReminders flag; applyEnforcement is inside getBusinessFeatures). */
export async function whatsappPlanBlock(businessId: string): Promise<NextResponse | null> {
  const limits = await getBusinessFeatures(businessId);
  if (limits.whatsappReminders) return null;
  return NextResponse.json({ error: "WhatsApp is available on Starter plans and above. Upgrade to connect your WhatsApp Business Account.", code: "UPGRADE_REQUIRED" }, { status: 403 });
}
