"use client";
import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { Avatar } from "@/components/ui/Avatar";
import { useCurrency } from "@/components/providers/CurrencyProvider";
import { cn, formatTime } from "@/lib/utils";
import { readJson } from "@/lib/fetchJson";
import { useTerms } from "@/components/providers/TermsProvider";
import { Check, Clock, DollarSign, Trash2 } from "lucide-react";

export interface ServiceOption { id: string; name: string; duration: number; price: number; }
export interface StaffOption { id: string; name: string; }

export interface ApptDetail {
  id: string;
  clientName: string;
  clientEmail: string;
  serviceName: string;
  staffId: string | null;
  staffName: string;
  date: string; // YYYY-MM-DD in the business timezone
  time: string; // HH:MM
  duration: number;
  price: number;
  status: string;
  paymentStatus: string;
  paymentMode: string;
  color: string;
  notes?: string;
}

interface SlotTime { time: string; staffIds: string[]; spots: number; }

/** A dropped connection says "Failed to fetch"; say what it means. */
function friendly(e: unknown): string {
  const m = (e as Error)?.message ?? "";
  return /failed to fetch|networkerror|load failed/i.test(m) ? "Couldn't reach the server. Check your connection and try again." : m || "Something went wrong.";
}

const selectCls =
  "w-full h-10 rounded-xl border border-[#e8e6e0] px-3 text-sm bg-white focus:outline-none focus:border-accent/40 transition-all";

/** Free start times from the availability engine for the owner pickers. */
function useSlots(enabled: boolean, params: { date: string; serviceIds?: string[]; staffId?: string; excludeId?: string }) {
  const [state, setState] = useState<{ times: SlotTime[]; loading: boolean; error: string }>({ times: [], loading: false, error: "" });
  const key = JSON.stringify(params);

  useEffect(() => {
    if (!enabled || !params.date || (!params.excludeId && !params.serviceIds?.length)) {
      setState({ times: [], loading: false, error: "" });
      return;
    }
    const ctrl = new AbortController();
    const qs = new URLSearchParams({ date: params.date });
    if (params.serviceIds?.length) qs.set("serviceIds", params.serviceIds.join(","));
    if (params.staffId) qs.set("staffId", params.staffId);
    if (params.excludeId) qs.set("excludeId", params.excludeId);
    setState((s) => ({ ...s, loading: true, error: "" }));
    fetch(`/api/appointments/slots?${qs}`, { signal: ctrl.signal })
      .then(async (res) => {
        const data = await readJson(res);
        if (!res.ok) throw new Error(data.error || "Could not load times");
        setState({ times: (data.times ?? []) as SlotTime[], loading: false, error: "" });
      })
      .catch((e: Error) => {
        if (e.name !== "AbortError") setState({ times: [], loading: false, error: e.message });
      });
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, key]);

  return state;
}

function TimeChips({
  times, loading, error, value, onChange, emptyText,
}: {
  times: SlotTime[]; loading: boolean; error: string; value: string; onChange: (t: string) => void; emptyText: string;
}) {
  if (loading) return <p className="text-sm text-[#6b6b80]">Loading times…</p>;
  if (error) return <p className="text-sm text-red-500">{error}</p>;
  if (times.length === 0) return <p className="text-sm text-[#6b6b80]">{emptyText}</p>;
  return (
    <div className="grid grid-cols-4 sm:grid-cols-5 gap-1.5 max-h-40 overflow-y-auto" role="radiogroup" aria-label="Available times">
      {times.map((t) => (
        <button
          key={t.time}
          type="button"
          role="radio"
          aria-checked={value === t.time}
          onClick={() => onChange(t.time)}
          className={cn(
            "h-10 rounded-lg border text-xs font-medium transition-colors",
            value === t.time ? "bg-accent text-white border-accent" : "bg-white border-[#e8e6e0] hover:border-accent/50",
          )}
        >
          {formatTime(t.time)}
        </button>
      ))}
    </div>
  );
}

