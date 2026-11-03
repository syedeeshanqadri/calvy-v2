"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Card } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { PhotoField } from "@/components/dashboard/PhotoField";
import { SITE_CAPS } from "@/lib/siteSections";
import { Avatar } from "@/components/ui/Avatar";
import { Plus, Mail, Phone, Pencil, Trash2, Crown, AlertTriangle } from "lucide-react";
import Link from "next/link";
import { useTerms } from "@/components/providers/TermsProvider";
import { staffRoleChoice } from "@/lib/terms";

interface StaffRow {
  id: string;
  name: string;
  role: string;
  email: string;
  phone: string;
  color: string;
  meetingUrl: string;
  photoUrl: string;
  bio: string;
  specialisation: string;
  isActive: boolean;
}

const COLORS = ["#0284c7", "#3b82f6", "#22c55e", "#8b5cf6", "#f59e0b", "#ec4899", "#14b8a6", "#f97316"];

interface Props {
  staff: StaffRow[];
  currentPlan: string;
  maxStaff: number;
}

export function StaffClient({ staff, currentPlan, maxStaff }: Props) {
  const router = useRouter();
  const { t, pack, source } = useTerms();
  const stf1 = "staff";
  const Stf1 = "Staff";
  const StfN = "Staff";
  const [roleOther, setRoleOther] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editStaff, setEditStaff] = useState<StaffRow | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ name: "", role: pack.staffRoles[0], email: "", phone: "", color: "#0284c7", meetingUrl: "", photoUrl: "", bio: "", specialisation: "" });

  const atLimit = maxStaff !== -1 && staff.length >= maxStaff;

  function openAdd() {
    setEditStaff(null);
    setForm({ name: "", role: pack.staffRoles[0], email: "", phone: "", color: "#0284c7", meetingUrl: "", photoUrl: "", bio: "", specialisation: "" });
    setRoleOther(false);
    setError("");
    setShowModal(true);
  }

  function openEdit(s: StaffRow) {
    setEditStaff(s);
    setForm({ name: s.name, role: s.role, email: s.email, phone: s.phone, color: s.color, meetingUrl: s.meetingUrl, photoUrl: s.photoUrl, bio: s.bio, specialisation: s.specialisation });
    setRoleOther(false);
    setError("");
    setShowModal(true);
  }

  async function submit() {
    if (!form.name || !form.email) { setError("Name and email are required"); return; }
    if (!form.role.trim()) { setError("Role is required"); return; }
    setLoading(true);
    setError("");
    try {
      const url = editStaff ? `/api/staff/${editStaff.id}` : "/api/staff";
      const method = editStaff ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save");
      setShowModal(false);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function toggleActive(s: StaffRow) {
    await fetch(`/api/staff/${s.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !s.isActive }),
    });
    router.refresh();
  }

  async function deleteStaff(s: StaffRow) {
    if (!confirm(`Remove ${s.name} from your team?`)) return;
    await fetch(`/api/staff/${s.id}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <DashboardLayout title={StfN} subtitle={`${staff.length} staff`}>
      {/* Plan usage bar */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-white border border-[#e8e6e0] rounded-xl px-4 py-2 text-sm">
            <span className="text-[#6b6b80]">{StfN} used:</span>
            <span className="font-semibold">{staff.length}</span>
            <span className="text-[#6b6b80]">/</span>
            <span className="font-semibold">{maxStaff === -1 ? "∞" : maxStaff}</span>
            <span className="text-xs text-[#6b6b80] ml-1 capitalize">({currentPlan})</span>
          </div>
          {atLimit && (
            <Link href="/dashboard/billing" className="flex items-center gap-1.5 text-xs text-accent font-medium hover:underline">
              <Crown size={13} /> Upgrade for more
            </Link>
          )}
        </div>
        <Button size="sm" className="gap-1.5" onClick={openAdd} disabled={atLimit}>
          <Plus size={14} /> Add {stf1}
        </Button>
      </div>

      {atLimit && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 mb-4 text-sm">
          <AlertTriangle size={15} className="flex-shrink-0" />
          <span>You&apos;ve reached the {stf1} limit for your <strong className="capitalize">{currentPlan}</strong> plan.</span>
          <Link href="/dashboard/billing" className="ml-auto font-semibold underline underline-offset-2">Upgrade</Link>
        </div>
      )}

      {/* Staff grid */}
      {staff.length === 0 ? (
        <Card className="p-16 text-center">
          <p className="text-[#6b6b80] text-sm mb-4">No staff yet. Add your first {stf1}.</p>
          <Button size="sm" className="gap-1.5 mx-auto" onClick={openAdd}>
            <Plus size={14} /> Add {stf1}
          </Button>
        </Card>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {staff.map((s, i) => (
            <Card key={s.id} className="p-5">
              <div className="flex items-start justify-between mb-4">
                <div className="relative">
                  <Avatar name={s.name} color={COLORS[i % COLORS.length]} size="lg" />
                  {!s.isActive && (
                    <span className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-gray-300 border-2 border-white" />
                  )}
                </div>
                <div className="flex gap-1">
                  <button onClick={() => openEdit(s)} className="p-1.5 rounded-lg text-[#6b6b80] hover:bg-[#f8f7f4] hover:text-brand-800 transition-colors">
                    <Pencil size={13} />
                  </button>
                  <button onClick={() => deleteStaff(s)} className="p-1.5 rounded-lg text-[#6b6b80] hover:bg-red-50 hover:text-red-500 transition-colors">
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>

              <h3 className="font-semibold text-sm mb-0.5">{s.name}</h3>
              <p className="text-xs text-accent font-medium mb-1">{s.role}</p>
              <p className="text-xs text-[#6b6b80] mb-3 truncate">{s.email}</p>

              <div className="flex gap-2 mb-3">
                <a href={`mailto:${s.email}`} className="flex-1 flex items-center justify-center gap-1 h-8 rounded-lg bg-[#f8f7f4] hover:bg-[#f0ede8] text-xs text-[#6b6b80] transition-colors">
                  <Mail size={11} /> Email
                </a>
                {s.phone && (
                  <a href={`tel:${s.phone}`} className="flex-1 flex items-center justify-center gap-1 h-8 rounded-lg bg-[#f8f7f4] hover:bg-[#f0ede8] text-xs text-[#6b6b80] transition-colors">
                    <Phone size={11} /> Call
                  </a>
                )}
              </div>

              <button
                onClick={() => toggleActive(s)}
                className={`w-full h-7 rounded-lg text-xs font-medium transition-colors ${s.isActive ? "bg-green-50 text-green-700 hover:bg-green-100" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}
              >
                {s.isActive ? "Active" : "Inactive"}
              </button>
            </Card>
          ))}
        </div>
      )}

      {/* Add/Edit Modal */}
      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editStaff ? `Edit ${Stf1}` : `Add ${Stf1}`}>
        <div className="space-y-4">
          {error && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 text-red-600 text-sm">
              <AlertTriangle size={14} /> {error}
            </div>
          )}
          <Input label="Full name" placeholder="e.g. Jane Smith" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <div>
            <label className="block text-sm font-medium text-brand-700 mb-1.5">Role</label>
            <select
              value={roleOther ? "Other" : staffRoleChoice(source, form.role).select}
              onChange={(e) => {
                if (e.target.value === "Other") { setRoleOther(true); setForm({ ...form, role: "" }); }
                else { setRoleOther(false); setForm({ ...form, role: e.target.value }); }
              }}
              className="w-full h-10 px-3 rounded-xl border border-[#e8e6e0] bg-white text-sm outline-none focus:border-accent/40 transition-all"
            >
              {pack.staffRoles.map((r) => <option key={r} value={r}>{r}</option>)}
              <option value="Other">Other</option>
            </select>
            {(roleOther || staffRoleChoice(source, form.role).select === "Other") && (
              <Input className="mt-2" aria-label="Other role" placeholder="Type the role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} />
            )}
          </div>
          <Input label="Email" type="email" placeholder="jane@example.com" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <Input label="Phone (optional)" placeholder="+1 555 000 0000" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <div>
            <Input label="Online meeting link (optional)" type="url" placeholder="https://meet.google.com/… or Zoom, Teams" value={form.meetingUrl} onChange={(e) => setForm({ ...form, meetingUrl: e.target.value })} />
            <p className="text-xs text-[#6b6b80] mt-1">Used for online consultations with this person. Customers only see it after they book.</p>
          </div>
          <div className="border-t border-[#f0ede8] pt-3 space-y-3">
            <p className="text-xs font-semibold text-[#6b6b80] uppercase tracking-wider">Shown on your website team card</p>
            <PhotoField label="Photo (optional)" purpose="team" square value={form.photoUrl} onChange={(url) => setForm({ ...form, photoUrl: url })} />
            <Input label="Specialisation (optional)" maxLength={SITE_CAPS.staffSpecialisation} placeholder="e.g. Colour & balayage" value={form.specialisation} onChange={(e) => setForm({ ...form, specialisation: e.target.value })} />
            <div>
              <label htmlFor="staff-bio" className="block text-sm font-medium text-brand-700 mb-1.5">Short bio (optional)</label>
              <textarea id="staff-bio" rows={3} maxLength={SITE_CAPS.staffBio} value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })}
                className="w-full rounded-xl border border-[#e8e6e0] px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent" />
              <p className="text-xs text-[#6b6b80] mt-1">{form.bio.length}/{SITE_CAPS.staffBio}</p>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-brand-700 mb-1.5">Color</label>
            <div className="flex gap-2 flex-wrap">
              {COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setForm({ ...form, color: c })}
                  className={`w-7 h-7 rounded-full transition-all ${form.color === c ? "ring-2 ring-offset-2 ring-gray-400 scale-110" : ""}`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <Button variant="ghost" className="flex-1" onClick={() => setShowModal(false)}>Cancel</Button>
            <Button className="flex-1" onClick={submit} disabled={loading}>
              {loading ? "Saving…" : editStaff ? "Save changes" : `Add ${stf1}`}
            </Button>
          </div>
        </div>
      </Modal>
    </DashboardLayout>
  );
}
