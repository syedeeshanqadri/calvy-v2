"use client";
import { useState } from "react";

const field = "mt-1 w-full min-h-11 px-3 rounded-xl bg-white border border-[#e8e6e0] text-[15px] text-[#0f0f1a]";

export function DeletionForm() {
  const [values, setValues] = useState({ name: "", email: "", role: "owner", message: "" });
  const [state, setState] = useState<"idle" | "sending" | "done">("idle");
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState("sending"); setError("");
    try {
      const res = await fetch("/api/data-deletion", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(values) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setError(json.error ?? "Something went wrong. Please try again or email us."); setState("idle"); return; }
      setState("done");
    } catch {
      setError("Network error. Please try again or email us.");
      setState("idle");
    }
  }

  if (state === "done") {
    return <p role="status" className="rounded-xl bg-emerald-50 text-emerald-800 px-4 py-3 text-[15px]">Thank you. We received your request and will reply to {values.email} to confirm it is you before we delete anything.</p>;
  }

  return (
    <form onSubmit={submit} className="space-y-4 not-prose">
      <label className="block text-sm font-semibold text-[#0f0f1a]">Your name
        <input required maxLength={120} autoComplete="name" value={values.name} onChange={(e) => setValues({ ...values, name: e.target.value })} className={field} />
      </label>
      <label className="block text-sm font-semibold text-[#0f0f1a]">Email address on your Calvy account or bookings
        <input required type="email" maxLength={254} autoComplete="email" value={values.email} onChange={(e) => setValues({ ...values, email: e.target.value })} className={field} />
      </label>
      <label className="block text-sm font-semibold text-[#0f0f1a]">I am
        <select value={values.role} onChange={(e) => setValues({ ...values, role: e.target.value })} className={field}>
          <option value="owner">A business owner</option>
          <option value="team">A team member</option>
          <option value="customer">A customer who booked through a business</option>
        </select>
      </label>
      <label className="block text-sm font-semibold text-[#0f0f1a]">Anything we should know (optional)
        <textarea maxLength={1000} rows={3} value={values.message} onChange={(e) => setValues({ ...values, message: e.target.value })} className={`${field} py-2`} />
      </label>
      {error && <p role="alert" className="rounded-xl bg-red-50 text-red-700 px-4 py-3 text-sm">{error}</p>}
      <button type="submit" disabled={state === "sending"} className="min-h-11 px-6 rounded-xl bg-[#0f0f1a] text-white text-sm font-semibold disabled:opacity-60">{state === "sending" ? "Sending…" : "Request deletion"}</button>
    </form>
  );
}
