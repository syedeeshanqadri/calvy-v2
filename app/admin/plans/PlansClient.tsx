"use client";
import { useState } from "react";
import { useFlags } from "@/components/providers/FlagsProvider";
import { Check, Edit2, ExternalLink, X, Plus, Infinity } from "lucide-react";

interface PlanConfig {
  planId: string;
  name: string;
  price: number;
  annualPrice: number;
  description: string;
  maxStaff: number;
  maxServices: number;
  maxMonthlyAppointments: number;
  maxBroadcastsPerMonth: number;
  maxTeamMembers: number;
  platformFeeMinorIN: number;
  analytics: boolean;
  customBranding: boolean;
  imageUpload: boolean;
  seoControls: boolean;
  chatbotWidget: boolean;
  groupBooking: boolean;
  multiService: boolean;
  stripePayments: boolean;
  emailReminders: boolean;
  smsReminders: boolean;
  broadcasts: boolean;
  csvExport: boolean;
  expenseTracking: boolean;
  wallet: boolean;
  customSlotInterval: boolean;
  removeBranding: boolean;
  prioritySupport: boolean;
  features: string; // JSON array
}

interface Props {
  plans: PlanConfig[];
  tenantCounts: Record<string, number>;
  envConfigured: Record<string, boolean>;
}

const PLAN_COLORS: Record<string, string> = {
  free: "#6b6b80",
  starter: "#3b82f6",
  professional: "#8b5cf6",
  business: "#0284c7",
};

type FlagItem = { key: keyof PlanConfig; label: string };
type FlagGroup = { label: string; flags: FlagItem[] };

const ALL_FLAG_GROUPS: FlagGroup[] = [
  {
    label: "Online Presence",
    flags: [
      { key: "customBranding", label: "Custom branding" },
      { key: "imageUpload", label: "Image upload" },
      { key: "seoControls", label: "SEO controls" },
      { key: "chatbotWidget", label: "Chatbot widget" },
    ],
  },
  {
    label: "Booking",
    flags: [
      { key: "multiService", label: "Multi-service" },
      { key: "groupBooking", label: "Group booking" },
      { key: "stripePayments", label: "Online payments" },
      { key: "customSlotInterval", label: "Custom slot interval" },
    ],
  },
  {
    label: "Notifications",
    flags: [
      { key: "emailReminders", label: "Email reminders" },
      { key: "smsReminders", label: "WhatsApp reminders" },
      { key: "broadcasts", label: "Broadcasts" },
    ],
  },
  {
    label: "Analytics & Finance",
    flags: [
      { key: "analytics", label: "Analytics" },
      { key: "csvExport", label: "CSV export" },
      { key: "expenseTracking", label: "Expense tracking" },
      { key: "wallet", label: "Wallet" },
    ],
  },
  {
    label: "Premium",
    flags: [
      { key: "removeBranding", label: "Remove branding" },
      { key: "prioritySupport", label: "Priority support" },
    ],
  },
];


