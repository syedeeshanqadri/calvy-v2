import { pageAccess } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { getBusinessFeatures } from "@/lib/getFeatures";
import { UpgradeGate } from "@/components/dashboard/UpgradeGate";
import { publicView } from "@/lib/whatsapp/store";
import { WhatsAppClient } from "./WhatsAppClient";

export const dynamic = "force-dynamic";

// Owner only: WhatsApp credentials are never a ticked permission.
export default async function WhatsAppSettingsPage() {
  const session = await pageAccess("owner");
  const businessId = session.user.businessId;
  const features = await getBusinessFeatures(businessId);
  if (!features.whatsappReminders) {
    return <UpgradeGate title="WhatsApp" subtitle="Message customers on WhatsApp" description="Connect your own WhatsApp Business Account to send booking confirmations and reminders on WhatsApp. Available on Starter plans and above." />;
  }
  const [config, templates] = await Promise.all([
    prisma.whatsAppConfig.findUnique({ where: { businessId } }),
    prisma.whatsAppTemplate.findMany({ where: { businessId }, orderBy: [{ name: "asc" }, { language: "asc" }], select: { name: true, language: true, status: true, reason: true } }),
  ]);
  return <WhatsAppClient initialConfig={publicView(config)} initialTemplates={templates} />;
}
