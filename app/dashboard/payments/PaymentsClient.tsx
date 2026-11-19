import { VerifiedOnly } from "@/components/auth/VerifyEmail";
"use client";
import { fromMinorUnits } from "@/lib/currency";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { StatCard } from "@/components/ui/StatCard";
import { LockedExport } from "@/components/dashboard/LockedExport";
import { useCurrency } from "@/components/providers/CurrencyProvider";
import { DollarSign, TrendingUp, Clock, CheckCircle, Loader2 } from "lucide-react";

interface PaymentRow {
  id: string; clientName: string; serviceName: string;
  price: number; paymentStatus: string; paymentMode: string; date: string;
  online?: { paymentId: string; gateway: string; status: string; amountMinor: number; refundedMinor: number; refundable: boolean } | null;
}

export function PaymentsClient({ payments, totalPaid, totalPending, paidCount, csvExport = false, upgradeHref = null }: {
  payments: PaymentRow[]; totalPaid: number; totalPending: number; paidCount: number; csvExport?: boolean; upgradeHref?: string | null;
}) {
  const { formatPrice, currency } = useCurrency();
  const router = useRouter();
  const [marking, setMarking] = useState<string | null>(null);
  const [refunding, setRefunding] = useState<string | null>(null);
  const [refundMsg, setRefundMsg] = useState<string | null>(null);

  const monthRevenue = payments
    .filter(p => {
      const d = new Date(p.date);
      const now = new Date();
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    })
    .reduce((s, p) => s + p.price, 0);

  async function markPaid(id: string) {
    setMarking(id);
    try {
      await fetch(`/api/appointments/${id}/payment`, { method: "PATCH" });
      router.refresh();
    } finally {
      setMarking(null);
    }
  }

  /** Refund through the business's own gateway. If the gateway cannot do it, the owner can mark it refunded manually. */
  async function refund(paymentId: string) {
    if (!confirm("Refund this payment to the customer through your payment gateway?")) return;
    setRefunding(paymentId); setRefundMsg(null);
    try {
      let res = await fetch(`/api/payments/${paymentId}/refund`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      let json = await res.json().catch(() => ({}));
      if (!res.ok && confirm(`${json.error ?? "The gateway could not refund this payment."}\n\nIf you have already refunded the customer yourself (in the gateway dashboard, or by cash/UPI), mark it as refunded manually?`)) {
        res = await fetch(`/api/payments/${paymentId}/refund`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ manual: true }) });
        json = await res.json().catch(() => ({}));
      }
      setRefundMsg(res.ok ? "Refund recorded." : (json.error ?? "Could not refund."));
      router.refresh();
    } finally {
      setRefunding(null);
    }
  }

  return (
    <DashboardLayout title="Payments" subtitle="Track revenue and payment status">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Prepaid collected" value={formatPrice(totalPaid)} icon={DollarSign} iconColor="#dcfce7" />
        <StatCard label="Pending / postpaid" value={formatPrice(totalPending)} icon={Clock} iconColor="#fef3c7" />
        <StatCard label="Monthly revenue" value={formatPrice(monthRevenue)} icon={TrendingUp} iconColor="#dbeafe" />
        <StatCard label="Paid invoices" value={paidCount} icon={CheckCircle} iconColor="#f0fdf4" />
      </div>

      {refundMsg && <p role="status" className="text-sm rounded-xl bg-white border border-[#e8e6e0] px-3 py-2 mb-4">{refundMsg}</p>}
      <Card>
        <CardHeader>
          <CardTitle>Payment history</CardTitle>
          {csvExport
            ? <VerifiedOnly what="Exporting payments"><a href="/api/payments/export" download className="text-xs text-accent font-medium hover:underline">Export CSV</a></VerifiedOnly>
            : <LockedExport upgradeHref={upgradeHref} />}
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-[#fafaf8] border-b border-[#f0ede8]">
                {["Client", "Service", "Amount", "Date", "Gateway", "Status", ""].map(h => (
                  <th key={h} className="text-left text-xs font-semibold text-[#6b6b80] px-4 py-3 first:pl-6 last:pr-6">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {payments.map(p => (
                <tr key={p.id} className="border-b border-[#f5f3ef] last:border-0 hover:bg-[#fafaf8] transition-colors">
                  <td className="px-4 py-3 pl-6 text-sm font-medium">{p.clientName}</td>
                  <td className="px-4 py-3 text-sm text-[#6b6b80]">{p.serviceName}</td>
                  <td className="px-4 py-3 text-sm font-bold">{formatPrice(p.price)}</td>
                  <td className="px-4 py-3 text-sm text-[#6b6b80]">{p.date}</td>
                  <td className="px-4 py-3">
                    {p.online ? (
                      <span className="text-xs text-[#3d3d4d]">{p.online.gateway}<br /><span className="text-[#6b6b80]">{formatPrice(fromMinorUnits(p.online.amountMinor, currency))} online</span></span>
                    ) : null}
                    <span className={`${p.online ? "hidden " : ""}inline-flex items-center text-xs font-semibold px-2 py-0.5 rounded-full ${p.paymentMode === "postpaid" ? "bg-amber-50 text-amber-700" : "bg-blue-50 text-blue-700"}`}>
                      {p.paymentMode === "postpaid" ? "Postpaid" : "Prepaid"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center text-xs font-semibold px-2.5 py-1 rounded-full ${p.paymentStatus === "paid" ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700"}`}>
                      {p.online?.status === "Refunded" || p.paymentStatus === "refunded" ? "Refunded" : p.paymentStatus === "paid" ? "✓ Paid" : "⏳ Pending"}
                    </span>
                  </td>
                  <td className="px-4 py-3 pr-6">
                    {p.online?.refundable && (
                      <button onClick={() => refund(p.online!.paymentId)} disabled={refunding === p.online.paymentId} className="text-xs font-semibold border border-[#e8e6e0] px-3 py-1.5 rounded-lg disabled:opacity-60">
                        {refunding === p.online.paymentId ? "Refunding…" : "Refund"}
                      </button>
                    )}
                    {p.paymentMode === "postpaid" && p.paymentStatus === "unpaid" && (
                      <button
                        onClick={() => markPaid(p.id)}
                        disabled={marking === p.id}
                        className="text-xs font-semibold text-white bg-green-600 hover:bg-green-700 disabled:opacity-60 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1"
                      >
                        {marking === p.id ? <Loader2 size={12} className="animate-spin" /> : null}
                        Mark paid
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {payments.length === 0 && (
                <tr><td colSpan={7} className="text-center py-12 text-sm text-[#6b6b80]">No payments yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </DashboardLayout>
  );
}
