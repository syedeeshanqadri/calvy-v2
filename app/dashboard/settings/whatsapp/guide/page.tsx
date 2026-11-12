import Link from "next/link";
import { pageAccess } from "@/lib/access";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";

export const dynamic = "force-dynamic";

const steps: { title: string; body: string }[] = [
  { title: "Meta Business account", body: "Create or open your Meta Business account at business.facebook.com and finish business verification if Meta asks for it." },
  { title: "Developer app", body: "Go to developers.facebook.com > My Apps > Create App, choose the Business type, and attach your Business account." },
  { title: "Add the WhatsApp product", body: "In the app, add WhatsApp. Meta creates a WhatsApp Business Account (WABA) and a test number for you." },
  { title: "Phone number", body: "Under WhatsApp > API Setup, use the test number to try things out, or add your own business number. A number already on the WhatsApp or WhatsApp Business app must be removed from it first." },
  { title: "Permanent token", body: "In Business Settings > Users > System Users, add a System User (Admin), assign your app and WABA with full control, then Generate token with the whatsapp_business_messaging and whatsapp_business_management permissions. Never use the 24-hour token from API Setup." },
  { title: "Copy four values", body: "Phone number ID and WABA ID (API Setup page), the permanent token (from the System User), and the App secret (App settings > Basic > Show). Paste them into Calvy and press Save and verify." },
  { title: "Webhook", body: "WhatsApp > Configuration > Webhook > Edit. Paste the callback URL and verify token shown in Calvy, press Verify and save, then subscribe to messages and message_template_status_update." },
  { title: "Install templates", body: "Press Install Calvy templates. Meta reviews each one; refresh until they show APPROVED, then send a test message to your own number." },
];

export default async function WhatsAppGuidePage() {
  await pageAccess("owner");
  return (
    <DashboardLayout title="WhatsApp setup guide" subtitle="About 15 minutes, once">
      <div className="max-w-2xl space-y-4">
        <p className="text-sm text-[#6b6b80]">You bring your own WhatsApp Business Account and Meta bills you for conversations. Calvy never sees your WhatsApp password, and your token is stored encrypted.</p>
        <ol className="space-y-3">
          {steps.map((s, i) => (
            <li key={s.title} className="bg-white rounded-2xl border border-[#e8e6e0] p-4">
              <p className="font-semibold text-sm"><span className="text-accent mr-2">{i + 1}.</span>{s.title}</p>
              <p className="text-sm text-[#6b6b80] mt-1">{s.body}</p>
            </li>
          ))}
        </ol>
        <p className="text-sm"><Link href="/dashboard/settings/whatsapp" className="text-accent underline">Back to WhatsApp settings</Link></p>
      </div>
    </DashboardLayout>
  );
}
