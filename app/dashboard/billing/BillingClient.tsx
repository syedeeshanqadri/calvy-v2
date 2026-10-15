"use client";
import { useState } from "react";
import { Check, X, Zap, Crown, Building2, Gift, AlertTriangle, Clock, ExternalLink, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { useFlags } from "@/components/providers/FlagsProvider";
import { Card } from "@/components/ui/Card";
import type { PlanData } from "./page";

const PLAN_ICONS: Record<string, typeof Zap> = {
  free: Gift,
  starter: Zap,
  professional: Crown,
  business: Building2,
};

const COMPARISON_ROWS: { label: string; key: keyof PlanData | "maxStaff" | "maxServices" | "maxMonthlyAppointments" }[] = [
  { label: "Staff members",        key: "maxStaff" },
  { label: "Services",             key: "maxServices" },
  { label: "Bookings/month",       key: "maxMonthlyAppointments" },
  { label: "Custom branding",      key: "customBranding" },
  { label: "Email reminders",      key: "emailReminders" },
  { label: "WhatsApp reminders",   key: "whatsappReminders" },
  { label: "Chatbot widget",       key: "chatbotWidget" },
  { label: "Online payments",      key: "stripePayments" },
  { label: "Analytics",            key: "analytics" },
  { label: "Expense tracking",     key: "expenseTracking" },
  { label: "Wallet & withdrawals", key: "wallet" },
  { label: "Broadcasts",           key: "broadcasts" },
  { label: "CSV export",           key: "csvExport" },
  { label: "Group booking",        key: "groupBooking" },
  { label: "Custom slot intervals",key: "customSlotInterval" },
  { label: "Remove branding",      key: "removeBranding" },
  { label: "Priority support",     key: "prioritySupport" },
];

function formatLimit(val: number): string {
  return val === -1 ? "Unlimited" : String(val);
}

function CellValue({ plan, rowKey }: { plan: PlanData; rowKey: keyof PlanData | string }) {
  const val = (plan as Record<string, unknown>)[rowKey];
  if (rowKey === "maxStaff" || rowKey === "maxServices" || rowKey === "maxMonthlyAppointments") {
    return <span className="text-sm font-medium text-[#3d3d4d]">{formatLimit(val as number)}</span>;
  }
  if (typeof val === "boolean") {
    return val
      ? <Check size={16} className="mx-auto text-accent" />
      : <X size={16} className="mx-auto text-[#c5c3bf]" />;
  }
  return <span className="text-sm text-[#3d3d4d]">{String(val)}</span>;
}

interface Props {
  currentPlan: string;
  planStatus: string;
  trialDaysLeft: number;
  razorpaySubscriptionId: string | null;
  monthlyAppointments: number;
  totalClients: number;
  totalServices: number;
  totalStaff: number;
  plans: PlanData[];
}

export default function BillingClient({
  currentPlan,
  planStatus,
  razorpaySubscriptionId,
  monthlyAppointments,
  totalClients,
  totalServices,
  totalStaff,
  plans,
}: Props) {
  const router = useRouter();
  const flags = useFlags();
  // UI-only flag: hide "Remove branding" unless FEATURE_REMOVE_BRANDING is on.
  const hideBranding = !flags.removeBranding;
  const comparisonRows = hideBranding ? COMPARISON_ROWS.filter(r => r.key !== "removeBranding") : COMPARISON_ROWS;
  const isBrandingText = (f: string) => /remove\s+(calvy\s+)?branding/i.test(f);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [syncMsg, setSyncMsg] = useState("");
  const [interval, setInterval] = useState<"monthly" | "annual">("monthly");

  async function handleSync() {
    setLoading("sync");
    setSyncMsg("");
    setError("");
    try {
      const res = await fetch("/api/billing/sync", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setSyncMsg(`Synced! Plan updated to ${data.plan} (${data.planStatus}).`);
        router.refresh();
      } else {
        setError(data.error || "Sync failed");
      }
    } catch {
      setError("Network error during sync");
    } finally {
      setLoading(null);
    }
  }

  async function handleUpgrade(planId: string) {
    setLoading(planId);
    setError("");
    try {
      const res = await fetch("/api/billing/upgrade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: planId, interval }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        setError(data.error || "Failed to start checkout. Please try again.");
        setLoading(null);
      }
    } catch {
      setError("Network error. Please check your connection and try again.");
      setLoading(null);
    }
  }

  async function handleCancel() {
    if (!confirm("Cancel your subscription? You'll keep access until the end of the billing period.")) return;
    setLoading("cancel");
    setError("");
    try {
      const res = await fetch("/api/billing/portal", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        router.refresh();
      } else {
        setError(data.error || "Failed to cancel subscription.");
        setLoading(null);
      }
    } catch {
      setError("Network error. Please check your connection and try again.");
      setLoading(null);
    }
  }

  const isFree = currentPlan === "free" || currentPlan === "trial";
  const isPastDue = planStatus === "past_due";
  const isActive = planStatus === "active";
  const isCancelled = planStatus === "cancelled" || planStatus === "canceled";

  const STATUS_LABELS: Record<string, string> = {
    free: "Lifetime Free",
    trialing: "Lifetime Free",
    active: "Active",
    past_due: "Payment Due",
    canceled: "Cancelled",
    cancelled: "Cancelled",
  };
  const statusLabel = STATUS_LABELS[planStatus] ?? planStatus.replace("_", " ");

  const paidPlans = plans.filter(p => p.id !== "free");

  return (
    <DashboardLayout title="Billing & Plans" subtitle="Manage your subscription and usage">
      <div className="space-y-6 max-w-5xl">

        {/* Banners */}
        {isFree && (
          <div className="flex items-center gap-3 p-4 rounded-xl bg-sky-50 border border-sky-200 text-sky-700">
            <Clock size={16} className="flex-shrink-0" />
            <span className="text-sm">
              You&apos;re on the <strong>Lifetime Free plan</strong>. Upgrade below to unlock more features.
            </span>
          </div>
        )}
        {isPastDue && (
          <div className="flex items-center gap-3 p-4 rounded-xl bg-red-50 border border-red-200 text-red-700">
            <AlertTriangle size={16} className="flex-shrink-0" />
            <span className="text-sm font-medium">Payment failed. Please re-subscribe to restore access.</span>
          </div>
        )}
        {error && (
          <div className="flex items-center gap-3 p-4 rounded-xl bg-red-50 border border-red-200 text-red-700">
            <AlertTriangle size={16} className="flex-shrink-0" />
            <span className="text-sm">{error}</span>
          </div>
        )}

        {/* Current plan + usage */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className="p-6">
            <p className="text-xs font-semibold text-[#6b6b80] uppercase tracking-wider mb-3">Current Plan</p>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center text-accent">
                {(() => { const Icon = PLAN_ICONS[currentPlan] ?? Zap; return <Icon size={20} />; })()}
              </div>
              <div>
                <p className="font-syne font-bold text-lg capitalize">{isFree ? "Free Plan" : currentPlan}</p>
                <p className="text-xs text-[#6b6b80] capitalize">{statusLabel}</p>
              </div>
            </div>
            <div className="mt-4 flex flex-col gap-2">
              {isActive && razorpaySubscriptionId && (
                <button
                  onClick={handleCancel}
                  disabled={!!loading}
                  className="flex items-center gap-1.5 text-sm text-red-500 hover:underline font-medium disabled:opacity-50"
                >
                  <ExternalLink size={13} />
                  {loading === "cancel" ? "Cancelling…" : "Cancel subscription"}
                </button>
              )}
              {razorpaySubscriptionId && !isActive && (
                <button
                  onClick={handleSync}
                  disabled={!!loading}
                  className="flex items-center gap-1.5 text-sm text-[#6b6b80] hover:text-accent hover:underline font-medium disabled:opacity-50"
                >
                  <RefreshCw size={13} className={loading === "sync" ? "animate-spin" : ""} />
                  {loading === "sync" ? "Syncing…" : "Sync subscription status"}
                </button>
              )}
              {syncMsg && <p className="text-xs text-green-600 font-medium">{syncMsg}</p>}
            </div>
          </Card>

          <Card className="p-6">
            <p className="text-xs font-semibold text-[#6b6b80] uppercase tracking-wider mb-4">This Month&apos;s Usage</p>
            <div className="grid grid-cols-2 gap-4">
              {[
                { label: "Appointments", value: monthlyAppointments },
                { label: "Total Clients", value: totalClients },
                { label: "Services", value: totalServices },
                { label: "Staff Members", value: totalStaff },
              ].map((stat) => (
                <div key={stat.label} className="bg-[#f8f7f4] rounded-xl p-3">
                  <p className="font-syne font-bold text-2xl">{stat.value}</p>
                  <p className="text-[#6b6b80] text-xs mt-0.5">{stat.label}</p>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* Billing interval toggle */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-syne font-semibold text-base">Choose a Plan</h2>
            <div className="flex items-center gap-1 bg-[#f8f7f4] rounded-xl p-1">
              <button
                onClick={() => setInterval("monthly")}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${interval === "monthly" ? "bg-white shadow-sm text-[#0f0f1a]" : "text-[#6b6b80]"}`}
              >
                Monthly
              </button>
              <button
                onClick={() => setInterval("annual")}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-1.5 ${interval === "annual" ? "bg-white shadow-sm text-[#0f0f1a]" : "text-[#6b6b80]"}`}
              >
                Annual
                <span className="text-[10px] font-bold bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full">Save ~20%</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {paidPlans.map((plan) => {
              const isCurrent = currentPlan === plan.id && isActive;
              const Icon = PLAN_ICONS[plan.id] ?? Zap;
              const displayPrice = interval === "annual" ? plan.annualPrice : plan.price;
              return (
                <div
                  key={plan.id}
                  className={`relative rounded-2xl p-6 flex flex-col border ${
                    plan.highlight
                      ? "bg-white border-accent shadow-[0_0_0_2px_#0284c720]"
                      : "bg-white border-[#e8e6e0]"
                  }`}
                >
                  {plan.highlight && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                      <span className="bg-accent text-white text-[11px] font-bold px-3 py-1 rounded-full">Most Popular</span>
                    </div>
                  )}

                  <div className="flex items-center gap-3 mb-4">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${plan.highlight ? "bg-accent/10 text-accent" : "bg-[#f8f7f4] text-[#6b6b80]"}`}>
                      <Icon size={18} />
                    </div>
                    <div>
                      <p className="font-syne font-bold text-[15px]">{plan.name}</p>
                      <p className="text-[#6b6b80] text-xs">{plan.description}</p>
                    </div>
                  </div>

                  <div className="mb-1">
                    <span className="font-syne font-bold text-3xl">${displayPrice}</span>
                    <span className="text-[#6b6b80] text-sm">/month</span>
                  </div>
                  {interval === "annual" && (
                    <p className="text-xs text-green-600 font-medium mb-4">
                      Billed annually — ${(displayPrice * 12).toFixed(0)}/year
                    </p>
                  )}
                  {interval === "monthly" && <div className="mb-4" />}

                  {/* Feature highlights — use custom list if set, else auto-build */}
                  {plan.features.length > 0 ? (
                    <ul className="space-y-2 flex-1 mb-5">
                      {plan.features.filter((f) => !hideBranding || !isBrandingText(f)).map((f) => (
                        <li key={f} className="flex items-start gap-2 text-sm text-[#3d3d4d]">
                          <Check size={14} className="mt-0.5 flex-shrink-0 text-accent" />
                          {f}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <ul className="space-y-2 flex-1 mb-5">
                      <li className="flex items-start gap-2 text-sm text-[#3d3d4d]">
                        <Check size={14} className="mt-0.5 flex-shrink-0 text-accent" />
                        {plan.maxStaff === -1 ? "Unlimited staff" : `${plan.maxStaff} staff members`}
                      </li>
                      <li className="flex items-start gap-2 text-sm text-[#3d3d4d]">
                        <Check size={14} className="mt-0.5 flex-shrink-0 text-accent" />
                        {plan.maxServices === -1 ? "Unlimited services" : `${plan.maxServices} services`}
                      </li>
                      <li className="flex items-start gap-2 text-sm text-[#3d3d4d]">
                        <Check size={14} className="mt-0.5 flex-shrink-0 text-accent" />
                        {plan.maxMonthlyAppointments === -1 ? "Unlimited bookings/month" : `${plan.maxMonthlyAppointments} bookings/month`}
                      </li>
                      {plan.customBranding && <li className="flex items-start gap-2 text-sm text-[#3d3d4d]"><Check size={14} className="mt-0.5 flex-shrink-0 text-accent" />Custom branding</li>}
                      {plan.emailReminders && <li className="flex items-start gap-2 text-sm text-[#3d3d4d]"><Check size={14} className="mt-0.5 flex-shrink-0 text-accent" />Email reminders</li>}
                      {plan.whatsappReminders && <li className="flex items-start gap-2 text-sm text-[#3d3d4d]"><Check size={14} className="mt-0.5 flex-shrink-0 text-accent" />WhatsApp reminders</li>}
                      {plan.stripePayments && <li className="flex items-start gap-2 text-sm text-[#3d3d4d]"><Check size={14} className="mt-0.5 flex-shrink-0 text-accent" />Online payments</li>}
                      {plan.analytics && <li className="flex items-start gap-2 text-sm text-[#3d3d4d]"><Check size={14} className="mt-0.5 flex-shrink-0 text-accent" />Analytics dashboard</li>}
                      {plan.chatbotWidget && <li className="flex items-start gap-2 text-sm text-[#3d3d4d]"><Check size={14} className="mt-0.5 flex-shrink-0 text-accent" />Chatbot booking widget</li>}
                      {plan.wallet && <li className="flex items-start gap-2 text-sm text-[#3d3d4d]"><Check size={14} className="mt-0.5 flex-shrink-0 text-accent" />Wallet & withdrawals</li>}
                      {plan.prioritySupport && <li className="flex items-start gap-2 text-sm text-[#3d3d4d]"><Check size={14} className="mt-0.5 flex-shrink-0 text-accent" />Priority support</li>}
                    </ul>
                  )}

                  {isCurrent ? (
                    <div className="w-full py-2.5 rounded-xl text-center text-sm font-medium bg-[#f8f7f4] text-[#6b6b80]">
                      Current Plan
                    </div>
                  ) : (
                    <button
                      onClick={() => handleUpgrade(plan.id)}
                      disabled={!!loading}
                      className={`w-full py-2.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-50 ${
                        plan.highlight
                          ? "bg-accent hover:bg-accent/90 text-white"
                          : "bg-[#f8f7f4] hover:bg-[#f0ede8] text-[#3d3d4d]"
                      }`}
                    >
                      {loading === plan.id ? "Redirecting…" : isFree || isCancelled ? "Get started" : "Switch plan"}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Feature comparison table */}
        <Card>
          <div className="px-6 py-4 border-b border-[#f0ede8]">
            <h2 className="font-syne font-semibold text-[15px]">Feature Comparison</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#fafaf8] border-b border-[#f0ede8]">
                  <th className="text-left px-6 py-3 text-xs font-semibold text-[#6b6b80]">Feature</th>
                  {plans.map(p => (
                    <th key={p.id} className={`text-center px-4 py-3 text-xs font-semibold ${p.id === currentPlan ? "text-accent" : "text-[#6b6b80]"}`}>
                      {p.name}
                      {p.id === currentPlan && <span className="ml-1 text-[10px] normal-case font-normal">(current)</span>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f5f3ef]">
                {comparisonRows.map(({ label, key }) => (
                  <tr key={label} className="hover:bg-[#fafaf8] transition-colors">
                    <td className="px-6 py-3 text-[#3d3d4d] font-medium">{label}</td>
                    {plans.map(p => (
                      <td key={p.id} className="px-4 py-3 text-center">
                        <CellValue plan={p} rowKey={key} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </DashboardLayout>
  );
}
