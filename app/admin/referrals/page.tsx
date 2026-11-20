import { requireAdminPage } from "@/lib/admin/auth";
import { prisma } from "@/lib/prisma";
import { referralAdminView } from "@/lib/rewards/referrals";
import { REFERRAL_CAP_PER_MONTH, REFERRAL_REVIEW_ABOVE } from "@/lib/rewards/ladder";

export const dynamic = "force-dynamic";

const REASON: Record<string, string> = {
  SELF: "same person", SAME_PHONE: "same phone", SAME_DEVICE: "same device", LOOP: "referral loop", NOT_NEW: "friend already booked before", MONTHLY_CAP: "referrer at the monthly cap",
};

/** Referrals: who referred whom, why some were refused, and referrers with more than 5 attempts this month (for review). */
export default async function AdminReferralsPage() {
  await requireAdminPage();
  const v = await referralAdminView(prisma);
  return (
    <div className="min-w-0 space-y-8">
      <div>
        <h1 className="font-syne text-2xl font-bold">Referrals</h1>
        <p className="text-sm text-[#6b6b80] mt-1">A friend must be new to Calvy. Both people get a free Rs 10 after the friend&apos;s first attended visit, up to {REFERRAL_CAP_PER_MONTH} rewarded referrals per referrer a month. Same phone, same device, self-referral and loops are refused.</p>
      </div>
      <section aria-label="To review" className="space-y-3">
        <h2 className="font-syne text-lg font-bold">To review ({v.month})</h2>
        <p className="text-sm text-[#6b6b80]">Referrers with more than {REFERRAL_REVIEW_ABOVE} attempts this month.</p>
        {v.flagged.length === 0 && <p className="text-sm text-[#6b6b80]">Nobody is over the limit.</p>}
        {v.flagged.map((f) => (
          <div key={f.referrer} className="bg-white rounded-2xl border border-amber-200 p-4 text-sm">
            <p className="font-semibold">{f.referrer}</p>
            <p className="text-[#4b4b5e]">{f.attempts} attempts · {f.rewarded} rewarded · {f.rejected} refused</p>
          </div>
        ))}
      </section>
      <section aria-label="Recent referrals" className="space-y-3">
        <h2 className="font-syne text-lg font-bold">Recent referrals</h2>
        {v.recent.length === 0 && <p className="text-sm text-[#6b6b80]">None yet.</p>}
        <div className="bg-white rounded-2xl border border-[#e8e6e0] divide-y divide-[#e8e6e0]">
          {v.recent.map((r) => (
            <div key={r.id} className="p-3 text-sm flex flex-wrap justify-between gap-2">
              <span>{r.referrer} → {r.referred}</span>
              <span className="text-[#4b4b5e]">{r.status}{r.reason ? ` (${REASON[r.reason] ?? r.reason})` : ""} · {r.createdAt.toISOString().slice(0, 10)}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
