"use client";
import { useTerms } from "@/components/providers/TermsProvider";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, UserPlus, Link2, Send, CalendarPlus, Download } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { NewAppointmentModal, type ServiceOption, type StaffOption } from "@/components/dashboard/AppointmentModals";

const ACTIONS = [
  { icon: Plus, label: "New Booking", color: "#fef3c7", action: "booking" },
  { icon: UserPlus, label: "Add Client", color: "#dcfce7", action: "client" },
  { icon: Link2, label: "Copy Link", color: "#dbeafe", action: "link" },
  { icon: Send, label: "Send Reminder", color: "#f3e8ff", action: "reminder" },
  { icon: CalendarPlus, label: "Block Time", color: "#fee2e2", action: "block" },
  { icon: Download, label: "Export", color: "#f0fdf4", action: "export" },
];

export function QuickActions({ services, staff, businessSlug }: { services: ServiceOption[]; staff: StaffOption[]; businessSlug?: string }) {
  const { t } = useTerms();
  const router = useRouter();
  const cli1 = t("client");
  const Cli1 = t("client", { cap: true });
  const [modal, setModal] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [client, setClient] = useState({ firstName: "", lastName: "", email: "", phone: "", notes: "" });

  const handleAction = (action: string) => {
    if (action === "link") {
      const url = businessSlug ? `${window.location.origin}/b/${businessSlug}` : window.location.origin;
      navigator.clipboard.writeText(url).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
      return;
    }
    setError("");
    setModal(action);
  };

  const closeModal = () => { setModal(null); setError(""); };

  const submitClient = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: `${client.firstName} ${client.lastName}`.trim(), email: client.email, phone: client.phone, notes: client.notes }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Failed to add ${cli1}`);
      setClient({ firstName: "", lastName: "", email: "", phone: "", notes: "" });
      closeModal();
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Card>
        <CardHeader><CardTitle>Quick Actions</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-2">
            {ACTIONS.map((action) => (
              <button key={action.label} onClick={() => handleAction(action.action)} className="flex flex-col items-center gap-2 p-3 rounded-xl bg-[#f8f7f4] hover:bg-white border border-transparent hover:border-[#e8e6e0] hover:shadow-sm transition-all duration-200 group">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center transition-transform group-hover:scale-110" style={{ background: action.color }}>
                  <action.icon size={16} className="text-brand-800 opacity-70" />
                </div>
                <span className="text-[11px] font-medium text-center leading-tight">{action.label === "Copy Link" && copied ? "Copied!" : action.action === "client" ? `Add ${Cli1}` : action.label}</span>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <NewAppointmentModal isOpen={modal === "booking"} onClose={closeModal} services={services} staff={staff} onCreated={() => router.refresh()} />

      {/* Add Client Modal */}
      <Modal isOpen={modal === "client"} onClose={closeModal} title={`Add New ${Cli1}`} size="md">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Input label="First name" placeholder="John" value={client.firstName} onChange={e => setClient({ ...client, firstName: e.target.value })} />
            <Input label="Last name" placeholder="Doe" value={client.lastName} onChange={e => setClient({ ...client, lastName: e.target.value })} />
          </div>
          <Input label="Email" type="email" placeholder="john@email.com" value={client.email} onChange={e => setClient({ ...client, email: e.target.value })} />
          <Input
            label="Phone"
            type="tel"
            placeholder="+1 5550000"
            value={client.phone}
            onChange={e => setClient({ ...client, phone: e.target.value })}
            onKeyDown={e => {
              const allowed = ["Backspace","Delete","ArrowLeft","ArrowRight","Tab","Enter","+"];
              if (!allowed.includes(e.key) && !/^\d$/.test(e.key)) e.preventDefault();
            }}
          />
          <Input label="Notes (optional)" placeholder="Any important info..." value={client.notes} onChange={e => setClient({ ...client, notes: e.target.value })} />
          {error && <p className="text-sm text-red-500">{error}</p>}
          <div className="flex gap-3 pt-2">
            <Button variant="outline" onClick={closeModal} className="flex-1 justify-center">Cancel</Button>
            <Button onClick={submitClient} disabled={loading || !client.firstName || (!client.email && !client.phone)} className="flex-1 justify-center">
              {loading ? "Saving..." : `Add ${Cli1}`}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
