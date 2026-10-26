"use client";
import { useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { postLead, EMAIL_RE } from "./postLead";

const PHONE_RE = /^\+?[0-9\s\-.()]{10,20}$/;

/** "Book a personal demo": opens a small form (email + phone). The lead is saved and emailed a confirmation. */
export function DemoButton({ className, children, source = "demo-modal" }: { className?: string; children: React.ReactNode; source?: string }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const [state, setState] = useState<"idle" | "loading" | "done">("idle");

  function close() {
    setOpen(false);
    if (state === "done") { setState("idle"); setEmail(""); setPhone(""); }
    setError("");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!EMAIL_RE.test(email.trim())) { setError("Enter a valid email address."); return; }
    if (!PHONE_RE.test(phone.trim())) { setError("Enter a valid phone number, with country code if outside India."); return; }
    setError(""); setState("loading");
    const r = await postLead({ email: email.trim(), phone: phone.trim(), source, demoRequested: true, message: "Personal demo request" });
    if (r.ok) setState("done");
    else { setError(r.error ?? "Something went wrong. Please try again."); setState("idle"); }
  }

  const input = "w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-base focus:outline-none focus:ring-4 focus:ring-sky-100 focus:border-sky-500 transition-all";

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className} aria-haspopup="dialog">{children}</button>
      <Modal isOpen={open} onClose={close} title={state === "done" ? "Demo booked" : "Book a personal demo"} size="sm">
        {state === "done" ? (
          <div className="text-center py-2" role="status">
            <div className="w-12 h-12 rounded-full bg-green-500 flex items-center justify-center mx-auto mb-4">
              <Check size={24} className="text-white" strokeWidth={3} aria-hidden />
            </div>
            <p className="font-semibold text-gray-900 mb-1">Your demo is booked.</p>
            <p className="text-sm text-gray-500">We have emailed you a confirmation. Our team will contact you soon with your demo.</p>
            <button type="button" onClick={close} className="mt-6 w-full min-h-12 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-semibold">Done</button>
          </div>
        ) : (
          <form onSubmit={submit} noValidate className="space-y-4">
            <p className="text-sm text-gray-500">Tell us where to reach you and we will set up a short walkthrough of Calvy for your business.</p>
            <div>
              <label htmlFor="demo-email" className="text-sm font-medium text-gray-800 block mb-1.5">Email</label>
              <input id="demo-email" type="email" autoComplete="email" autoFocus value={email} onChange={e => { setEmail(e.target.value); setError(""); }} placeholder="you@business.com" className={input} />
            </div>
            <div>
              <label htmlFor="demo-phone" className="text-sm font-medium text-gray-800 block mb-1.5">Phone number</label>
              <input id="demo-phone" type="tel" autoComplete="tel" value={phone} onChange={e => { setPhone(e.target.value); setError(""); }} placeholder="+91 98765 43210" className={input} />
            </div>
            {error && <p className="text-sm text-red-500" role="alert">{error}</p>}
            <button type="submit" disabled={state === "loading"} className="w-full min-h-12 inline-flex items-center justify-center gap-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-semibold disabled:opacity-70">
              {state === "loading" ? <Loader2 size={18} className="animate-spin" aria-hidden /> : "Book my demo"}
            </button>
          </form>
        )}
      </Modal>
    </>
  );
}
