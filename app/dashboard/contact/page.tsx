import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Mail, MessageCircle, Phone, LifeBuoy, Clock } from "lucide-react";
import { authOptions } from "@/lib/auth";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { CONTACT, SUPPORT_EMAIL, TEAM_EMAIL } from "@/lib/site";

export const dynamic = "force-dynamic";

const row = "flex flex-col sm:flex-row sm:items-center gap-3 rounded-2xl border border-[#e8e6e0] bg-white p-4";
const action = "inline-flex items-center justify-center h-10 px-4 rounded-xl text-sm font-semibold bg-[#0f0f1a] text-white shrink-0";

/** Open to every signed-in role (owner and team members): how to reach the Calvy team. */
export default async function ContactPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");
  const isOwner = !!session.user.businessId;

  return (
    <DashboardLayout title="Support" subtitle="We are here to help">
      <div className="max-w-2xl space-y-4">
        <p className="flex items-center gap-2 text-sm text-[#3d3d4d]"><Clock size={16} aria-hidden /> We reply within 24 hours.</p>

        <div className={row}>
          <span className="h-10 w-10 rounded-xl bg-sky-50 text-sky-600 grid place-items-center shrink-0"><Mail size={18} aria-hidden /></span>
          <div className="flex-1 min-w-0"><p className="font-semibold">Support</p><p className="text-sm text-[#6b6b80] break-all">{SUPPORT_EMAIL}</p></div>
          <a className={action} href={`mailto:${SUPPORT_EMAIL}`}>Email support</a>
        </div>

        <div className={row}>
          <span className="h-10 w-10 rounded-xl bg-violet-50 text-violet-600 grid place-items-center shrink-0"><Mail size={18} aria-hidden /></span>
          <div className="flex-1 min-w-0"><p className="font-semibold">Team</p><p className="text-sm text-[#6b6b80] break-all">{TEAM_EMAIL}</p></div>
          <a className={action} href={`mailto:${TEAM_EMAIL}`}>Email the team</a>
        </div>

        <div className={row}>
          <span className="h-10 w-10 rounded-xl bg-emerald-50 text-emerald-600 grid place-items-center shrink-0"><Phone size={18} aria-hidden /></span>
          <div className="flex-1 min-w-0"><p className="font-semibold">Phone</p><p className="text-sm text-[#6b6b80]">{CONTACT.phone}</p></div>
          <div className="flex gap-2 flex-wrap">
            <a className={action} href={CONTACT.phoneHref}>Call</a>
            <a className={`${action} bg-emerald-600`} href={CONTACT.whatsappHref} target="_blank" rel="noopener noreferrer"><MessageCircle size={16} className="mr-1" aria-hidden /> WhatsApp</a>
          </div>
        </div>

        {isOwner && (
          <p className="text-sm text-[#6b6b80] pt-2">
            Prefer a tracked request? <Link href="/dashboard/support" className="underline font-semibold inline-flex items-center gap-1"><LifeBuoy size={14} aria-hidden /> Open a support ticket</Link>.
          </p>
        )}
      </div>
    </DashboardLayout>
  );
}
