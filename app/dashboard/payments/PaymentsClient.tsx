"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { StatCard } from "@/components/ui/StatCard";
import { useCurrency } from "@/components/providers/CurrencyProvider";
import { DollarSign, TrendingUp, Clock, CheckCircle, Loader2 } from "lucide-react";

interface PaymentRow {
  id: string; clientName: string; serviceName: string;
  price: number; paymentStatus: string; paymentMode: string; date: string;
}

function downloadPaymentsCSV(payments: PaymentRow[], formatPrice: (n: number) => string) {
  const headers = ["Client", "Service", "Amount", "Date", "Mode", "Status"];
  const lines = [
    headers.join(","),
    ...payments.map(p => [
      `"${p.clientName}"`, `"${p.serviceName}"`, formatPrice(p.price),
      p.date, p.paymentMode, p.paymentStatus,
    ].join(",")),
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `payments-${new Date().toISOString().split("T")[0]}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export function PaymentsClient({ payments, totalPaid, totalPending, paidCount, csvExport = false }: {
  payments: PaymentRow[]; totalPaid: number; totalPending: number; paidCount: number; csvExport?: boolean;
}) {
  const { formatPrice } = useCurrency();
  const router = useRouter();
  const [marking, setMarking] = useState<string | null>(null);

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

  return (
    <DashboardLayout title="Payments" subtitle="Track revenue and payment status">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Prepaid collected" value={formatPrice(totalPaid)} icon={DollarSign} iconColor="#dcfce7" />
        <StatCard label="Pending / postpaid" value={formatPrice(totalPending)} icon={Clock} iconColor="#fef3c7" />
        <StatCard label="Monthly revenue" value={formatPrice(monthRevenue)} icon={TrendingUp} iconColor="#dbeafe" />
        <StatCard label="Paid invoices" value={paidCount} icon={CheckCircle} iconColor="#f0fdf4" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Payment history</CardTitle>
          {csvExport && <button onClick={() => downloadPaymentsCSV(payments, formatPrice)} className="text-xs text-accent font-medium hover:underline">Export CSV</button>}
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-[#fafaf8] border-b border-[#f0ede8]">
                {["Client", "Service", "Amount", "Date", "Mode", "Status", ""].map(h => (
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
                    <span className={`inline-flex items-center text-xs font-semibold px-2 py-0.5 rounded-full ${p.paymentMode === "postpaid" ? "bg-amber-50 text-amber-700" : "bg-blue-50 text-blue-700"}`}>
                      {p.paymentMode === "postpaid" ? "Postpaid" : "Prepaid"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center text-xs font-semibold px-2.5 py-1 rounded-full ${p.paymentStatus === "paid" ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700"}`}>
                      {p.paymentStatus === "paid" ? "✓ Paid" : "⏳ Pending"}
                    </span>
                  </td>
                  <td className="px-4 py-3 pr-6">
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
