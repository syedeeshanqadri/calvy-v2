"use client";
import { useState, useMemo } from "react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Plus, Pencil, Trash2, X, TrendingDown, TrendingUp, DollarSign, Tag } from "lucide-react";
import { useCurrency } from "@/components/providers/CurrencyProvider";
import { CURRENCIES } from "@/lib/currency";

const CATEGORIES = ["Rent", "Utilities", "Staff / Salaries", "Supplies", "Marketing", "Software", "Equipment", "Other"];

const CAT_COLORS: Record<string, string> = {
  "Rent": "#f59e0b",
  "Utilities": "#3b82f6",
  "Staff / Salaries": "#8b5cf6",
  "Supplies": "#10b981",
  "Marketing": "#f43f5e",
  "Software": "#0284c7",
  "Equipment": "#6366f1",
  "Other": "#6b7280",
};

interface Expense {
  id: string;
  amount: number;
  category: string;
  description: string | null;
  date: string;
}

interface Props {
  initialExpenses: Expense[];
  monthRevenue: number;
}

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function formatDate(iso: string) {
  const d = new Date(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export function ExpensesClient({ initialExpenses, monthRevenue }: Props) {
  const { formatPrice, currency } = useCurrency();
  const currencySymbol = CURRENCIES.find(c => c.code === currency)?.symbol ?? currency;
  const [expenses, setExpenses] = useState<Expense[]>(initialExpenses);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [filterMonth, setFilterMonth] = useState("all");

  // Form state
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Month filter options from expense dates
  const monthOptions = useMemo(() => {
    const set = new Set<string>();
    expenses.forEach(e => {
      const d = new Date(e.date);
      set.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    });
    return Array.from(set).sort().reverse();
  }, [expenses]);

  const filtered = useMemo(() => {
    if (filterMonth === "all") return expenses;
    return expenses.filter(e => {
      const d = new Date(e.date);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}` === filterMonth;
    });
  }, [expenses, filterMonth]);

  const totalExpenses = filtered.reduce((s, e) => s + e.amount, 0);

  const now = new Date();
  const monthExpenses = expenses
    .filter(e => {
      const d = new Date(e.date);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    })
    .reduce((s, e) => s + e.amount, 0);
  const monthProfit = monthRevenue - monthExpenses;

  // Category breakdown for filtered
  const byCategory = useMemo(() => {
    const map: Record<string, number> = {};
    filtered.forEach(e => { map[e.category] = (map[e.category] ?? 0) + e.amount; });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [filtered]);

  function openAdd() {
    setEditing(null);
    setAmount("");
    setCategory(CATEGORIES[0]);
    setDescription("");
    setDate(new Date().toISOString().slice(0, 10));
    setError("");
    setShowForm(true);
  }

  function openEdit(e: Expense) {
    setEditing(e);
    setAmount(String(e.amount));
    setCategory(e.category);
    setDescription(e.description ?? "");
    setDate(e.date.slice(0, 10));
    setError("");
    setShowForm(true);
  }

  async function save() {
    if (!amount || parseFloat(amount) <= 0) { setError("Enter a valid amount"); return; }
    setSaving(true);
    setError("");
    try {
      if (editing) {
        const res = await fetch(`/api/expenses/${editing.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ amount: parseFloat(amount), category, description, date }),
        });
        const updated = await res.json();
        setExpenses(prev => prev.map(e => e.id === editing.id ? updated : e));
      } else {
        const res = await fetch("/api/expenses", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ amount: parseFloat(amount), category, description, date }),
        });
        const created = await res.json();
        setExpenses(prev => [created, ...prev]);
      }
      setShowForm(false);
    } catch {
      setError("Failed to save. Try again.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    setDeleting(id);
    try {
      await fetch(`/api/expenses/${id}`, { method: "DELETE" });
      setExpenses(prev => prev.filter(e => e.id !== id));
    } finally {
      setDeleting(null);
    }
  }

  return (
    <DashboardLayout title="Expenses" subtitle="Track your business costs and profitability">
      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-2xl border border-[#e8e6e0] p-4">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-7 h-7 rounded-lg bg-red-50 flex items-center justify-center">
              <TrendingDown size={14} className="text-red-500" />
            </div>
            <p className="text-xs text-[#6b6b80]">This month expenses</p>
          </div>
          <p className="text-xl font-bold text-[#0f0f1a]">{formatPrice(monthExpenses)}</p>
        </div>
        <div className="bg-white rounded-2xl border border-[#e8e6e0] p-4">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-7 h-7 rounded-lg bg-green-50 flex items-center justify-center">
              <DollarSign size={14} className="text-green-600" />
            </div>
            <p className="text-xs text-[#6b6b80]">This month revenue</p>
          </div>
          <p className="text-xl font-bold text-[#0f0f1a]">{formatPrice(monthRevenue)}</p>
        </div>
        <div className={`col-span-2 lg:col-span-1 bg-white rounded-2xl border p-4 ${monthProfit >= 0 ? "border-green-200 bg-green-50/30" : "border-red-200 bg-red-50/30"}`}>
          <div className="flex items-center gap-2 mb-1">
            <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${monthProfit >= 0 ? "bg-green-100" : "bg-red-100"}`}>
              <TrendingUp size={14} className={monthProfit >= 0 ? "text-green-600" : "text-red-500"} />
            </div>
            <p className="text-xs text-[#6b6b80]">This month profit</p>
          </div>
          <p className={`text-xl font-bold ${monthProfit >= 0 ? "text-green-700" : "text-red-600"}`}>{formatPrice(monthProfit)}</p>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Main expenses list */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-2xl border border-[#e8e6e0]">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#e8e6e0]">
              <div className="flex items-center gap-3">
                <h2 className="font-syne font-bold text-sm">Expenses</h2>
                {filtered.length > 0 && (
                  <span className="text-xs text-[#6b6b80] bg-[#f8f7f4] px-2 py-0.5 rounded-full">
                    {formatPrice(totalExpenses)}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={filterMonth}
                  onChange={e => setFilterMonth(e.target.value)}
                  className="text-xs border border-[#e8e6e0] rounded-lg px-2 py-1.5 text-[#6b6b80] focus:outline-none focus:ring-1 focus:ring-sky-300"
                >
                  <option value="all">All time</option>
                  {monthOptions.map(m => {
                    const [y, mo] = m.split("-");
                    return <option key={m} value={m}>{MONTHS[parseInt(mo) - 1]} {y}</option>;
                  })}
                </select>
                <button
                  onClick={openAdd}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-accent text-white text-xs font-semibold rounded-xl hover:bg-accent-hover transition-colors"
                >
                  <Plus size={13} />
                  Add
                </button>
              </div>
            </div>

            {filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="w-12 h-12 rounded-2xl bg-[#f8f7f4] flex items-center justify-center mb-3">
                  <TrendingDown size={22} className="text-[#c5c3bf]" />
                </div>
                <p className="text-sm font-medium text-[#3d3d4d]">No expenses yet</p>
                <p className="text-xs text-[#6b6b80] mt-1">Add your first expense to start tracking costs</p>
                <button onClick={openAdd} className="mt-4 flex items-center gap-1.5 px-4 py-2 bg-accent text-white text-xs font-semibold rounded-xl hover:bg-accent-hover transition-colors">
                  <Plus size={13} /> Add expense
                </button>
              </div>
            ) : (
              <div className="divide-y divide-[#f0ede8]">
                {filtered.map(e => (
                  <div key={e.id} className="flex items-center gap-3 px-5 py-3.5 hover:bg-[#fafaf9] transition-colors group">
                    <div className="w-8 h-8 rounded-xl flex-shrink-0 flex items-center justify-center" style={{ background: `${CAT_COLORS[e.category] ?? "#6b7280"}18` }}>
                      <Tag size={13} style={{ color: CAT_COLORS[e.category] ?? "#6b7280" }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[#0f0f1a] truncate">{e.description || e.category}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] px-1.5 py-0.5 rounded-md font-medium" style={{ background: `${CAT_COLORS[e.category] ?? "#6b7280"}15`, color: CAT_COLORS[e.category] ?? "#6b7280" }}>
                          {e.category}
                        </span>
                        <span className="text-xs text-[#6b6b80]">{formatDate(e.date)}</span>
                      </div>
                    </div>
                    <p className="text-sm font-bold text-[#0f0f1a] flex-shrink-0">{formatPrice(e.amount)}</p>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => openEdit(e)} className="p-1.5 rounded-lg text-[#6b6b80] hover:bg-[#f0ede8] hover:text-[#0f0f1a] transition-colors">
                        <Pencil size={13} />
                      </button>
                      <button
                        onClick={() => remove(e.id)}
                        disabled={deleting === e.id}
                        className="p-1.5 rounded-lg text-[#6b6b80] hover:bg-red-50 hover:text-red-500 transition-colors disabled:opacity-40"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Category breakdown */}
        <div className="bg-white rounded-2xl border border-[#e8e6e0] h-fit">
          <div className="px-5 py-4 border-b border-[#e8e6e0]">
            <h2 className="font-syne font-bold text-sm">By category</h2>
          </div>
          {byCategory.length === 0 ? (
            <p className="text-xs text-[#6b6b80] text-center py-10">No data</p>
          ) : (
            <div className="p-4 space-y-3">
              {byCategory.map(([cat, total]) => (
                <div key={cat}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ background: CAT_COLORS[cat] ?? "#6b7280" }} />
                      <span className="text-xs text-[#3d3d4d] font-medium">{cat}</span>
                    </div>
                    <span className="text-xs font-bold text-[#0f0f1a]">{formatPrice(total)}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-[#f0ede8] overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${(total / totalExpenses) * 100}%`, background: CAT_COLORS[cat] ?? "#6b7280" }}
                    />
                  </div>
                </div>
              ))}
              <div className="pt-2 border-t border-[#f0ede8] flex justify-between">
                <span className="text-xs text-[#6b6b80]">Total</span>
                <span className="text-xs font-bold text-[#0f0f1a]">{formatPrice(totalExpenses)}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Add / Edit modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowForm(false)} />
          <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-syne font-bold text-base">{editing ? "Edit expense" : "Add expense"}</h3>
              <button onClick={() => setShowForm(false)} className="p-1.5 rounded-xl text-[#6b6b80] hover:bg-[#f8f7f4] transition-colors"><X size={16} /></button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-[#6b6b80] block mb-1">Amount ({currencySymbol}) *</label>
                <input
                  type="number"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  placeholder="0.00"
                  min="0"
                  step="0.01"
                  className="w-full rounded-xl border border-[#e8e6e0] px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-200 focus:border-sky-400"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-[#6b6b80] block mb-1">Date *</label>
                <input
                  type="date"
                  value={date}
                  onChange={e => setDate(e.target.value)}
                  className="w-full rounded-xl border border-[#e8e6e0] px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-200 focus:border-sky-400"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-[#6b6b80] block mb-1">Category *</label>
              <div className="grid grid-cols-2 gap-2">
                {CATEGORIES.map(c => (
                  <button
                    key={c}
                    onClick={() => setCategory(c)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-medium transition-all text-left ${
                      category === c ? "border-sky-300 bg-sky-50 text-sky-700" : "border-[#e8e6e0] text-[#6b6b80] hover:bg-[#f8f7f4]"
                    }`}
                  >
                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: CAT_COLORS[c] ?? "#6b7280" }} />
                    {c}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-[#6b6b80] block mb-1">Description <span className="font-normal">(optional)</span></label>
              <input
                type="text"
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="e.g. Monthly office rent"
                className="w-full rounded-xl border border-[#e8e6e0] px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-200 focus:border-sky-400"
              />
            </div>

            {error && <p className="text-xs text-red-600 bg-red-50 rounded-xl px-3 py-2">{error}</p>}

            <div className="flex gap-2 pt-1">
              <button onClick={() => setShowForm(false)} className="flex-1 px-4 py-2.5 border border-[#e8e6e0] rounded-xl text-sm font-medium text-[#6b6b80] hover:bg-[#f8f7f4] transition-colors">
                Cancel
              </button>
              <button
                onClick={save}
                disabled={saving}
                className="flex-1 px-4 py-2.5 bg-accent text-white rounded-xl text-sm font-semibold hover:bg-accent-hover transition-colors disabled:opacity-50"
              >
                {saving ? "Saving…" : editing ? "Save changes" : "Add expense"}
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
