import { requireAdminPage } from "@/lib/admin/auth";
import { prisma } from "@/lib/prisma";
import { CALVY_OWNER, listCoupons } from "@/lib/coupons/service";
import { CouponForm } from "./CouponForm";
import { CouponToggle } from "./CouponToggle";

export const dynamic = "force-dynamic";

const TARGET: Record<string, string> = { FEE: "Rs 10 fee", SUBSCRIPTION: "Plan first payment" };
const rs = (m: number) => `Rs ${(m / 100).toFixed(m % 100 ? 2 : 0)}`;
const when = (d: Date | null) => (d ? d.toISOString().slice(0, 16).replace("T", " ") + " UTC" : "no limit");

/** Calvy coupons: for the Rs 10 confirmation fee and for plan subscriptions. Businesses make their own coupons for their services. */
export default async function AdminCouponsPage() {
  await requireAdminPage();
  const coupons = await listCoupons(prisma, { ownerKey: CALVY_OWNER });
  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-syne text-2xl font-bold">Coupons</h1>
        <p className="text-sm text-[#6b6b80] mt-1">One code per checkout. A fee coupon and a loyalty reward never combine: a coupon that clears the whole Rs 10 is used and the reward is kept. A plan coupon takes money off the first payment only. Coupons are switched off, never deleted.</p>
      </div>
      <section aria-label="New coupon" className="space-y-3"><h2 className="font-syne text-lg font-bold">New coupon</h2><CouponForm /></section>
      <section aria-label="Coupons" className="space-y-3">
        {coupons.length === 0 && <p className="text-sm text-[#6b6b80]">No coupons yet.</p>}
        {coupons.map((c) => (
          <div key={c.id} className="bg-white rounded-2xl border border-[#e8e6e0] p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm space-y-0.5">
              <p className="font-semibold">{c.code} <span className="font-normal text-[#6b6b80]">· {c.name}</span></p>
              <p className="text-[#4b4b5e]">{TARGET[c.target] ?? c.target} · {c.kind === "PERCENT" ? `${c.value}% off` : `${rs(c.value)} off`}{c.minAmountMinor ? ` · min ${rs(c.minAmountMinor)}` : ""}{c.firstBookingOnly ? " · first booking only" : ""}</p>
              <p className="text-xs text-[#6b6b80]">From {when(c.startsAt)} to {when(c.endsAt)} · used {c._count.redemptions}{c.maxRedemptions ? ` of ${c.maxRedemptions}` : ""} · {c.perCustomerLimit} per customer{c.planIds.length ? ` · plans: ${c.planIds.join(", ")}` : ""}{c.businessIds.length ? ` · ${c.businessIds.length} business(es)` : ""}</p>
            </div>
            <CouponToggle id={c.id} active={c.active} />
          </div>
        ))}
      </section>
    </div>
  );
}
