import { requireAdminPage } from "@/lib/admin/auth";
import { prisma } from "@/lib/prisma";
import { planName } from "@/lib/subscriptions/rules";
import { formatCurrencyAmount } from "@/lib/currency";

export const dynamic = "force-dynamic";
const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");

/**
 * Billing: how every business pays for its Calvy plan. India is Cashfree; international is Razorpay, normally recurring on a card. A business whose
 * card or currency Razorpay would not do recurring for is shown here with a "links mode" badge (the fallback is never silent).
 */
export default async function AdminBillingPage() {
  await requireAdminPage();
  const rows = await prisma.subscription.findMany({
    where: { state: { in: ["ACTIVE", "PAST_DUE", "AUTHORISED", "PENDING"] } }, orderBy: [{ gateway: "asc" }, { createdAt: "desc" }], take: 200,
    include: { business: { select: { id: true, name: true } } },
  });
  const links = rows.filter((r) => r.billingMode === "LINKS");
  return (
    <div className="min-w-0 space-y-8">
      <div>
        <h1 className="font-syne text-2xl font-bold">Billing</h1>
        <p className="text-sm text-[#6b6b80] mt-1">Calvy plan subscriptions. India pays through Cashfree (rupees), everyone else through Razorpay (dollars, cards). Settlement of Razorpay payments is in rupees, because Calvy&apos;s Razorpay account is an Indian one.</p>
      </div>
      <section aria-label="Links mode" className="space-y-3">
        <h2 className="font-syne text-lg font-bold">Links mode ({links.length})</h2>
        <p className="text-sm text-[#6b6b80]">Razorpay would not do recurring card billing for these. They pay a payment link each period, with email reminders; the team was emailed when each one fell back.</p>
        {links.length === 0 && <p className="text-sm text-[#6b6b80]">None.</p>}
        {links.map((r) => (
          <div key={r.id} className="bg-white rounded-2xl border border-amber-200 p-4 text-sm space-y-1">
            <p><span className="inline-block rounded-full bg-amber-100 text-amber-800 text-xs font-bold px-2.5 py-0.5 mr-2">links mode</span><strong>{r.business.name}</strong> · {planName(r.planId)} {r.interval.toLowerCase()}</p>
            <p className="text-[#4b4b5e]">Reason: {r.linksReason ?? "not recorded"} · {r.state}{r.currentPeriodEnd ? ` · paid until ${day(r.currentPeriodEnd)}` : ""}</p>
          </div>
        ))}
      </section>
      <section aria-label="All subscriptions" className="space-y-3">
        <h2 className="font-syne text-lg font-bold">All live subscriptions ({rows.length})</h2>
        <div className="bg-white rounded-2xl border border-[#e8e6e0] divide-y divide-[#e8e6e0]">
          {rows.length === 0 && <p className="p-3 text-sm text-[#6b6b80]">No subscriptions yet.</p>}
          {rows.map((r) => (
            <div key={r.id} className="p-3 text-sm flex flex-wrap justify-between gap-2">
              <span>
                <strong>{r.business.name}</strong> · {planName(r.planId)} {r.interval.toLowerCase()} · {formatCurrencyAmount(r.amountMinor / 100, r.currency)}
                {r.billingMode === "LINKS" && <span className="ml-2 inline-block rounded-full bg-amber-100 text-amber-800 text-xs font-bold px-2 py-0.5">links mode</span>}
              </span>
              <span className="text-[#4b4b5e]">{r.gateway === "RAZORPAY" ? "Razorpay" : "Cashfree"} · {r.state}{r.state === "PAST_DUE" && r.graceUntil ? ` (grace to ${day(r.graceUntil)})` : ""}{r.currentPeriodEnd ? ` · until ${day(r.currentPeriodEnd)}` : ""}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
