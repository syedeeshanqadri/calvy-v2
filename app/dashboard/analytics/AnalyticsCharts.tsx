"use client";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";

const COLORS_PIE = ["#0284c7", "#3b82f6", "#22c55e", "#8b5cf6", "#f59e0b"];

export function RevenueTrend({ data: monthlyRevenue, formatPrice }: { data: { day: string; revenue: number; expenses: number; profit: number }[]; formatPrice: (n: number) => string }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
                <LineChart data={monthlyRevenue}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0ede8" vertical={false} />
                  <XAxis dataKey="day" tick={{ fontSize: 11, fill: "#6b6b80" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "#6b6b80" }} axisLine={false} tickLine={false} tickFormatter={v => `$${Math.round((v as number) / 1000)}k`} width={38} />
                  <Tooltip
                    formatter={(v: number, name: string) => [formatPrice(v), name.charAt(0).toUpperCase() + name.slice(1)]}
                    contentStyle={{ borderRadius: 12, border: "1px solid #e8e6e0", boxShadow: "0 8px 24px rgba(0,0,0,0.1)" }}
                  />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                  <Line type="monotone" dataKey="revenue" stroke="#0284c7" strokeWidth={2.5} dot={false} activeDot={{ r: 5 }} />
                  <Line type="monotone" dataKey="expenses" stroke="#f43f5e" strokeWidth={2} dot={false} activeDot={{ r: 5 }} strokeDasharray="4 2" />
                  <Line type="monotone" dataKey="profit" stroke="#22c55e" strokeWidth={2.5} dot={false} activeDot={{ r: 5 }} />
                </LineChart>
              </ResponsiveContainer>
  );
}

export function WeekBars({ data: weeklyAppointments }: { data: { day: string; appointments: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={weeklyAppointments} barCategoryGap="35%">
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0ede8" vertical={false} />
                    <XAxis dataKey="day" tick={{ fontSize: 12, fill: "#6b6b80" }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 12, fill: "#6b6b80" }} axisLine={false} tickLine={false} width={25} />
                    <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #e8e6e0" }} />
                    <Bar dataKey="appointments" fill="#0284c7" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
  );
}

export function ServicePie({ data: serviceDist }: { data: { name: string; value: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={150}>
                    <PieChart>
                      <Pie data={serviceDist} cx="50%" cy="50%" innerRadius={40} outerRadius={65} paddingAngle={3} dataKey="value">
                        {serviceDist.map((_, i) => <Cell key={i} fill={COLORS_PIE[i % COLORS_PIE.length]} />)}
                      </Pie>
                      <Tooltip formatter={(v) => [`${v}%`, ""]} contentStyle={{ borderRadius: 12 }} />
                    </PieChart>
                  </ResponsiveContainer>
  );
}
