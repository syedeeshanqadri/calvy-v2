import { requireAdminPage } from "@/lib/admin/auth";
import { prisma } from "@/lib/prisma";
import { getVerifiedLimits, VERIFIED_DEFAULTS } from "@/lib/verifiedLimits";
import LimitsForm from "./LimitsForm";

export const dynamic = "force-dynamic";

export default async function AdminSettingsPage() {
  await requireAdminPage();
  const limits = await getVerifiedLimits(prisma);
  return (
    <div className="p-8 max-w-2xl space-y-6">
      <div><h1 className="font-syne font-bold text-2xl">Settings</h1><p className="text-sm text-[#6b6b80]">Platform-wide rules.</p></div>
      <section className="bg-white rounded-2xl border border-[#e8e6e0] p-5 space-y-3">
        <h2 className="font-syne font-semibold text-[15px]">Verified-customer booking limits</h2>
        <p className="text-sm text-[#6b6b80]">Apply to a customer who signed in to My bookings with a verified email and booked through one of their own links (Book again, Use credit, Free follow-up). Guests keep the guest rules: 10 booking attempts a minute per device, one booking per person per day, six &quot;already booked&quot; answers an hour before a cooldown, at most 4 different people per booker contact a day (each business can change that), and no emails once one contact books 30 times in 24 hours. 0 means no limit.</p>
        <LimitsForm initial={limits} defaults={VERIFIED_DEFAULTS} />
      </section>
    </div>
  );
}
