"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { PERMISSION_GROUPS, PRESETS, type Permission } from "@/lib/permissions";

interface Member { id: string; email: string; name: string; roleName: string; permissions: Permission[]; staffId: string | null; status: "invited" | "active" }
interface StaffOpt { id: string; name: string }

const input = "w-full h-10 px-3 rounded-xl bg-white border border-[#e8e6e0] text-sm outline-none focus:border-accent/40";

function MemberForm({ staff, initial, onDone, onClose }: { staff: StaffOpt[]; initial?: Member; onDone: () => void; onClose: () => void }) {
  const [name, setName] = useState(initial?.name ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [roleName, setRoleName] = useState(initial?.roleName ?? "");
  const [staffId, setStaffId] = useState(initial?.staffId ?? "");
  const [perms, setPerms] = useState<Set<Permission>>(new Set(initial?.permissions ?? []));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const toggle = (p: Permission) => setPerms((s) => { const n = new Set(s); if (n.has(p)) n.delete(p); else n.add(p); return n; });

  async function save() {
    setBusy(true); setError("");
    const body = { name, roleName, permissions: [...perms], staffId: staffId || null, ...(initial ? {} : { email }) };
    const res = await fetch(initial ? `/api/team/${initial.id}` : "/api/team", { method: initial ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    setBusy(false);
    if (!res.ok) { setError((await res.json().catch(() => ({}))).error ?? "Could not save."); return; }
    onDone();
  }

  return (
    <div className="space-y-4">
      <label className="block text-sm">Name<input className={input} value={name} onChange={(e) => setName(e.target.value)} /></label>
      {!initial && <label className="block text-sm">Email<input type="email" className={input} value={email} onChange={(e) => setEmail(e.target.value)} /></label>}
      <label className="block text-sm">Role name<input className={input} placeholder="Receptionist, Doctor..." value={roleName} onChange={(e) => setRoleName(e.target.value)} /></label>
      <label className="block text-sm">Linked staff record (optional)
        <select className={input} value={staffId} onChange={(e) => setStaffId(e.target.value)}>
          <option value="">None</option>
          {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </label>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-[#6b6b80]">Presets (pre-tick only):</span>
        {Object.entries(PRESETS).map(([k, p]) => (
          <button key={k} type="button" className="px-2.5 py-1 rounded-full border border-[#e8e6e0] hover:bg-[#f8f7f4]" onClick={() => { setPerms(new Set(p.permissions)); if (!roleName) setRoleName(p.label); }}>{p.label}</button>
        ))}
      </div>
      <fieldset className="space-y-3">
        <legend className="text-sm font-medium mb-1">Access</legend>
        {PERMISSION_GROUPS.map((g) => (
          <div key={g.title}>
            <p className="text-[11px] font-bold uppercase tracking-wider text-[#9a98a8] mb-1">{g.title}</p>
            {g.items.map((i) => (
              <label key={i.key} className="flex items-center gap-2 text-sm py-0.5">
                <input type="checkbox" checked={perms.has(i.key)} onChange={() => toggle(i.key)} data-testid={`perm-${i.key}`} /> {i.label}
              </label>
            ))}
          </div>
        ))}
      </fieldset>
      <p className="text-xs text-[#6b6b80]">Billing, team management, payment settings, WhatsApp credentials and deleting the business always stay with the owner.</p>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
        <Button size="sm" loading={busy} onClick={save} disabled={!name || !roleName || (!initial && !email)} data-testid="member-save">{initial ? "Save" : "Send invite"}</Button>
      </div>
    </div>
  );
}

export function TeamClient({ initial, staff, limit }: { initial: Member[]; staff: StaffOpt[]; limit: number }) {
  const router = useRouter();
  const [modal, setModal] = useState<"add" | Member | null>(null);
  const [msg, setMsg] = useState("");
  const members = initial;
  const refresh = () => { setModal(null); router.refresh(); };

  async function call(url: string, method: string, ok: string) {
    setMsg("");
    const res = await fetch(url, { method });
    setMsg(res.ok ? ok : (await res.json().catch(() => ({}))).error ?? "Something went wrong.");
    if (res.ok) router.refresh();
  }

  return (
    <DashboardLayout title="Team" subtitle="People who can log in to this business">
      <div className="max-w-3xl space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-[#6b6b80]">{members.length} of {limit === -1 ? "unlimited" : limit} team logins used. You are the owner.</p>
          <Button size="sm" onClick={() => setModal("add")} data-testid="add-member">Add member</Button>
        </div>
        {msg && <p role="status" className="text-sm text-[#6b6b80]">{msg}</p>}
        <ul className="space-y-2" data-testid="member-list">
          {members.map((m) => (
            <li key={m.id} className="bg-white rounded-2xl border border-[#e8e6e0] p-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-medium text-sm">{m.name} <span className="text-[#6b6b80] font-normal">· {m.roleName}</span></p>
                <p className="text-xs text-[#6b6b80]">{m.email} · {m.status === "active" ? "Active" : "Invite pending"}</p>
              </div>
              <div className="flex gap-2 text-xs">
                <Button variant="outline" size="sm" onClick={() => setModal(m)}>Edit access</Button>
                {m.status === "invited" && <>
                  <Button variant="outline" size="sm" onClick={() => call(`/api/team/${m.id}/invite`, "POST", "Invite sent again.")}>Resend</Button>
                  <Button variant="outline" size="sm" onClick={() => call(`/api/team/${m.id}/invite`, "DELETE", "Invite revoked.")}>Revoke</Button>
                </>}
                <Button variant="danger" size="sm" onClick={() => { if (confirm(`Remove ${m.name}? They will be signed out immediately.`)) call(`/api/team/${m.id}`, "DELETE", "Member removed."); }}>Remove</Button>
              </div>
            </li>
          ))}
          {members.length === 0 && <li className="text-sm text-[#6b6b80]">No team members yet.</li>}
        </ul>
      </div>
      <Modal isOpen={modal !== null} onClose={() => setModal(null)} title={modal === "add" ? "Add member" : "Edit access"} size="lg">
        {modal !== null && <MemberForm key={modal === "add" ? "add" : modal.id} staff={staff} initial={modal === "add" ? undefined : modal} onDone={refresh} onClose={() => setModal(null)} />}
      </Modal>
    </DashboardLayout>
  );
}
