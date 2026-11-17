import { requireAdminPage } from "@/lib/admin/auth";
import { prisma } from "@/lib/prisma";
import { lookupProgress } from "@/lib/rewards/service";
import { progressLabel } from "@/lib/rewards/rules";
import { OfferToggle } from "./OfferToggle";

export const dynamic = "force-dynamic";
const field = "h-10 rounded-xl border border-[#e8e6e0] bg-white px-3 text-sm";

/** Offers (on/off) and a per-customer progress lookup by email or phone. */
export default async function AdminOffersPage(props: { searchParams: Promise<{ q?: string | string[] }> }) {
  await requireAdminPage();
  const raw = (await props.searchParams).q;
  const q = (Array.isArray(raw) ? raw[0] : raw)?.trim().slice(0, 254) ?? "";
  const [offers, found] = await Promise.all([
    prisma.offer.findMany({ orderBy: { createdAt: "asc" } }),
    q ? lookupProgress(prisma, q) : Promise.resolve(null),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-syne text-2xl font-bold">Offers</h1>
        <p className="text-sm text-[#6b6b80] mt-1">Switching an offer off stops new visits counting and stops rewards being spent. Rewards already earned are kept.</p>
      </div>

      <section aria-label="Offers" className="space-y-3">
        {offers.map((o) => (
          <div key={o.id} className="bg-white rounded-2xl border border-[#e8e6e0] p-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-semibold">{o.name}</p>
              <p className="text-xs text-[#6b6b80]">Code {o.key} · every {o.every} attended days earns one free Rs 10 confirmation</p>
            </div>
            <OfferToggle id={o.id} enabled={o.enabled} />
          </div>
        ))}
      </section>

      <section aria-label="Customer progress" className="space-y-3">
        <h2 className="font-syne text-lg font-bold">Customer progress</h2>
        <form method="get" className="flex gap-2">
          <input name="q" defaultValue={q} placeholder="Email or phone number" aria-label="Email or phone number" className={`${field} flex-1 max-w-md`} />
          <button type="submit" className="h-10 px-4 rounded-xl bg-[#0f0f14] text-white text-sm font-semibold">Look up</button>
        </form>
        {q && !found && <p className="text-sm text-[#6b6b80]">Nothing to show: enter a full email address or phone number.</p>}
        {found && (
          <div className="bg-white rounded-2xl border border-[#e8e6e0] p-4 space-y-1 text-sm">
            <p><strong>{found.identity.slice(2)}</strong> · {progressLabel(found.view)}</p>
            <p>Attended days counted: {found.counted} · Rewards earned: {found.earned} · Used: {found.used} · Ready: {found.view.available}</p>
            <p className="text-[#6b6b80]">Recent counted days: {found.recentDays.length ? found.recentDays.join(", ") : "none"}</p>
            {!found.offer.enabled && <p className="text-amber-700">This offer is currently disabled.</p>}
          </div>
        )}
      </section>
    </div>
  );
}
