"use client";
import { useState } from "react";
import { Download, Check, Loader2, FileText } from "lucide-react";
import { postLead, EMAIL_RE } from "./postLead";

export function LeadMagnet() {
  const [form, setForm] = useState({ name: "", email: "" });
  const [state, setState] = useState<"idle" | "loading" | "done">("idle");
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) { setError("Enter your name"); return; }
    if (!EMAIL_RE.test(form.email.trim())) { setError("Enter a valid email"); return; }
    setError(""); setState("loading");
    const r = await postLead({ ...form, source: "lead-magnet", message: "Requested: No-Show Playbook" });
    if (r.ok) setState("done"); else { setError(r.error ?? "Try again"); setState("idle"); }
  }

  const inp = "rounded-xl bg-white border border-cv-line text-cv-ink placeholder:text-cv-mute px-5 py-3.5 focus:outline-none focus:ring-4 focus:ring-cv-blue/15 focus:border-cv-blue";
  return (
    <section className="py-16 sm:py-20 lg:py-24 bg-cv-card border-t border-cv-line">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-[0.8fr_1.2fr] gap-10 lg:gap-16 items-center">
          {/* The playbook cover: a plain bordered sheet */}
          <div className="flex justify-center lg:justify-start">
            <div className="w-56 sm:w-64 rounded-xl border-2 border-cv-blue bg-white p-7">
              <FileText size={28} className="text-cv-blue mb-6" strokeWidth={1.75} aria-hidden />
              <p className="text-cv-mute text-xs font-bold tracking-widest uppercase mb-2">Free Playbook</p>
              <p className="font-display font-bold text-cv-ink text-2xl leading-tight">7 Ways to Cut No-Shows</p>
              <div className="mt-5 h-1 w-12 bg-cv-marigold" aria-hidden />
            </div>
          </div>

          <div>
            <h2 className="font-display font-bold text-3xl sm:text-4xl text-cv-ink leading-tight mb-3 text-balance">
              Get the No-Show Playbook
            </h2>
            <p className="text-cv-mute text-lg mb-7 max-w-xl">
              The exact reminder timings, deposit scripts, and rebooking flows top businesses use to stop losing money to no-shows. Straight to your inbox.
            </p>

            {state === "done" ? (
              <div className="flex items-center gap-3 border border-cv-blue rounded-xl px-5 py-4 max-w-xl">
                <div className="w-9 h-9 rounded-full bg-cv-marigold flex items-center justify-center flex-shrink-0">
                  <Check size={18} className="text-cv-ink" strokeWidth={3} />
                </div>
                <p className="text-cv-ink font-medium">Sent! Check your inbox for the playbook.</p>
              </div>
            ) : (
              <form onSubmit={submit} className="space-y-3 max-w-xl">
                <div className="grid sm:grid-cols-2 gap-3">
                  <input value={form.name} onChange={e => { setForm(f => ({ ...f, name: e.target.value })); setError(""); }} placeholder="Your name" aria-label="Your name" className={inp} />
                  <input type="email" value={form.email} onChange={e => { setForm(f => ({ ...f, email: e.target.value })); setError(""); }} placeholder="you@business.com" aria-label="Your email" className={inp} />
                </div>
                <button type="submit" disabled={state === "loading"}
                  className="group w-full inline-flex items-center justify-center gap-2 bg-cv-blue hover:bg-cv-blue-dark text-white font-semibold px-6 py-4 rounded-xl transition-colors disabled:opacity-60">
                  {state === "loading" ? <Loader2 size={18} className="animate-spin" /> : <><Download size={18} /> Send me the playbook</>}
                </button>
                {error && <p role="alert" className="text-sm text-red-700 ml-1">{error}</p>}
                <p className="text-xs text-cv-mute ml-1">No spam. Unsubscribe anytime.</p>
              </form>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