export function PlansClient({ plans: initialPlans, tenantCounts, envConfigured }: Props) {
  const flags = useFlags();
  // UI-only flag: hide "Remove branding" unless FEATURE_REMOVE_BRANDING is on.
  const FEATURE_FLAG_GROUPS = ALL_FLAG_GROUPS
    .map(g => ({ ...g, flags: g.flags.filter(f => f.key !== "removeBranding" || flags.removeBranding) }))
    .filter(g => g.flags.length > 0);
  // Flat list for card display
  const ALL_FEATURE_FLAGS: FlagItem[] = FEATURE_FLAG_GROUPS.flatMap(g => g.flags);
  const [plans, setPlans] = useState(initialPlans);
  const [editing, setEditing] = useState<PlanConfig | null>(null);
  const [form, setForm] = useState<PlanConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [newFeature, setNewFeature] = useState("");

  function openEdit(plan: PlanConfig) {
    setEditing(plan);
    setForm({ ...plan });
    setError("");
    setNewFeature("");
  }

  function closeEdit() {
    setEditing(null);
    setForm(null);
    setError("");
  }

  function updateForm(key: keyof PlanConfig, value: unknown) {
    setForm(prev => prev ? { ...prev, [key]: value } : prev);
  }

  function parsedFeatures(f: string): string[] {
    try { return JSON.parse(f); } catch { return []; }
  }

  function addFeature() {
    if (!newFeature.trim() || !form) return;
    const list = [...parsedFeatures(form.features), newFeature.trim()];
    updateForm("features", JSON.stringify(list));
    setNewFeature("");
  }

  function removeFeature(i: number) {
    if (!form) return;
    const list = parsedFeatures(form.features).filter((_, idx) => idx !== i);
    updateForm("features", JSON.stringify(list));
  }

  async function save() {
    if (!form) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/plans/${form.planId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          price: Number(form.price),
          annualPrice: Number(form.annualPrice),
          description: form.description,
          maxStaff: Number(form.maxStaff),
          maxServices: Number(form.maxServices),
          maxMonthlyAppointments: Number(form.maxMonthlyAppointments),
          maxBroadcastsPerMonth: Number(form.maxBroadcastsPerMonth),
          maxTeamMembers: Number(form.maxTeamMembers),
          platformFeeMinorIN: Number(form.platformFeeMinorIN),
          analytics: form.analytics,
          customBranding: form.customBranding,
          imageUpload: form.imageUpload,
          seoControls: form.seoControls,
          chatbotWidget: form.chatbotWidget,
          groupBooking: form.groupBooking,
          multiService: form.multiService,
          stripePayments: form.stripePayments,
          emailReminders: form.emailReminders,
          smsReminders: form.smsReminders,
          broadcasts: form.broadcasts,
          csvExport: form.csvExport,
          expenseTracking: form.expenseTracking,
          wallet: form.wallet,
          customSlotInterval: form.customSlotInterval,
          removeBranding: form.removeBranding,
          prioritySupport: form.prioritySupport,
          features: parsedFeatures(form.features),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save");
      setPlans(prev => prev.map(p => p.planId === form.planId ? { ...data, features: data.features ?? "[]" } : p));
      closeEdit();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-8 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-syne font-bold text-2xl">Plans & Pricing</h1>
          <p className="text-[#6b6b80] text-sm mt-1">Edit plan names, prices, limits, and features</p>
        </div>
      </div>

      {/* Plan cards */}
      <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-4">
        {plans.map(plan => {
          const count = tenantCounts[plan.planId] ?? 0;
          const stripeOk = plan.planId === "free" ? true : envConfigured[plan.planId];
          const features = parsedFeatures(plan.features).filter(f => flags.removeBranding || !/remove\s+(calvy\s+)?branding/i.test(f));
          const accent = PLAN_COLORS[plan.planId] ?? "#0284c7";
          const enabledFlags = ALL_FEATURE_FLAGS.filter(f => plan[f.key as keyof PlanConfig]);

          return (
            <div key={plan.planId} className="bg-white rounded-2xl border border-[#e8e6e0] p-6 flex flex-col relative group">
              {/* Edit button */}
              <button
                onClick={() => openEdit(plan)}
                className="absolute top-4 right-4 w-7 h-7 rounded-lg bg-[#f8f7f4] hover:bg-[#f0ede8] flex items-center justify-center text-[#6b6b80] hover:text-[#0f0f1a] transition-colors"
                title="Edit plan"
              >
                <Edit2 size={13} />
              </button>

              <div className="flex items-center gap-2 mb-4 pr-8">
                <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: accent }} />
                <span className="font-syne font-bold text-base">{plan.name}</span>
                {plan.planId !== "free" && (
                  <span className={`ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full ${stripeOk ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"}`}>
                    {stripeOk ? "Razorpay ✓" : "Not set"}
                  </span>
                )}
              </div>

              <p className="font-syne font-bold text-3xl mb-0.5">
                {plan.price === 0 ? "Free" : `$${plan.price}`}
              </p>
              {plan.price > 0 && <p className="text-[#6b6b80] text-xs mb-3">/month</p>}
              <p className="text-[#6b6b80] text-xs mb-4">{plan.description}</p>

              <div className="bg-[#f8f7f4] rounded-xl p-3 mb-4 text-center">
                <p className="font-syne font-bold text-2xl">{count}</p>
                <p className="text-xs text-[#6b6b80]">tenant{count !== 1 ? "s" : ""}</p>
              </div>

              <ul className="space-y-1.5 text-xs text-[#3d3d4d] flex-1">
                <li className="flex gap-2 items-center">
                  <Check size={11} className="flex-shrink-0" style={{ color: accent }} />
                  {plan.maxStaff === -1 ? <span className="flex items-center gap-1">Unlimited staff <Infinity size={10} /></span> : `${plan.maxStaff} staff`}
                </li>
                <li className="flex gap-2 items-center">
                  <Check size={11} className="flex-shrink-0" style={{ color: accent }} />
                  {plan.maxServices === -1 ? <span className="flex items-center gap-1">Unlimited services <Infinity size={10} /></span> : `${plan.maxServices} services`}
                </li>
                <li className="flex gap-2 items-center">
                  <Check size={11} className="flex-shrink-0" style={{ color: accent }} />
                  {plan.maxMonthlyAppointments === -1 ? <span className="flex items-center gap-1">Unlimited appts/mo <Infinity size={10} /></span> : `${plan.maxMonthlyAppointments} appts/mo`}
                </li>
                {enabledFlags.map(f => (
                  <li key={f.key} className="flex gap-2">
                    <Check size={11} className="flex-shrink-0 mt-0.5" style={{ color: accent }} />
                    {f.label}
                  </li>
                ))}
                {features.map((feat, i) => (
                  <li key={i} className="flex gap-2">
                    <Check size={11} className="flex-shrink-0 mt-0.5" style={{ color: accent }} />
                    {feat}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>

      {/* Razorpay config */}
      <div className="bg-white rounded-2xl border border-[#e8e6e0] overflow-hidden">
        <div className="px-6 py-4 border-b border-[#f0ede8]">
          <h2 className="font-syne font-semibold text-[15px]">Razorpay Configuration</h2>
        </div>
        <div className="p-6 space-y-3">
          {[
            { label: "Key ID", ok: !!process.env.RAZORPAY_KEY_ID, key: "RAZORPAY_KEY_ID" },
            { label: "Starter Plan ID", ok: envConfigured.starter, key: "RAZORPAY_PLAN_STARTER" },
            { label: "Professional Plan ID", ok: envConfigured.professional, key: "RAZORPAY_PLAN_PROFESSIONAL" },
            { label: "Business Plan ID", ok: envConfigured.business, key: "RAZORPAY_PLAN_BUSINESS" },
          ].map(item => (
            <div key={item.key} className="flex items-center gap-3 p-3 rounded-xl bg-[#f8f7f4]">
              <div className={`w-2 h-2 rounded-full flex-shrink-0 ${item.ok ? "bg-green-500" : "bg-amber-400"}`} />
              <span className="text-sm font-medium flex-1">{item.label}</span>
              <code className="text-xs text-[#6b6b80] bg-white px-2 py-0.5 rounded border border-[#e8e6e0]">{item.key}</code>
            </div>
          ))}
        </div>
        <div className="px-6 pb-6">
          <a href="https://dashboard.razorpay.com/app/subscriptions" target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-sm text-[#0284c7] font-medium hover:underline">
            <ExternalLink size={14} /> Open Razorpay Dashboard
          </a>
        </div>
      </div>

      {/* Edit Modal */}
      {form && editing && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={closeEdit}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#f0ede8]">
              <div>
                <h2 className="font-syne font-bold text-lg">Edit {editing.name} Plan</h2>
                <p className="text-xs text-[#6b6b80] mt-0.5">Changes apply to all new and existing tenants on this plan</p>
              </div>
              <button onClick={closeEdit} className="w-8 h-8 rounded-xl hover:bg-[#f8f7f4] flex items-center justify-center text-[#6b6b80] transition-colors">
                <X size={16} />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Plan Details */}
              <div className="space-y-3">
                <h3 className="text-xs font-bold text-[#6b6b80] uppercase tracking-wider">Plan Details</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm font-medium block mb-1.5">Plan name</label>
                    <input className="w-full rounded-xl border border-[#e8e6e0] px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0284c7]/20 focus:border-[#0284c7] transition-all"
                      value={form.name} onChange={e => updateForm("name", e.target.value)} />
                  </div>
                  <div>
                    <label className="text-sm font-medium block mb-1.5">Description</label>
                    <input className="w-full rounded-xl border border-[#e8e6e0] px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0284c7]/20 focus:border-[#0284c7] transition-all"
                      value={form.description} onChange={e => updateForm("description", e.target.value)} />
                  </div>
                </div>
                {form.planId !== "free" && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-sm font-medium block mb-1.5">Monthly price (USD)</label>
                      <div className="relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[#6b6b80] font-semibold">$</span>
                        <input type="number" min="0" step="1"
                          className="w-full rounded-xl border border-[#e8e6e0] pl-8 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0284c7]/20 focus:border-[#0284c7] transition-all"
                          value={form.price} onChange={e => updateForm("price", e.target.value)} />
                      </div>
                    </div>
                    <div>
                      <label className="text-sm font-medium block mb-1.5">Annual price (USD/mo)</label>
                      <div className="relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[#6b6b80] font-semibold">$</span>
                        <input type="number" min="0" step="1"
                          className="w-full rounded-xl border border-[#e8e6e0] pl-8 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0284c7]/20 focus:border-[#0284c7] transition-all"
                          value={form.annualPrice} onChange={e => updateForm("annualPrice", e.target.value)} />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Limits */}
              <div className="space-y-3">
                <h3 className="text-xs font-bold text-[#6b6b80] uppercase tracking-wider">
                  Limits <span className="font-normal normal-case">(-1 = unlimited, 0 = disabled)</span>
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { key: "maxStaff", label: "Max staff" },
                    { key: "maxServices", label: "Max services" },
                    { key: "maxMonthlyAppointments", label: "Appts/month" },
                    { key: "maxBroadcastsPerMonth", label: "Broadcasts/month" },
                    { key: "maxTeamMembers", label: "Team members (besides owner)" },
                  ].map(({ key, label }) => (
                    <div key={key}>
                      <label className="text-xs font-medium block mb-1.5">{label}</label>
                      <input type="number" min="-1"
                        className="w-full rounded-xl border border-[#e8e6e0] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0284c7]/20 focus:border-[#0284c7] transition-all text-center"
                        value={form[key as keyof PlanConfig] as number}
                        onChange={e => updateForm(key as keyof PlanConfig, e.target.value)} />
                      <p className="text-[10px] text-[#6b6b80] mt-1 text-center">
                        {(form[key as keyof PlanConfig] as number) === -1 ? "∞ Unlimited" : (form[key as keyof PlanConfig] as number) === 0 ? "Disabled" : (form[key as keyof PlanConfig] as number)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Online booking fee (India) */}
              <div className="space-y-2">
                <h3 className="text-xs font-bold text-[#6b6b80] uppercase tracking-wider">Online booking fee (India)</h3>
                <label htmlFor="plan-platform-fee" className="text-xs font-medium block">Rs per public online booking (0 = no fee)</label>
                <input id="plan-platform-fee" type="number" min="0" step="0.01"
                  className="w-40 rounded-xl border border-[#e8e6e0] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0284c7]/20 focus:border-[#0284c7] transition-all"
                  value={Number(form.platformFeeMinorIN ?? 0) / 100}
                  onChange={e => updateForm("platformFeeMinorIN", Math.max(0, Math.round(Number(e.target.value) * 100)))} />
                <p className="text-[10px] text-[#6b6b80]">GST-inclusive. Charged on website, booking page and widget bookings only, never on dashboard bookings or walk-ins.</p>
              </div>

              {/* Feature Flags grouped */}
              <div className="space-y-4">
                <h3 className="text-xs font-bold text-[#6b6b80] uppercase tracking-wider">Feature Flags</h3>
                {FEATURE_FLAG_GROUPS.map(group => (
                  <div key={group.label} className="space-y-2">
                    <p className="text-xs font-semibold text-[#0f0f1a]">{group.label}</p>
                    <div className="grid grid-cols-2 gap-2">
                      {group.flags.map(f => (
                        <label key={f.key} className="flex items-center gap-3 p-3 rounded-xl border border-[#e8e6e0] cursor-pointer hover:bg-[#f8f7f4] transition-colors">
                          <div
                            className={`w-10 h-5 rounded-full transition-colors relative flex-shrink-0 ${form[f.key as keyof PlanConfig] ? "bg-[#0284c7]" : "bg-[#e8e6e0]"}`}
                            onClick={() => updateForm(f.key as keyof PlanConfig, !form[f.key as keyof PlanConfig])}
                          >
                            <div className={`w-4 h-4 bg-white rounded-full absolute top-0.5 transition-all ${form[f.key as keyof PlanConfig] ? "left-5" : "left-0.5"} shadow-sm`} />
                          </div>
                          <span className="text-sm">{f.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {/* Custom feature bullet points */}
              <div className="space-y-2">
                <h3 className="text-xs font-bold text-[#6b6b80] uppercase tracking-wider">Extra feature points</h3>
                <div className="space-y-1.5">
                  {parsedFeatures(form.features).map((feat, i) => (
                    <div key={i} className="flex items-center gap-2 bg-[#f8f7f4] rounded-xl px-3 py-2">
                      <Check size={12} className="text-[#0284c7] flex-shrink-0" />
                      <span className="text-sm flex-1">{feat}</span>
                      <button onClick={() => removeFeature(i)} className="text-[#6b6b80] hover:text-red-500 transition-colors">
                        <X size={13} />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    className="flex-1 rounded-xl border border-[#e8e6e0] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0284c7]/20 focus:border-[#0284c7] transition-all"
                    placeholder="e.g. White-label reports"
                    value={newFeature}
                    onChange={e => setNewFeature(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && addFeature()}
                  />
                  <button onClick={addFeature}
                    className="px-3 py-2 rounded-xl bg-[#f8f7f4] hover:bg-[#f0ede8] text-[#6b6b80] transition-colors">
                    <Plus size={15} />
                  </button>
                </div>
              </div>

              {error && <p className="text-sm text-red-500 bg-red-50 rounded-xl px-4 py-2">{error}</p>}

              <div className="flex gap-3 pt-2">
                <button onClick={closeEdit}
                  className="flex-1 py-2.5 rounded-xl border border-[#e8e6e0] text-sm font-medium hover:bg-[#f8f7f4] transition-colors">
                  Cancel
                </button>
                <button onClick={save} disabled={saving}
                  className="flex-1 py-2.5 rounded-xl bg-[#0284c7] text-white text-sm font-semibold hover:bg-[#0369a1] disabled:opacity-60 transition-colors">
                  {saving ? "Saving…" : "Save changes"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
