"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Wallet, ArrowDownToLine, Clock, CheckCircle, XCircle, AlertCircle, Loader2 } from "lucide-react";
import Link from "next/link";

interface Withdrawal {
  id: string; amount: number; status: string; notes: string;
  adminNotes: string; requestedAt: string; processedAt: string | null;
}
interface Transaction {
  id: string; amount: number; description: string; date: string;
}

const STATUS_STYLES: Record<string, { label: string; className: string; icon: React.ElementType }> = {
  pending:  { label: "Pending",  className: "bg-amber-50 text-amber-700",  icon: Clock },
  approved: { label: "Approved", className: "bg-blue-50 text-blue-700",    icon: CheckCircle },
  released: { label: "Released", className: "bg-green-50 text-green-700",  icon: CheckCircle },
  rejected: { label: "Rejected", className: "bg-red-50 text-red-700",      icon: XCircle },
};

export function WalletClient({ walletBalance, currencySymbol, hasBankDetails, withdrawals, transactions }: {
  walletBalance: number;
  currencySymbol: string;
  hasBankDetails: boolean;
  withdrawals: Withdrawal[];
  transactions: Transaction[];
}) {
  const router = useRouter();
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const fmt = (n: number) => `${currencySymbol}${n.toFixed(2)}`;
  const hasPending = withdrawals.some(w => w.status === "pending");

  async function requestWithdrawal() {
    setError(""); setSuccess("");
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) { setError("Enter a valid amount."); return; }
    if (amt > walletBalance) { setError("Amount exceeds your wallet balance."); return; }
    setSubmitting(true);
    try {
      const res = await fetch("/api/wallet/withdraw", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: amt, notes }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Something went wrong."); return; }
      setSuccess("Withdrawal request submitted! The admin will process it shortly.");
      setAmount(""); setNotes("");
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <DashboardLayout title="Wallet" subtitle="Manage your earnings and withdrawal requests">
      <div className="max-w-3xl space-y-6">

        {/* Balance card */}
        <div className="bg-gradient-to-br from-[#0f0f1a] to-[#1a1a2e] rounded-2xl p-6 text-white">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center">
              <Wallet size={20} />
            </div>
            <div>
              <p className="text-white/60 text-sm">Available balance</p>
              <p className="font-syne font-bold text-3xl">{fmt(walletBalance)}</p>
            </div>
          </div>
          <p className="text-white/40 text-xs">Balance reflects prepaid bookings paid by clients. Postpaid payments collected in person are not included.</p>
        </div>

        {/* Withdraw request form */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><ArrowDownToLine size={16} /> Request Withdrawal</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {!hasBankDetails && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-700 flex items-start gap-2">
                <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
                <span>Please add your <Link href="/dashboard/settings" className="underline font-medium">bank account details</Link> in Settings &rsaquo; Payout Settings before requesting a withdrawal.</span>
              </div>
            )}
            {hasPending && (
              <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-sm text-blue-700">
                You already have a pending withdrawal request. Wait for it to be processed before submitting a new one.
              </div>
            )}
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-[#0f0f1a] block mb-1.5">Amount</label>
                <div className="relative">
                  <span className="absolute left-3 top-3 text-[#6b6b80] text-sm">{currencySymbol}</span>
                  <input
                    type="number"
                    min="1"
                    max={walletBalance}
                    step="0.01"
                    placeholder="0.00"
                    value={amount}
                    onChange={e => setAmount(e.target.value)}
                    disabled={!hasBankDetails || hasPending}
                    className="w-full h-11 rounded-xl border border-[#e8e6e0] pl-7 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent disabled:opacity-50"
                  />
                </div>
                <p className="text-xs text-[#6b6b80] mt-1">Max: {fmt(walletBalance)}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-[#0f0f1a] block mb-1.5">Notes (optional)</label>
                <input
                  type="text"
                  placeholder="Reference, invoice no., etc."
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  disabled={!hasBankDetails || hasPending}
                  className="w-full h-11 rounded-xl border border-[#e8e6e0] px-4 text-sm focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent disabled:opacity-50"
                />
              </div>
            </div>
            {error && <p className="text-sm text-red-500">{error}</p>}
            {success && <p className="text-sm text-green-600">{success}</p>}
            <Button onClick={requestWithdrawal} disabled={submitting || !hasBankDetails || hasPending || !amount} className="gap-2">
              {submitting ? <Loader2 size={14} className="animate-spin" /> : <ArrowDownToLine size={14} />}
              Submit withdrawal request
            </Button>
          </CardContent>
        </Card>

        {/* Withdrawal history */}
        <Card>
          <CardHeader><CardTitle>Withdrawal Requests</CardTitle></CardHeader>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-[#fafaf8] border-b border-[#f0ede8]">
                  {["Date", "Amount", "Notes", "Status", "Admin notes"].map(h => (
                    <th key={h} className="text-left text-xs font-semibold text-[#6b6b80] px-4 py-3 first:pl-6 last:pr-6">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {withdrawals.map(w => {
                  const s = STATUS_STYLES[w.status] ?? STATUS_STYLES.pending;
                  return (
                    <tr key={w.id} className="border-b border-[#f5f3ef] last:border-0 hover:bg-[#fafaf8]">
                      <td className="px-4 py-3 pl-6 text-sm text-[#6b6b80]">{new Date(w.requestedAt).toLocaleDateString()}</td>
                      <td className="px-4 py-3 text-sm font-bold">{fmt(w.amount)}</td>
                      <td className="px-4 py-3 text-sm text-[#6b6b80]">{w.notes || "—"}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full ${s.className}`}>
                          <s.icon size={11} />{s.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 pr-6 text-sm text-[#6b6b80]">{w.adminNotes || "—"}</td>
                    </tr>
                  );
                })}
                {withdrawals.length === 0 && (
                  <tr><td colSpan={5} className="text-center py-10 text-sm text-[#6b6b80]">No withdrawal requests yet</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Transaction history */}
        <Card>
          <CardHeader><CardTitle>Prepaid Transaction History</CardTitle></CardHeader>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-[#fafaf8] border-b border-[#f0ede8]">
                  {["Date", "Description", "Amount"].map(h => (
                    <th key={h} className="text-left text-xs font-semibold text-[#6b6b80] px-4 py-3 first:pl-6 last:pr-6">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {transactions.map(t => (
                  <tr key={t.id} className="border-b border-[#f5f3ef] last:border-0 hover:bg-[#fafaf8]">
                    <td className="px-4 py-3 pl-6 text-sm text-[#6b6b80]">{new Date(t.date).toLocaleDateString()}</td>
                    <td className="px-4 py-3 text-sm">{t.description}</td>
                    <td className="px-4 py-3 pr-6 text-sm font-bold text-green-600">+{fmt(t.amount)}</td>
                  </tr>
                ))}
                {transactions.length === 0 && (
                  <tr><td colSpan={3} className="text-center py-10 text-sm text-[#6b6b80]">No prepaid transactions yet</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>

      </div>
    </DashboardLayout>
  );
}
