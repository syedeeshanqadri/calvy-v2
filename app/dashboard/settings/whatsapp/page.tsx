import { pageAccess } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { getBusinessFeatures } from "@/lib/getFeatures";
import { UpgradeGate } from "@/components/dashboard/UpgradeGate";
import { listCurrentTemplates, publicView } from "@/lib/whatsapp/store";
import { metaEnv } from "@/lib/whatsapp/embedded";
import { coexistenceEnabled } from "@/lib/whatsapp/embeddedSession";
import { WhatsAppClient } from "./WhatsAppClient";
import { plansWith } from "@/lib/planCopy";
import { VerifyGateNotice } from "@/components/auth/VerifyEmail";

export const dynamic = "force-dynamic";

// Owner only: WhatsApp credentials are never a ticked permission.
export default async function WhatsAppSettingsPage() {
  const session = await pageAccess("owner");
  const businessId = session.user.businessId;
  const features = await getBusinessFeatures(businessId);
  if (!features.whatsappReminders) {
    return <UpgradeGate title="WhatsApp" subtitle="Message customers on WhatsApp" description={`Connect your own WhatsApp Business Account to send booking confirmations and reminders on WhatsApp. Available on the ${plansWith("whatsappReminders")} plans.`} />;
  }
  const [config, templates] = await Promise.all([prisma.whatsAppConfig.findUnique({ where: { businessId } }), listCurrentTemplates(businessId)]);
  const env = metaEnv(); // the App ID and configuration ID are public identifiers, so they go to the browser as props
  return <><div className="px-4 pt-4"><VerifyGateNotice what="Connecting WhatsApp" /></div><WhatsAppClient initialConfig={publicView(config)} initialTemplates={templates} embedded={env ? { appId: env.appId, configId: env.configId, coexistence: coexistenceEnabled() } : null} /></>;
}
