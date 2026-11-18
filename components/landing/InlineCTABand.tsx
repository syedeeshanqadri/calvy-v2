"use client";
import { useState } from "react";
import { ArrowRight, Check, Loader2 } from "lucide-react";
import { postLead, EMAIL_RE } from "./postLead";

/** One solid deep-blue band: heading and email box on the left, nothing floating. */
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
    <section className="bg-cv-paper border-t border-cv-line py-12 sm:py-16">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="rounded-xl bg-cv-blue px-6 py-12 sm:px-12 sm:py-14">
          <div className="max-w-2xl">
            <h3 className="font-display font-bold text-2xl sm:text-4xl text-white leading-tight text-balance">
              Turn no-shows into <span className="whitespace-nowrap">no-problem.</span>
            </h3>
            <p className="mt-3 text-white/85 text-base sm:text-lg leading-relaxed text-balance">
              Reminders go out on their own, so fewer people forget. Start free in minutes.
            </p>

            <div className="mt-8 max-w-xl">
              {state === "done" ? (
                <div className="flex items-center gap-3 border border-white/30 rounded-xl px-5 py-4">
                  <div className="w-8 h-8 rounded-full bg-cv-marigold flex items-center justify-center flex-shrink-0">
                    <Check size={16} className="text-cv-ink" strokeWidth={3} />
                  </div>
                  <p className="text-white font-medium text-sm">You&apos;re in! Check your inbox to get started.</p>
                </div>
              ) : (
                <form onSubmit={submit} noValidate>
                  <div className="flex flex-col sm:flex-row gap-2.5">
                    <input
                      type="email" value={email} aria-label="Your email"
                      onChange={e => { setEmail(e.target.value); setError(""); }}
                      placeholder="you@business.com"
                      className="flex-1 min-w-0 rounded-xl bg-white px-5 py-3.5 text-base text-cv-ink placeholder:text-cv-mute focus:outline-none focus:ring-4 focus:ring-white/30"
                    />
                    <button type="submit" disabled={state === "loading"}
                      className="group inline-flex items-center justify-center gap-2 bg-cv-marigold hover:brightness-95 text-cv-ink font-semibold px-6 py-3.5 rounded-xl transition disabled:opacity-70 whitespace-nowrap">
                      {state === "loading" ? <Loader2 size={18} className="animate-spin" /> : <>Get started <ArrowRight size={17} className="group-hover:translate-x-0.5 transition-transform" /></>}
                    </button>
                  </div>
                  {error && <p role="alert" className="text-sm text-white mt-2.5">{error}</p>}
                </form>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
