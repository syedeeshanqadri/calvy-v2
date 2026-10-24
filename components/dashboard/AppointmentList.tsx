"use client";
import { useTerms } from "@/components/providers/TermsProvider";
import { useState } from "react";
import { Clock, MoreVertical, Check, X } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { StatusBadge } from "@/components/ui/Badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { formatTime } from "@/lib/utils";
import { useCurrency } from "@/components/providers/CurrencyProvider";

export interface ApptRow {
  id: string;
  clientName: string;
  clientEmail: string;
  serviceName: string;
  staffName: string;
  time: string;
  duration: number;
  price: number;
  status: string;
  color: string;
}

function AppointmentRow({ appt }: { appt: ApptRow }) {
  const [status, setStatus] = useState(appt.status);
  const [menuOpen, setMenuOpen] = useState(false);
  const { formatPrice } = useCurrency();

  return (
    <div className="flex items-center gap-3 py-3.5 border-b border-[#f5f3ef] last:border-0 group hover:bg-[#fafaf8] -mx-2 px-2 rounded-xl transition-colors">
      <Avatar name={appt.clientName} color={appt.color} size="md" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-brand-900 truncate">{appt.clientName}</span>
        </div>
        <div className="flex items-center gap-2 mt-0.5 text-xs text-[#6b6b80]">
          <Clock size={11} />
          <span>{formatTime(appt.time)}</span>
          <span>·</span>
          <span className="truncate">{appt.serviceName}</span>
          <span>·</span>
          <span className="font-semibold text-brand-800">{formatPrice(appt.price)}</span>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <StatusBadge status={status as never} />
        {status === "pending" && (
          <div className="hidden group-hover:flex items-center gap-1">
            <button onClick={() => setStatus("confirmed")} className="w-7 h-7 rounded-lg bg-green-50 text-green-600 flex items-center justify-center hover:bg-green-100 transition-colors" title="Confirm">
              <Check size={13} />
            </button>
            <button onClick={() => setStatus("cancelled")} className="w-7 h-7 rounded-lg bg-red-50 text-red-500 flex items-center justify-center hover:bg-red-100 transition-colors" title="Cancel">
              <X size={13} />
            </button>
          </div>
        )}
        <div className="relative">
          <button onClick={() => setMenuOpen(!menuOpen)} className="w-7 h-7 rounded-lg text-[#6b6b80] flex items-center justify-center hover:bg-[#f0ede8] transition-colors opacity-0 group-hover:opacity-100">
            <MoreVertical size={14} />
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-8 bg-white rounded-xl shadow-xl border border-[#e8e6e0] z-20 py-1 w-40">
              {["View details", "Edit", "Reschedule", "Cancel"].map((action) => (
                <button key={action} onClick={() => setMenuOpen(false)} className={`w-full text-left px-4 py-2 text-sm hover:bg-[#f8f7f4] transition-colors ${action === "Cancel" ? "text-red-500" : "text-brand-800"}`}>{action}</button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function AppointmentList({ appointments }: { appointments: ApptRow[] }) {
  const { t } = useTerms();
  const apptN = t("appointment", { plural: true });
  return (
    <Card>
      <CardHeader>
        <CardTitle>Today&apos;s {t("appointment", { plural: true, cap: true })}</CardTitle>
        <span className="text-xs text-[#6b6b80]">{appointments.length} total</span>
      </CardHeader>
      <CardContent>
        {appointments.length === 0 ? (
          <p className="text-sm text-[#6b6b80] py-6 text-center">No {apptN} today</p>
        ) : (
          appointments.map((appt) => <AppointmentRow key={appt.id} appt={appt} />)
        )}
      </CardContent>
    </Card>
  );
}
