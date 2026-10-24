"use client";
import { useTerms } from "@/components/providers/TermsProvider";
import Link from "next/link";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { Avatar } from "@/components/ui/Avatar";
import { useCurrency } from "@/components/providers/CurrencyProvider";
import { ArrowLeft, Mail, Phone, FileText, Calendar, TrendingUp, Clock, Star } from "lucide-react";
import { cn, formatTime } from "@/lib/utils";

interface Appointment {
  id: string;
  date: string;
  time: string;
  serviceName: string;
  staffName: string | null;
  duration: number;
  price: number;
  status: string;
  paymentStatus: string;
  paymentMode: string;
}

interface ClientData {
  id: string;
  name: string;
  email: string;
  phone: string;
  notes: string;
  totalAppointments: number;
  totalSpent: number;
  lastVisit: string | null;
  createdAt: string;
  appointments: Appointment[];
}

const STATUS_STYLES: Record<string, string> = {
  confirmed:  "bg-blue-50 text-blue-700",
  completed:  "bg-green-50 text-green-700",
  pending:    "bg-amber-50 text-amber-700",
  cancelled:  "bg-red-50 text-red-600",
  "no-show":  "bg-gray-100 text-gray-500",
};

const PAYMENT_STYLES: Record<string, string> = {
  paid:     "bg-green-50 text-green-700",
  unpaid:   "bg-amber-50 text-amber-700",
  refunded: "bg-red-50 text-red-600",
};

function fmt(dateStr: string) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function ClientDetailClient({ client }: { client: ClientData }) {
  const { t } = useTerms();
  const Cli1 = t("client", { cap: true });
  const { formatPrice } = useCurrency();
  const isVip = client.totalSpent > 500;

  const paidTotal = client.appointments
    .filter(a => a.paymentStatus === "paid")
    .reduce((s, a) => s + a.price, 0);

  return (
    <DashboardLayout
      title={client.name}
      subtitle={`${Cli1} since ${fmt(client.createdAt)}`}
    >
      {/* Back link */}
      <Link href="/dashboard/clients" className="inline-flex items-center gap-1.5 text-sm text-[#6b6b80] hover:text-brand-800 mb-6 transition-colors">
        <ArrowLeft size={14} /> Back to {t("client", { plural: true, cap: true })}
      </Link>

      <div className="grid lg:grid-cols-3 gap-6">

        {/* ── Left: profile card ── */}
        <div className="space-y-4">
          <Card>
            <CardContent className="pt-6 flex flex-col items-center text-center">
              <Avatar name={client.name} color="#0284c7" size="xl" />
              <h2 className="font-syne font-bold text-lg mt-4 mb-0.5">{client.name}</h2>
              {isVip && (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-1 rounded-full mb-2">
                  <Star size={10} fill="currentColor" /> VIP {Cli1}
                </span>
              )}
              <div className="space-y-2 w-full mt-4 text-left">
                {client.email && <a href={`mailto:${client.email}`} className="flex items-center gap-2.5 text-sm text-[#3d3d4d] hover:text-accent transition-colors">
                  <Mail size={14} className="text-[#6b6b80] flex-shrink-0" /> {client.email}
                </a>}
                {client.phone && (
                  <a href={`tel:${client.phone}`} className="flex items-center gap-2.5 text-sm text-[#3d3d4d] hover:text-accent transition-colors">
                    <Phone size={14} className="text-[#6b6b80] flex-shrink-0" /> {client.phone}
                  </a>
                )}
                {client.notes && (
                  <div className="flex items-start gap-2.5 text-sm text-[#6b6b80]">
                    <FileText size={14} className="flex-shrink-0 mt-0.5" />
                    <span>{client.notes}</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Stats */}
          <div className="grid grid-cols-2 gap-3">
            <Card className="p-4 text-center">
              <Calendar size={16} className="text-accent mx-auto mb-2" />
              <div className="font-syne font-bold text-xl">{client.totalAppointments}</div>
              <div className="text-[11px] text-[#6b6b80] mt-0.5">Total visits</div>
            </Card>
            <Card className="p-4 text-center">
              <TrendingUp size={16} className="text-green-500 mx-auto mb-2" />
              <div className="font-syne font-bold text-xl">{formatPrice(paidTotal)}</div>
              <div className="text-[11px] text-[#6b6b80] mt-0.5">Total paid</div>
            </Card>
          </div>

          {client.lastVisit && (
            <Card className="p-4">
              <div className="flex items-center gap-2 text-sm text-[#6b6b80]">
                <Clock size={14} />
                <span>Last visit: <span className="font-medium text-[#3d3d4d]">{fmt(client.lastVisit)}</span></span>
              </div>
            </Card>
          )}
        </div>

        {/* ── Right: appointment ledger ── */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>{t("appointment", { cap: true })} Ledger</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {client.appointments.length === 0 ? (
                <p className="text-sm text-[#6b6b80] text-center py-12">No {t("appointment", { plural: true })} yet</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-[#fafaf8] border-b border-[#f0ede8]">
                        {["Date & Time", t("service", { cap: true }), "Staff", "Duration", "Amount", "Status", "Payment"].map(h => (
                          <th key={h} className="text-left text-xs font-semibold text-[#6b6b80] px-4 py-3 first:pl-5 last:pr-5 whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {client.appointments.map(a => (
                        <tr key={a.id} className="border-b border-[#f5f3ef] last:border-0 hover:bg-[#fafaf8] transition-colors">
                          <td className="px-4 py-3 pl-5 whitespace-nowrap">
                            <div className="text-sm font-medium">{fmt(a.date)}</div>
                            <div className="text-xs text-[#6b6b80]">{formatTime(a.time)}</div>
                          </td>
                          <td className="px-4 py-3 text-sm font-medium max-w-[140px] truncate">{a.serviceName}</td>
                          <td className="px-4 py-3 text-sm text-[#6b6b80]">{a.staffName ?? "—"}</td>
                          <td className="px-4 py-3 text-sm text-[#6b6b80] whitespace-nowrap">{a.duration} min</td>
                          <td className="px-4 py-3 text-sm font-semibold whitespace-nowrap">{formatPrice(a.price)}</td>
                          <td className="px-4 py-3">
                            <span className={cn("text-[11px] font-semibold px-2 py-0.5 rounded-full capitalize", STATUS_STYLES[a.status] ?? "bg-gray-100 text-gray-500")}>
                              {a.status}
                            </span>
                          </td>
                          <td className="px-4 py-3 pr-5">
                            <span className={cn("text-[11px] font-semibold px-2 py-0.5 rounded-full capitalize", PAYMENT_STYLES[a.paymentStatus] ?? "bg-gray-100 text-gray-500")}>
                              {a.paymentStatus}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
