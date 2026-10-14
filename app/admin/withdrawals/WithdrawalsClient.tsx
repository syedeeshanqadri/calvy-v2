"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Clock, CheckCircle, XCircle, Loader2, Building2, User, Banknote } from "lucide-react";

interface WithdrawalRow {
  id: string; amount: number; status: string; notes: string; adminNotes: string;
  requestedAt: string; processedAt: string | null;
  businessName: string; ownerEmail: string; ownerName: string;
  bankAccountName: string; bankAccountNumber: string; bankRoutingNumber: string; bankIban: string;
  walletBalance: number; currency: string; currencySymbol: string;
}

const STATUS_STYLES: Record<string, { label: string; className: string; icon: React.ElementType }> = {
  pending:  { label: "Pending",  className: "bg-amber-50 text-amber-700 border border-amber-200",  icon: Clock },
  approved: { label: "Approved", className: "bg-blue-50 text-blue-700 border border-blue-200",    icon: CheckCircle },
  released: { label: "Released", className: "bg-green-50 text-green-700 border border-green-200",  icon: CheckCircle },
  rejected: { label: "Rejected", className: "bg-red-50 text-red-700 border border-red-200",        icon: XCircle },
};

export function WithdrawalsClient({ withdrawals }: { withdrawals: WithdrawalRow[] }) {
  const router = useRouter();
  const [processing, setProcessing] = useState<string | null>(null);
  const [adminNotes, setAdminNotes] = useState<Record<string, string>>({});
  const [expanded, setExpanded] = useState<string | null>(null);

  const pending = withdrawals.filter(w => w.status === "pending");
  const others = withdrawals.filter(w => w.status !== "pending");

  async function updateStatus(id: string, status: string) {
    setProcessing(id);
    try {
      await fetch(`/api/admin/withdrawals/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, adminNotes: adminNotes[id] ?? "" }),
      });
      router.refresh();
    } finally {
      setProcessing(null);
    }
  }

  function renderRow(w: WithdrawalRow) {
    const s = STATUS_STYLES[w.status] ?? STATUS_STYLES.pending;
    const isExpanded = expanded === w.id;
    const displayAmount = `${w.currencySymbol}${w.amount.toFixed(2)}`;
    const displayBalance = `${w.currencySymbol}${w.walletBalance.toFixed(2)}`;

    return (
      <div key={w.id} className="border border-[#e8e6e0] rounded-xl overflow-hidden mb-3">
        <button
          className="w-full flex items-center gap-4 p-4 hover:bg-[#fafaf8] transition-colors text-left"
          onClick={() => setExpanded(isExpanded ? null : w.id)}
        >
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="font-semibold text-sm">{w.businessName}</span>
              <span className="text-xs text-[#6b6b80]">·</span>
              <span className="text-xs text-[#6b6b80]">{w.ownerEmail}</span>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-lg font-bold">{displayAmount}</span>
              <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${s.className}`}>
                <s.icon size={11} />{s.label}
              </span>
              <span className="text-xs text-[#6b6b80]">{new Date(w.requestedAt).toLocaleDateString()}</span>
            </div>
          </div>
          <span className="text-[#6b6b80] text-xs">{isExpanded ? "▲" : "▼"}</span>
        </button>

        {isExpanded && (
          <div className="border-t border-[#e8e6e0] p-4 bg-[#fafaf8] space-y-4">
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="bg-white rounded-xl p-3 border border-[#e8e6e0]">
                <p className="text-xs font-bold text-[#6b6b80] uppercase tracking-wider mb-2 flex items-center gap-1"><Banknote size={11} /> Bank Details</p>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between"><span className="text-[#6b6b80]">Name</span><span className="font-medium">{w.bankAccountName || "—"}</span></div>
                  <div className="flex justify-between"><span className="text-[#6b6b80]">Account</span><span className="font-mono">{w.bankAccountNumber || "—"}</span></div>
                  <div className="flex justify-between"><span className="text-[#6b6b80]">Routing</span><span className="font-mono">{w.bankRoutingNumber || "—"}</span></div>
                  <div className="flex justify-between"><span className="text-[#6b6b80]">IBAN</span><span className="font-mono text-xs">{w.bankIban || "—"}</span></div>
                </div>
              </div>
              <div className="bg-white rounded-xl p-3 border border-[#e8e6e0]">
                <p className="text-xs font-bold text-[#6b6b80] uppercase tracking-wider mb-2 flex items-center gap-1"><Building2 size={11} /> Business Info</p>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between"><span className="text-[#6b6b80]">Business</span><span className="font-medium">{w.businessName}</span></div>
                  <div className="flex justify-between"><span className="text-[#6b6b80]">Owner</span><span className="font-medium">{w.ownerName}</span></div>
                  <div className="flex justify-between"><span className="text-[#6b6b80]">Email</span><span className="text-xs">{w.ownerEmail}</span></div>
                  <div className="flex justify-between"><span className="text-[#6b6b80]">Wallet</span><span className="font-bold">{displayBalance}</span></div>
                  <div className="flex justify-between"><span className="text-[#6b6b80]">Currency</span><span className="font-medium">{w.currency}</span></div>
                </div>
              </div>
            </div>

            {w.notes && (
              <div className="bg-white rounded-xl p-3 border border-[#e8e6e0]">
                <p className="text-xs font-bold text-[#6b6b80] uppercase tracking-wider mb-1">Tenant notes</p>
                <p className="text-sm">{w.notes}</p>
              </div>
            )}

            {w.status === "pending" && (
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-semibold text-[#6b6b80] block mb-1">Admin notes (optional)</label>
                  <input
                    type="text"
                    placeholder="Add a note for the tenant..."
                    value={adminNotes[w.id] ?? ""}
                    onChange={e => setAdminNotes(prev => ({ ...prev, [w.id]: e.target.value }))}
                    className="w-full h-9 rounded-lg border border-[#e8e6e0] px-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent/20"
                  />
                </div>
                <div className="flex gap-2 flex-wrap">
                  <button onClick={() => updateStatus(w.id, "approved")} disabled={processing === w.id}
                    className="flex items-center gap-1.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60 px-4 py-2 rounded-lg transition-colors">
                    {processing === w.id ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
                    Approve
                  </button>
                  <button onClick={() => updateStatus(w.id, "released")} disabled={processing === w.id}
                    className="flex items-center gap-1.5 text-sm font-semibold text-white bg-green-600 hover:bg-green-700 disabled:opacity-60 px-4 py-2 rounded-lg transition-colors">
                    {processing === w.id ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
                    Approve & Release
                  </button>
                  <button onClick={() => updateStatus(w.id, "rejected")} disabled={processing === w.id}
                    className="flex items-center gap-1.5 text-sm font-semibold text-white bg-red-500 hover:bg-red-600 disabled:opacity-60 px-4 py-2 rounded-lg transition-colors">
                    {processing === w.id ? <Loader2 size={14} className="animate-spin" /> : <XCircle size={14} />}
                    Reject
                  </button>
                </div>
              </div>
            )}

            {w.status !== "pending" && w.adminNotes && (
              <div className="bg-white rounded-xl p-3 border border-[#e8e6e0]">
                <p className="text-xs font-bold text-[#6b6b80] uppercase tracking-wider mb-1">Admin notes</p>
                <p className="text-sm">{w.adminNotes}</p>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="font-syne font-bold text-2xl text-[#0f0f1a]">Withdrawal Requests</h1>
        <p className="text-[#6b6b80] text-sm mt-1">Review and process tenant withdrawal requests</p>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-8">
        {[
          { label: "Pending", value: withdrawals.filter(w => w.status === "pending").length, color: "text-amber-600" },
          { label: "Released", value: withdrawals.filter(w => w.status === "released").length, color: "text-green-600" },
          { label: "Total requests", value: withdrawals.length, color: "text-[#0f0f1a]" },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl border border-[#e8e6e0] p-4">
            <p className="text-xs text-[#6b6b80] font-medium mb-1">{s.label}</p>
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {pending.length > 0 && (
        <div className="mb-8">
          <h2 className="text-sm font-bold uppercase tracking-wider text-[#6b6b80] mb-3">Pending ({pending.length})</h2>
          {pending.map(renderRow)}
        </div>
      )}

      {others.length > 0 && (
        <div>
          <h2 className="text-sm font-bold uppercase tracking-wider text-[#6b6b80] mb-3">Processed ({others.length})</h2>
          {others.map(renderRow)}
        </div>
      )}

      {withdrawals.length === 0 && (
        <div className="text-center py-16 text-[#6b6b80]">
          <User size={32} className="mx-auto mb-3 opacity-30" />
          <p className="font-medium">No withdrawal requests yet</p>
          <p className="text-sm mt-1">Tenant requests will appear here</p>
        </div>
      )}
    </div>
  );
}
