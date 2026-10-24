"use client";
import { useState } from "react";
import { ArrowRight, Check, Loader2 } from "lucide-react";
import { postLead, EMAIL_RE } from "./postLead";

export function InlineCTABand() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "loading" | "done">("idle");
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!EMAIL_RE.test(email.trim())) { setError("Enter a valid email"); return; }
    setError(""); setState("loading");
    const r = await postLead({ email, source: "inline-band" });
    if (r.ok) setState("done"); else { setError(r.error ?? "Try again"); setState("idle"); }
  }

  return (
    <section className="pt-0 pb-16 sm:pb-20 lg:pb-24">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-sky-600 to-sky-700 px-6 py-12 sm:px-12 shadow-2xl shadow-sky-200">
          {/* decorative orbs */}
          <div className="absolute -top-16 -right-10 w-64 h-64 rounded-full bg-white/10 blur-2xl" />
          <div className="absolute -bottom-20 -left-10 w-72 h-72 rounded-full bg-sky-400/20 blur-2xl" />

          <div className="relative flex flex-col lg:flex-row lg:items-center gap-8">
            <div className="flex-1">
              <h3 className="font-syne font-extrabold text-2xl sm:text-3xl text-white leading-tight mb-2">
                Turn no-shows into no-problem.
              </h3>
              <p className="text-sky-100 text-base max-w-md">
                Join 12,000+ businesses getting more bookings on autopilot. Start free in 60 seconds.
              </p>
            </div>

            <div className="lg:w-[440px] flex-shrink-0">
              {state === "done" ? (
                <div className="flex items-center gap-3 bg-white/15 backdrop-blur rounded-2xl px-5 py-4">
                  <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center flex-shrink-0">
                    <Check size={16} className="text-sky-600" strokeWidth={3} />
                  </div>
                  <p className="text-white font-medium text-sm">You&apos;re in! Check your inbox to get started.</p>
                </div>
              ) : (
                <form onSubmit={submit}>
                  <div className="flex flex-col sm:flex-row gap-2.5">
                    <input
                      type="email" value={email}
                      onChange={e => { setEmail(e.target.value); setError(""); }}
                      placeholder="you@business.com"
                      className="flex-1 rounded-2xl bg-white px-5 py-3.5 text-base text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-4 focus:ring-white/30 transition-all"
                    />
                    <button type="submit" disabled={state === "loading"}
                      className="group inline-flex items-center justify-center gap-2 bg-[#0f0f1a] hover:bg-black text-white font-semibold px-6 py-3.5 rounded-2xl transition-all hover:-translate-y-0.5 disabled:opacity-70 whitespace-nowrap">
                      {state === "loading" ? <Loader2 size={18} className="animate-spin" /> : <>Get started <ArrowRight size={17} className="group-hover:translate-x-1 transition-transform" /></>}
                    </button>
                  </div>
                  {error && <p className="text-sm text-white/90 mt-2 ml-1">{error}</p>}
                </form>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
