"use client";
import { useEffect, useState } from "react";
import { X, Check, Loader2, Zap } from "lucide-react";
import { postLead, EMAIL_RE } from "./postLead";

export function StickySidebarCTA() {
  const [visible, setVisible] = useState(false);
  const [closed, setClosed] = useState(false);
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "loading" | "done">("idle");
  const [error, setError] = useState("");

  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      const max = document.body.scrollHeight - window.innerHeight;
      // Show in the middle of the page, hide near the very bottom (footer area)
      setVisible(y > 1100 && y < max - 700);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!EMAIL_RE.test(email.trim())) { setError("Enter a valid email"); return; }
    setError(""); setState("loading");
    const r = await postLead({ email, source: "sticky-sidebar" });
    if (r.ok) setState("done"); else { setError(r.error ?? "Try again"); setState("idle"); }
  }

  if (closed) return null;

  return (
    <div
      className={`hidden xl:block fixed left-5 top-1/2 -translate-y-1/2 z-40 w-64 transition-all duration-500 ${visible ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-6 pointer-events-none"}`}
    >
      <div className="bg-white rounded-3xl shadow-2xl border border-gray-100 overflow-hidden">
        <div className="bg-gradient-to-br from-[#0f0f1a] to-[#1a1a2e] px-5 py-5 relative">
          <button onClick={() => setClosed(true)} className="absolute top-3 right-3 text-white/40 hover:text-white"><X size={15} /></button>
          <div className="w-9 h-9 rounded-xl bg-sky-500/20 flex items-center justify-center mb-3">
            <Zap size={18} className="text-sky-400" />
          </div>
          <p className="font-syne font-extrabold text-white text-lg leading-tight">Still scrolling?</p>
          <p className="text-gray-400 text-xs mt-1">Get your free booking page before you go.</p>
        </div>
        <div className="p-5">
          {state === "done" ? (
            <div className="flex items-center gap-2 text-sm text-green-700">
              <div className="w-7 h-7 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0"><Check size={14} className="text-white" strokeWidth={3} /></div>
              You&apos;re in!
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-2.5">
              <input type="email" value={email}
                onChange={e => { setEmail(e.target.value); setError(""); }}
                placeholder="you@business.com"
                className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-4 focus:ring-sky-100 focus:border-sky-500 transition-all" />
              <button type="submit" disabled={state === "loading"}
                className="w-full inline-flex items-center justify-center gap-2 bg-sky-600 hover:bg-sky-700 text-white font-semibold px-4 py-2.5 rounded-xl text-sm transition-all disabled:opacity-70">
                {state === "loading" ? <Loader2 size={15} className="animate-spin" /> : "Start free"}
              </button>
              {error && <p className="text-xs text-red-500">{error}</p>}
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
