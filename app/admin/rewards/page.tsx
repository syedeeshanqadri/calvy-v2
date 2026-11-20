import { requireAdminPage } from "@/lib/admin/auth";
import { prisma } from "@/lib/prisma";
import { getLevelConfig, lookupLevel } from "@/lib/rewards/levelService";
import { LEVEL_LABEL } from "@/lib/rewards/levels";
import { LevelConfigForm } from "./LevelConfigForm";
import { LevelAdjustForm } from "./LevelAdjustForm";

export const dynamic = "force-dynamic";
const field = "h-10 rounded-xl border border-[#e8e6e0] bg-white px-3 text-sm";

/** Calvy Levels: the settings (no deploy needed) and a per-customer level lookup with a manual, audited adjust. */
export default async function AdminRewardsPage(props: { searchParams: Promise<{ q?: string | string[] }> }) {
  await requireAdminPage();
  const raw = (await props.searchParams).q;
  const q = (Array.isArray(raw) ? raw[0] : raw)?.trim().slice(0, 254) ?? "";
  const [config, found] = await Promise.all([getLevelConfig(prisma), q ? lookupLevel(prisma, q) : Promise.resolve(null)]);
  return (
    <div className="min-w-0 space-y-8">
      <div>
        <h1 className="font-syne text-2xl font-bold">Rewards: Calvy Levels</h1>
        <p className="text-sm text-[#6b6b80] mt-1">Levels lower Calvy&apos;s own confirmation fee, only where it exists (Free plan, India). Changes apply to the next booking; bookings already made keep the fee they were charged.</p>
      </div>
      <section aria-label="Settings" className="space-y-3"><h2 className="font-syne text-lg font-bold">Settings</h2><LevelConfigForm initial={config} /></section>
      <section aria-label="Customer level" className="space-y-3">
        <h2 className="font-syne text-lg font-bold">Customer level</h2>
        <form method="get" className="flex gap-2">
          <input name="q" defaultValue={q} placeholder="Email or phone number" aria-label="Email or phone number" className={`${field} flex-1 max-w-md`} />
          <button type="submit" className="h-10 px-4 rounded-xl bg-[#0f0f14] text-white text-sm font-semibold">Look up</button>
        </form>
        {q && !found && <p className="text-sm text-[#6b6b80]">Nothing to show: enter a full email address or phone number.</p>}
        {found && (
          <div className="bg-white rounded-2xl border border-[#e8e6e0] p-4 space-y-1 text-sm">
            <p><strong>{found.identity.slice(2)}</strong> · {LEVEL_LABEL[found.level]} · fee Rs {found.feeMinor / 100}</p>
            <p>Attended days: {found.attendedDays90} in the last 90, {found.attendedDaysTotal} in all · Attended referrals: {found.referralsAttended} · Streak: {found.streakMonths} months</p>
            <p className="text-[#6b6b80]">Stored level {found.storedLevel}{found.lastAttendedAt ? ` · last attended ${found.lastAttendedAt.toISOString().slice(0, 10)}` : ""}</p>
            <LevelAdjustForm q={q} current={found.level} />
          </div>
        )}
      </section>
    </div>
  );
}
