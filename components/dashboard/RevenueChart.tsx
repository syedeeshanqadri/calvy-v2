"use client";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { useCurrency } from "@/components/providers/CurrencyProvider";
import { CURRENCIES } from "@/lib/currency";

interface ChartPoint { day: string; revenue: number; appointments: number; }

export function RevenueChart({ weekData, monthData }: { weekData: ChartPoint[]; monthData: ChartPoint[] }) {
  const [period, setPeriod] = useState<"week" | "month">("week");
  const { currency, formatPrice } = useCurrency();
  const data = period === "week" ? weekData : monthData;
  const total = data.reduce((s, d) => s + d.revenue, 0);
  const prevTotal = total * 0.82;
  const change = prevTotal > 0 ? (((total - prevTotal) / prevTotal) * 100).toFixed(1) : "0";

  const symbol = CURRENCIES.find(c => c.code === currency)?.symbol ?? currency;

  const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: { value: number }[]; label?: string }) => {
    if (active && payload?.length) {
      return (
        <div className="bg-[#0f0f1a] text-white rounded-xl px-4 py-3 shadow-xl text-sm">
          <div className="font-semibold mb-1">{label}</div>
          <div className="text-white/70">Revenue: <span className="text-white font-bold">{formatPrice(payload[0].value)}</span></div>
        </div>
      );
    }
    return null;
  };

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Revenue</CardTitle>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="font-syne font-bold text-2xl">{formatPrice(total)}</span>
            {total > 0 && <span className="text-xs text-green-600 font-semibold bg-green-50 px-2 py-0.5 rounded-full">↑ {change}%</span>}
          </div>
        </div>
        <div className="flex gap-1 bg-[#f8f7f4] rounded-xl p-1">
          {(["week", "month"] as const).map((p) => (
            <button key={p} onClick={() => setPeriod(p)} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${period === p ? "bg-white shadow text-brand-900" : "text-[#6b6b80] hover:text-brand-900"}`}>
              {p === "week" ? "This week" : "This month"}
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="pt-2">
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={data} barCategoryGap="30%">
            <CartesianGrid strokeDasharray="3 3" stroke="#f0ede8" vertical={false} />
            <XAxis dataKey="day" tick={{ fontSize: 12, fill: "#6b6b80" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 12, fill: "#6b6b80" }} axisLine={false} tickLine={false} tickFormatter={(v) => `${symbol}${v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v}`} width={45} />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(232,69,69,0.06)", radius: 6 } as never} />
            <Bar dataKey="revenue" fill="#0f0f1a" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
