"use client";
import { useState } from "react";
import { ArrowRight, ArrowLeft, Check, Scissors, Stethoscope, Dumbbell, Sparkles, Briefcase, Store } from "lucide-react";

const BUSINESS_TYPES = [
  { value: "salon", label: "Salon / Beauty", icon: Scissors },
  { value: "spa", label: "Spa & Wellness", icon: Sparkles },
  { value: "clinic", label: "Clinic / Health", icon: Stethoscope },
  { value: "fitness", label: "Fitness / Coaching", icon: Dumbbell },
  { value: "consulting", label: "Consulting / Services", icon: Briefcase },
  { value: "other", label: "Something else", icon: Store },
];

const TOTAL = 5;

export function LeadCapture() {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({ businessType: "", name: "", email: "", phone: "", demoRequested: true, message: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const set = (k: keyof typeof form, v: string | boolean) => setForm(f => ({ ...f, [k]: v }));
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  function validateStep(): string | null {
    if (step === 0 && !form.businessType) return "Pick the option that fits best.";
    if (step === 1 && !form.name.trim()) return "Please enter your name.";
    if (step === 2 && !EMAIL_RE.test(form.email.trim())) return "Please enter a valid email.";
    if (step === 3 && !form.phone.trim()) return "Please enter a phone number.";
    return null;
  }

  function next() {
    const err = validateStep();
    if (err) { setError(err); return; }
    setError("");
    setStep(s => Math.min(s + 1, TOTAL - 1));
  }
  function back() { setError(""); setStep(s => Math.max(s - 1, 0)); }

  async function submit() {
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, source: "multi-step" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error ?? "Something went wrong. Try again."); setLoading(false); return; }
      setDone(true);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section id="demo" className="py-12 sm:py-16 lg:py-20 bg-cv-paper border-t border-cv-line">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-5 rounded-xl overflow-hidden border border-cv-line bg-cv-card">
          <div className="lg:col-span-2 bg-cv-blue p-8 sm:p-10 flex flex-col justify-center">
            <h2 className="font-display font-bold text-3xl sm:text-4xl tracking-tight text-white mb-3 text-balance">See Calvy in action</h2>
            <p className="text-white/85 text-lg mb-6">Tell us a little about your business and we&apos;ll be in touch, fast.</p>
            <ul className="space-y-3 text-white list-none p-0">
              {["Answer five quick questions", "We reach out to set up your demo", "Or just start free whenever you like"].map((t) => (
                <li key={t} className="flex items-start gap-3"><span className="mt-0.5 w-5 h-5 rounded-full bg-cv-marigold text-cv-ink flex items-center justify-center shrink-0"><Check size={12} strokeWidth={3} /></span>{t}</li>
              ))}
            </ul>
          </div>
          <div className="lg:col-span-3 p-6 sm:p-10 flex flex-col justify-center">
          {done ? (
            <div className="text-center py-10">
              <div className="w-16 h-16 rounded-full bg-cv-blue-tint flex items-center justify-center mx-auto mb-5">
                <Check size={30} className="text-cv-blue" />
              </div>
              <h3 className="font-display font-bold text-2xl mb-2">You&apos;re on the list!</h3>
              <p className="text-cv-mute">
                Thanks, {form.name.split(" ")[0]}. We&apos;ve emailed you a confirmation and the team will reach out
                {form.demoRequested ? " to book your demo" : ""} shortly.
              </p>
            </div>
          ) : (
            <>
              {/* progress */}
              <div className="flex items-center gap-1.5 mb-7">
                {Array.from({ length: TOTAL }).map((_, i) => (
                  <div key={i} className={`h-1.5 flex-1 rounded-full transition-colors ${i <= step ? "bg-cv-blue" : "bg-cv-line"}`} />
                ))}
              </div>

              {/* Step 0 — business type */}
              {step === 0 && (
                <div>
                  <h3 className="font-display font-bold text-xl mb-4">What kind of business do you run?</h3>
                  <div className="grid grid-cols-2 gap-3">
                    {BUSINESS_TYPES.map(b => (
                      <button
                        key={b.value}
                        onClick={() => { set("businessType", b.value); setError(""); }}
                        className={`flex items-center gap-3 p-4 rounded-xl border-2 text-left transition-colors ${form.businessType === b.value ? "border-cv-blue bg-cv-blue-tint" : "border-cv-line hover:border-cv-blue"}`}
                      >
                        <b.icon size={20} className={form.businessType === b.value ? "text-cv-blue" : "text-cv-mute"} />
                        <span className="text-sm font-semibold text-cv-ink">{b.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Step 1 — name */}
              {step === 1 && (
                <div>
                  <h3 className="font-display font-bold text-xl mb-4">What&apos;s your name?</h3>
                  <input autoFocus value={form.name} onChange={e => set("name", e.target.value)}
                    onKeyDown={e => e.key === "Enter" && next()} placeholder="Jane Smith" className="lc-inp" />
                </div>
              )}

              {/* Step 2 — email */}
              {step === 2 && (
                <div>
                  <h3 className="font-display font-bold text-xl mb-4">Your best email?</h3>
                  <input autoFocus type="email" value={form.email} onChange={e => set("email", e.target.value)}
                    onKeyDown={e => e.key === "Enter" && next()} placeholder="you@business.com" className="lc-inp" />
                </div>
              )}

              {/* Step 3 — phone */}
              {step === 3 && (
                <div>
                  <h3 className="font-display font-bold text-xl mb-4">And a phone number?</h3>
                  <input autoFocus type="tel" value={form.phone} onChange={e => set("phone", e.target.value)}
                    onKeyDown={e => e.key === "Enter" && next()} placeholder="+91 98765 43210" className="lc-inp" />
                  <p className="text-xs text-cv-mute mt-2">So we can reach you to set up your demo.</p>
                </div>
              )}

              {/* Step 4 — demo request */}
              {step === 4 && (
                <div>
                  <h3 className="font-display font-bold text-xl mb-4">Want a personal demo?</h3>
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <button onClick={() => set("demoRequested", true)}
                      className={`p-4 rounded-xl border-2 font-semibold text-sm transition-colors ${form.demoRequested ? "border-cv-blue bg-cv-blue-tint text-cv-blue" : "border-cv-line text-cv-mute"}`}>
                      Yes, book a demo
                    </button>
                    <button onClick={() => set("demoRequested", false)}
                      className={`p-4 rounded-xl border-2 font-semibold text-sm transition-colors ${!form.demoRequested ? "border-cv-blue bg-cv-blue-tint text-cv-blue" : "border-cv-line text-cv-mute"}`}>
                      Just send info
                    </button>
                  </div>
                  <textarea value={form.message} onChange={e => set("message", e.target.value)} rows={2}
                    placeholder="Anything you'd like us to know? (optional)" className="lc-inp" />
                </div>
              )}

              {error && <p className="text-sm text-red-700 mt-4">{error}</p>}

              <div className="flex items-center justify-between mt-7">
                {step > 0 ? (
                  <button onClick={back} className="inline-flex items-center gap-1.5 text-sm font-semibold text-cv-mute hover:text-cv-ink">
                    <ArrowLeft size={16} /> Back
                  </button>
                ) : <span />}

                {step < TOTAL - 1 ? (
                  <button onClick={next} className="inline-flex items-center gap-2 bg-cv-blue hover:bg-cv-blue-dark text-white font-semibold px-6 py-3 rounded-xl text-sm transition-colors">
                    Continue <ArrowRight size={16} />
                  </button>
                ) : (
                  <button onClick={submit} disabled={loading} className="inline-flex items-center gap-2 bg-cv-blue hover:bg-cv-blue-dark text-white font-semibold px-6 py-3 rounded-xl text-sm transition-colors disabled:opacity-50">
                    {loading ? "Submitting…" : "Submit"} <Check size={16} />
                  </button>
                )}
              </div>
            </>
          )}
          </div>
        </div>
      </div>

      <style jsx>{`.lc-inp{width:100%;border:1px solid #e3ddd2;border-radius:12px;padding:14px 16px;font-size:15px;outline:none;background:#fff}
        .lc-inp:focus{border-color:#0b4a8f;box-shadow:0 0 0 3px rgba(11,74,143,.15)}`}</style>
    </section>
  );
}