/* ── New appointment (walk-in or phone booking) ───────────────────────── */

export interface NewAppointmentInitial { date?: string; time?: string; staffId?: string; }

export function NewAppointmentModal({
  isOpen, onClose, services, staff, initial, onCreated,
}: {
  isOpen: boolean;
  onClose: () => void;
  services: ServiceOption[];
  staff: StaffOption[];
  initial?: NewAppointmentInitial;
  onCreated: () => void;
}) {
  const { t } = useTerms();
  const appt1 = t("appointment");
  const Appt1 = t("appointment", { cap: true });
  const apptN = t("appointment", { plural: true });
  const cli1 = t("client");
  const Cli1 = t("client", { cap: true });
  const svc1 = t("service");
  const Svc1 = t("service", { cap: true });
  const SvcN = t("service", { plural: true, cap: true });
  const Stf1 = t("staff", { cap: true });
  const { formatPrice } = useCurrency();
  const today = new Date().toISOString().split("T")[0];
  const blank = () => ({
    clientName: "", clientPhone: "", clientEmail: "", serviceIds: [] as string[],
    staffId: initial?.staffId ?? "", date: initial?.date ?? today, time: initial?.time ?? "", notes: "",
  });
  const [form, setForm] = useState(blank);
  const [allowOverlap, setAllowOverlap] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Re-seed the form each time the modal opens (the calendar passes the clicked slot).
  useEffect(() => {
    if (isOpen) { setForm(blank()); setAllowOverlap(false); setError(""); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, initial?.date, initial?.time, initial?.staffId]);

  const slots = useSlots(isOpen, { date: form.date, serviceIds: form.serviceIds, staffId: form.staffId || undefined });

  // Drop a chosen time that the engine no longer offers (service/staff/date changed).
  useEffect(() => {
    if (slots.loading || allowOverlap) return;
    if (form.time && !slots.times.some((t) => t.time === form.time)) setForm((f) => ({ ...f, time: "" }));
  }, [slots.times, slots.loading, allowOverlap, form.time]);

  const selected = services.filter((s) => form.serviceIds.includes(s.id));
  const contactOk = !!form.clientPhone.trim() || !!form.clientEmail.trim();

  async function submit() {
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, ...(allowOverlap && { allowOverlap: true }) }),
      });
      const data = await readJson(res);
      if (!res.ok) throw new Error(data.error || `Failed to create ${appt1}`);
      onClose();
      onCreated();
    } catch (e) {
      setError(friendly(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`New ${Appt1}`} size="md">
      <div className="space-y-4">
        <Input label={`${Cli1} name`} placeholder="Jane Smith" value={form.clientName} onChange={(e) => setForm({ ...form, clientName: e.target.value })} />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input label="Phone" type="tel" placeholder="+91 98765 43210" value={form.clientPhone} onChange={(e) => setForm({ ...form, clientPhone: e.target.value })} />
          <Input label="Email" type="email" placeholder="jane@email.com" value={form.clientEmail} onChange={(e) => setForm({ ...form, clientEmail: e.target.value })} />
        </div>
        <p className="text-xs text-[#6b6b80] -mt-2">Phone or email is required. A confirmation is emailed when an email is given.</p>

        <div>
          <p className="text-sm font-medium text-brand-800 block mb-1.5">{SvcN} <span className="text-[#6b6b80] font-normal">(select one or more)</span></p>
          <div className="space-y-1.5 max-h-44 overflow-y-auto rounded-xl border border-[#e8e6e0] p-1">
            {services.map((s) => {
              const on = form.serviceIds.includes(s.id);
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, serviceIds: on ? f.serviceIds.filter((id) => id !== s.id) : [...f.serviceIds, s.id] }))}
                  className={cn("w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all", on ? "bg-accent/10 border border-accent/30" : "hover:bg-[#f8f7f4] border border-transparent")}
                >
                  <div className={cn("w-4 h-4 rounded flex items-center justify-center border-2 flex-shrink-0", on ? "bg-accent border-accent" : "border-[#d1d1d8]")}>
                    {on && <Check size={10} className="text-white" />}
                  </div>
                  <span className="flex-1 text-sm font-medium">{s.name}</span>
                  <span className="flex items-center gap-1 text-xs text-[#6b6b80]"><Clock size={10} />{s.duration}m</span>
                  <span className="text-xs font-semibold text-accent">{formatPrice(s.price)}</span>
                </button>
              );
            })}
          </div>
          {selected.length > 1 && (
            <div className="mt-2 flex items-center gap-3 text-xs text-[#6b6b80] bg-[#f8f7f4] rounded-lg px-3 py-2">
              <span className="font-semibold text-[#0f0f1a]">{selected.length} services</span>
              <span className="flex items-center gap-1"><Clock size={10} />{selected.reduce((n, s) => n + s.duration, 0)} min</span>
              <span className="flex items-center gap-1 text-accent font-semibold"><DollarSign size={10} />{formatPrice(selected.reduce((n, s) => n + s.price, 0))}</span>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Select label={Stf1} value={form.staffId} onChange={(e) => setForm({ ...form, staffId: e.target.value })}
            options={[{ value: "", label: "Any available" }, ...staff.map((s) => ({ value: s.id, label: s.name }))]} />
          <Input label="Date" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
        </div>

        <div>
          <p className="text-sm font-medium text-brand-800 mb-1.5">Time</p>
          {allowOverlap ? (
            <Input label="" type="time" aria-label="Time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} />
          ) : (
            <TimeChips
              times={slots.times} loading={slots.loading} error={slots.error} value={form.time}
              onChange={(t) => setForm({ ...form, time: t })}
              emptyText={form.serviceIds.length ? "No free times on this day." : `Choose a ${svc1} to see free times.`}
            />
          )}
          <label className="mt-2 flex items-start gap-2 text-xs text-[#6b6b80] cursor-pointer">
            <input type="checkbox" className="mt-0.5" checked={allowOverlap} onChange={(e) => { setAllowOverlap(e.target.checked); setForm((f) => ({ ...f, time: "" })); }} />
            <span>Book at any time, even over an existing appointment{allowOverlap && !form.staffId ? " (pick a staff member)" : ""}</span>
          </label>
        </div>

        <Input label="Notes (optional)" placeholder="Any notes..." value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        {error && <p className="text-sm text-red-500" role="alert">{error}</p>}
        <div className="flex gap-3 pt-2">
          <Button variant="outline" onClick={onClose} className="flex-1 justify-center">Cancel</Button>
          <Button onClick={submit} disabled={saving || !form.clientName.trim() || !contactOk || form.serviceIds.length === 0 || !form.time} className="flex-1 justify-center">
            {saving ? "Saving..." : `Book ${Appt1}`}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/* ── Appointment details: status, reschedule, delete ──────────────────── */

export function AppointmentDetailModal({
  appt, onClose, staff, onChanged,
}: {
  appt: ApptDetail | null;
  onClose: () => void;
  staff: StaffOption[];
  onChanged: () => void;
}) {
  const { t } = useTerms();
  const appt1 = t("appointment");
  const Appt1 = t("appointment", { cap: true });
  const apptN = t("appointment", { plural: true });
  const cli1 = t("client");
  const Cli1 = t("client", { cap: true });
  const svc1 = t("service");
  const Svc1 = t("service", { cap: true });
  const SvcN = t("service", { plural: true, cap: true });
  const Stf1 = t("staff", { cap: true });
  const { formatPrice } = useCurrency();
  const [status, setStatus] = useState("");
  const [paymentStatus, setPaymentStatus] = useState("");
  const [paymentMode, setPaymentMode] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const [moving, setMoving] = useState(false);
  const [resDate, setResDate] = useState("");
  const [resStaff, setResStaff] = useState("");
  const [resTime, setResTime] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!appt) return;
    setStatus(appt.status);
    setPaymentStatus(appt.paymentStatus);
    setPaymentMode(appt.paymentMode);
    setResDate(appt.date);
    setResStaff(appt.staffId ?? "");
    setResTime("");
    setMoving(false);
    setConfirmDelete(false);
    setError("");
    setSaved(false);
  }, [appt]);

  const slots = useSlots(!!appt && moving, { date: resDate, staffId: resStaff || undefined, excludeId: appt?.id });

  useEffect(() => {
    if (slots.loading) return;
    if (resTime && !slots.times.some((t) => t.time === resTime)) setResTime("");
  }, [slots.times, slots.loading, resTime]);

  if (!appt) return <Modal isOpen={false} onClose={onClose}>{null}</Modal>;

  const movable = !["cancelled", "completed", "no-show"].includes(appt.status);
  const dirty = status !== appt.status || paymentStatus !== appt.paymentStatus || paymentMode !== appt.paymentMode;

  async function patch(body: Record<string, unknown>) {
    const res = await fetch(`/api/appointments/${appt!.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await readJson(res);
    if (!res.ok) throw new Error(data.error || "Failed to save");
  }

  async function saveChanges() {
    setSaving(true);
    setError("");
    try {
      await patch({ status, paymentStatus, paymentMode });
      setSaved(true);
      onChanged();
    } catch (e) {
      setError(friendly(e));
    } finally {
      setSaving(false);
    }
  }

  async function reschedule() {
    setSaving(true);
    setError("");
    try {
      await patch({ date: resDate, time: resTime, ...(resStaff && { staffId: resStaff }) });
      onClose();
      onChanged();
    } catch (e) {
      setError(friendly(e));
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/appointments/${appt!.id}`, { method: "DELETE" });
      const data = await readJson(res);
      if (!res.ok) throw new Error(data.error || "Failed to delete");
      onClose();
      onChanged();
    } catch (e) {
      setError(friendly(e));
      setConfirmDelete(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal isOpen onClose={onClose} title={`${Appt1} Details`} size="md">
      <div className="space-y-4">
        <div className="flex items-center gap-3 pb-4 border-b border-[#f0ede8]">
          <Avatar name={appt.clientName} color={appt.color} size="lg" />
          <div className="min-w-0">
            <p className="font-semibold truncate">{appt.clientName}</p>
            <p className="text-sm text-[#6b6b80] truncate">{appt.clientEmail}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 text-sm">
          {[
            { label: Svc1, value: appt.serviceName },
            { label: Stf1, value: appt.staffName || "—" },
            { label: "Date", value: appt.date },
            { label: "Time", value: formatTime(appt.time) },
            { label: "Duration", value: `${appt.duration} min` },
            { label: "Price", value: formatPrice(appt.price) },
          ].map(({ label, value }) => (
            <div key={label} className="bg-[#f8f7f4] rounded-xl p-3 min-w-0">
              <p className="text-xs text-[#6b6b80] mb-0.5">{label}</p>
              <p className="font-medium break-words">{value}</p>
            </div>
          ))}
        </div>

        {appt.notes && (
          <div className="bg-[#f8f7f4] rounded-xl p-3">
            <p className="text-xs text-[#6b6b80] mb-0.5">Notes</p>
            <p className="text-sm">{appt.notes}</p>
          </div>
        )}

        {/* Reschedule */}
        <div className="pt-1 border-t border-[#f0ede8] space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold text-[#6b6b80] uppercase tracking-wider">Reschedule</p>
            {movable && !moving && (
              <button type="button" onClick={() => setMoving(true)} className="text-xs font-semibold text-accent hover:underline">Change date, time or {t("staff")}</button>
            )}
          </div>
          {!movable && <p className="text-sm text-[#6b6b80]">Cancelled, completed and no-show {apptN} can&apos;t be moved.</p>}
          {moving && (
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Input label="New date" type="date" value={resDate} onChange={(e) => setResDate(e.target.value)} />
                <div>
                  <label htmlFor="resched-staff" className="text-sm font-medium text-brand-800 block mb-1.5">{Stf1}</label>
                  <select id="resched-staff" className={selectCls} value={resStaff} onChange={(e) => setResStaff(e.target.value)}>
                    {!appt.staffId && <option value="">Any available</option>}
                    {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
              </div>
              <TimeChips times={slots.times} loading={slots.loading} error={slots.error} value={resTime} onChange={setResTime} emptyText="No free times on this day." />
              <div className="flex gap-3">
                <Button variant="outline" onClick={() => setMoving(false)} className="flex-1 justify-center">Keep as is</Button>
                <Button onClick={reschedule} disabled={saving || !resTime || !resDate} className="flex-1 justify-center">{saving ? "Moving…" : `Move ${appt1}`}</Button>
              </div>
            </div>
          )}
        </div>

        {/* Status and payment */}
        <div className="pt-1 border-t border-[#f0ede8] space-y-3">
          <p className="text-xs font-bold text-[#6b6b80] uppercase tracking-wider">Update</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label htmlFor="appt-appointment-status" className="text-xs font-medium text-[#6b6b80] block mb-1.5">{Appt1} status</label>
              <select id="appt-appointment-status" value={status} onChange={(e) => setStatus(e.target.value)} className={selectCls}>
                <option value="confirmed">Confirmed</option>
                <option value="pending">Pending</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
                <option value="no-show">No-show</option>
              </select>
            </div>
            <div>
              <label htmlFor="appt-payment-status" className="text-xs font-medium text-[#6b6b80] block mb-1.5">Payment status</label>
              <select id="appt-payment-status" value={paymentStatus} onChange={(e) => setPaymentStatus(e.target.value)} className={selectCls}>
                <option value="unpaid">Unpaid</option>
                <option value="paid">Paid</option>
                <option value="refunded">Refunded</option>
              </select>
            </div>
            <div>
              <label htmlFor="appt-payment-mode" className="text-xs font-medium text-[#6b6b80] block mb-1.5">Payment mode</label>
              <select id="appt-payment-mode" value={paymentMode} onChange={(e) => setPaymentMode(e.target.value)} className={selectCls}>
                <option value="postpaid">Pay at venue</option>
                <option value="prepaid">Prepaid</option>
              </select>
            </div>
          </div>

          {error && <p className="text-sm text-red-500" role="alert">{error}</p>}

          <div className="flex gap-3 pt-1">
            <Button variant="outline" onClick={onClose} className="flex-1 justify-center">Close</Button>
            <Button onClick={saveChanges} disabled={saving || !dirty} className={cn("flex-1 justify-center gap-2", saved && !dirty && "bg-green-600 hover:bg-green-700")}>
              {saved && !dirty ? <><Check size={14} /> Saved</> : saving ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </div>

        {/* Delete */}
        <div className="pt-3 border-t border-[#f0ede8]">
          {!confirmDelete ? (
            <button type="button" onClick={() => setConfirmDelete(true)} className="flex items-center gap-1.5 text-sm font-medium text-red-600 hover:underline">
              <Trash2 size={14} /> Delete appointment
            </button>
          ) : (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 space-y-3" role="alertdialog" aria-label="Confirm delete">
              <p className="text-sm text-red-700">Delete {appt.clientName}&apos;s appointment on {appt.date} at {formatTime(appt.time)}? This can&apos;t be undone. To keep a record, set the status to Cancelled instead.</p>
              <div className="flex gap-3">
                <Button variant="outline" onClick={() => setConfirmDelete(false)} className="flex-1 justify-center">Keep it</Button>
                <Button onClick={remove} disabled={saving} className="flex-1 justify-center bg-red-600 hover:bg-red-700">{saving ? "Deleting…" : "Yes, delete"}</Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
