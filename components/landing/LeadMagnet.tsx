"use client";
import { useState } from "react";
import { Download, Check, Loader2, FileText, Star } from "lucide-react";
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

  return (
    <section className="py-16 sm:py-20 lg:py-24 bg-[#0f0f1a] relative overflow-hidden">
      <div className="absolute inset-0 opacity-[0.07]" style={{ backgroundImage: "radial-gradient(#fff 1px, transparent 1px)", backgroundSize: "30px 30px" }} />
      <div className="relative max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-2 gap-10 items-center">
          {/* Magnet cover */}
          <div className="flex justify-center lg:justify-start">
            <div className="relative" style={{ animation: "float 6s ease-in-out infinite" }}>
              <div className="w-56 sm:w-64 bg-gradient-to-br from-sky-500 to-sky-700 rounded-2xl shadow-2xl shadow-sky-900/50 p-7 rotate-[-4deg]">
                <FileText size={28} className="text-white/80 mb-6" />
                <p className="text-sky-200 text-xs font-bold tracking-widest uppercase mb-2">Free Playbook</p>
                <p className="font-syne font-extrabold text-white text-2xl leading-tight">7 Ways to Cut No-Shows by 80%</p>
                <div className="flex items-center gap-1 mt-6">
                  {Array(5).fill(0).map((_, i) => <Star key={i} size={12} className="text-amber-300 fill-amber-300" />)}
                  <span className="text-white/70 text-[11px] ml-1">Loved by 2,400+ owners</span>
                </div>
              </div>
            </div>
          </div>

          {/* Form */}
          <div>
            <span className="inline-block bg-sky-500/15 text-sky-300 text-xs font-bold tracking-widest uppercase px-4 py-2 rounded-full mb-4">Free download</span>
            <h2 className="font-syne font-extrabold text-3xl sm:text-4xl text-white leading-tight mb-3">
              Get the No-Show Playbook
            </h2>
            <p className="text-gray-400 text-lg mb-7">
              The exact reminder timings, deposit scripts, and rebooking flows top businesses use to stop losing money to no-shows. Straight to your inbox.
            </p>

            {state === "done" ? (
              <div className="flex items-center gap-3 bg-green-500/15 border border-green-500/30 rounded-2xl px-5 py-4">
                <div className="w-9 h-9 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0">
                  <Check size={18} className="text-white" strokeWidth={3} />
                </div>
                <p className="text-green-200 font-medium">Sent! Check your inbox for the playbook.</p>
              </div>
            ) : (
              <form onSubmit={submit} className="space-y-3">
                <div className="grid sm:grid-cols-2 gap-3">
                  <input value={form.name} onChange={e => { setForm(f => ({ ...f, name: e.target.value })); setError(""); }}
                    placeholder="Your name"
                    className="rounded-2xl bg-white/5 border border-white/15 text-white placeholder:text-gray-500 px-5 py-3.5 focus:outline-none focus:ring-4 focus:ring-sky-500/20 focus:border-sky-500 transition-all" />
                  <input type="email" value={form.email} onChange={e => { setForm(f => ({ ...f, email: e.target.value })); setError(""); }}
                    placeholder="you@business.com"
                    className="rounded-2xl bg-white/5 border border-white/15 text-white placeholder:text-gray-500 px-5 py-3.5 focus:outline-none focus:ring-4 focus:ring-sky-500/20 focus:border-sky-500 transition-all" />
                </div>
                <button type="submit" disabled={state === "loading"}
                  className="group w-full inline-flex items-center justify-center gap-2 bg-sky-500 hover:bg-sky-400 text-white font-semibold px-6 py-4 rounded-2xl transition-all hover:-translate-y-0.5 disabled:opacity-70">
                  {state === "loading" ? <Loader2 size={18} className="animate-spin" /> : <><Download size={18} /> Send me the playbook</>}
                </button>
                {error && <p className="text-sm text-red-400 ml-1">{error}</p>}
                <p className="text-xs text-gray-500 ml-1">No spam. Unsubscribe anytime.</p>
              </form>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
