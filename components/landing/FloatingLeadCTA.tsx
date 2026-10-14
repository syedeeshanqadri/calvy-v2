"use client";
import { useEffect, useState } from "react";
import { MessageSquareText, X, Check, Loader2, ArrowRight } from "lucide-react";
import { postLead, EMAIL_RE } from "./postLead";

export function FloatingLeadCTA() {
  const [visible, setVisible] = useState(false);
  const [openForm, setOpenForm] = useState(false);
  const [closed, setClosed] = useState(false);
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "loading" | "done">("idle");
  const [error, setError] = useState("");

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 700);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!EMAIL_RE.test(email.trim())) { setError("Enter a valid email"); return; }
    setError(""); setState("loading");
    const r = await postLead({ email, source: "floating-cta", demoRequested: true, message: "Floating CTA demo request" });
    if (r.ok) setState("done"); else { setError(r.error ?? "Try again"); setState("idle"); }
  }

  if (closed || !visible) return null;

  return (
    <div className="fixed bottom-5 right-5 z-50 print:hidden">
      {openForm ? (
        <div className="w-[320px] bg-white rounded-3xl shadow-2xl border border-gray-100 overflow-hidden animate-[popIn_.25s_cubic-bezier(.16,1,.3,1)]">
          <div className="bg-gradient-to-r from-sky-600 to-sky-500 px-5 py-4 flex items-center justify-between">
            <div>
              <p className="text-white font-syne font-bold text-sm">Get a free demo</p>
              <p className="text-sky-100 text-xs">See Calvy on your business in 15 min</p>
            </div>
            <button onClick={() => setOpenForm(false)} className="text-white/80 hover:text-white"><X size={18} /></button>
          </div>
          <div className="p-5">
            {state === "done" ? (
              <div className="flex items-center gap-2.5 text-sm text-green-700">
                <div className="w-7 h-7 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0"><Check size={14} className="text-white" strokeWidth={3} /></div>
                Thanks! We&apos;ll reach out shortly.
              </div>
            ) : (
              <form onSubmit={submit} className="space-y-2.5">
                <input type="email" autoFocus value={email}
                  onChange={e => { setEmail(e.target.value); setError(""); }}
                  placeholder="you@business.com"
                  className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm focus:outline-none focus:ring-4 focus:ring-sky-100 focus:border-sky-500 transition-all" />
                <button type="submit" disabled={state === "loading"}
                  className="group w-full inline-flex items-center justify-center gap-2 bg-sky-600 hover:bg-sky-700 text-white font-semibold px-5 py-3 rounded-xl text-sm transition-all disabled:opacity-70">
                  {state === "loading" ? <Loader2 size={16} className="animate-spin" /> : <>Request demo <ArrowRight size={15} className="group-hover:translate-x-1 transition-transform" /></>}
                </button>
                {error && <p className="text-xs text-red-500">{error}</p>}
              </form>
            )}
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2 animate-[popIn_.25s_cubic-bezier(.16,1,.3,1)]">
          <button onClick={() => setOpenForm(true)}
            className="group inline-flex items-center gap-2.5 bg-sky-600 hover:bg-sky-700 text-white font-semibold pl-4 pr-5 py-3.5 rounded-full shadow-xl shadow-sky-300/50 hover:-translate-y-0.5 transition-all">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-300 opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-400" />
            </span>
            <MessageSquareText size={18} />
            <span className="text-sm">Get a free demo</span>
          </button>
          <button onClick={() => setClosed(true)} aria-label="Dismiss"
            className="w-8 h-8 rounded-full bg-white shadow-md border border-gray-100 flex items-center justify-center text-gray-400 hover:text-gray-700">
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
