"use client";
import { useEffect, useState } from "react";
import { X, Check, Loader2, Gift } from "lucide-react";
import { postLead, EMAIL_RE } from "./postLead";

const KEY = "calvy-exit-shown";

export function ExitIntentPopup() {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "loading" | "done">("idle");
  const [error, setError] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (sessionStorage.getItem(KEY)) return;

    let fired = false;
    const fire = () => {
      if (fired) return;
      fired = true;
      sessionStorage.setItem(KEY, "1");
      setOpen(true);
    };
    const onLeave = (e: MouseEvent) => { if (e.clientY <= 0) fire(); };
    document.addEventListener("mouseleave", onLeave);
    // Mobile / fallback: show after 35s of engagement
    const t = setTimeout(fire, 35000);
    return () => { document.removeEventListener("mouseleave", onLeave); clearTimeout(t); };
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!EMAIL_RE.test(email.trim())) { setError("Enter a valid email"); return; }
    setError(""); setState("loading");
    const r = await postLead({ email, source: "exit-intent", message: "Exit-intent offer" });
    if (r.ok) setState("done"); else { setError(r.error ?? "Try again"); setState("idle"); }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-[fadeIn_.2s_ease]" onClick={() => setOpen(false)} />
      <div className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden animate-[popIn_.3s_cubic-bezier(.16,1,.3,1)]">
        <button onClick={() => setOpen(false)} aria-label="Close" className="absolute top-3 right-3 z-10 w-11 h-11 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500">
          <X size={16} />
        </button>
        <div className="bg-gradient-to-br from-sky-600 to-sky-700 px-8 pt-10 pb-8 text-center">
          <div className="w-14 h-14 rounded-2xl bg-white/15 flex items-center justify-center mx-auto mb-4">
            <Gift size={26} className="text-white" />
          </div>
          <h3 className="font-syne font-extrabold text-2xl text-white leading-tight">Wait — don&apos;t leave empty-handed</h3>
          <p className="text-sky-100 mt-2 text-sm">Get our <strong className="text-white">No-Show Playbook</strong> + early access to new features. Free.</p>
        </div>
        <div className="p-8">
          {state === "done" ? (
            <div className="flex items-center gap-3 bg-green-50 rounded-2xl px-5 py-4">
              <div className="w-9 h-9 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0">
                <Check size={18} className="text-white" strokeWidth={3} />
              </div>
              <p className="text-green-800 font-medium text-sm">Done! Check your inbox.</p>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-3">
              <input type="email" autoFocus value={email}
                onChange={e => { setEmail(e.target.value); setError(""); }}
                placeholder="you@business.com"
                className="w-full rounded-2xl border border-gray-200 px-5 py-3.5 focus:outline-none focus:ring-4 focus:ring-sky-100 focus:border-sky-500 transition-all" />
              <button type="submit" disabled={state === "loading"}
                className="w-full inline-flex items-center justify-center gap-2 bg-sky-600 hover:bg-sky-700 text-white font-semibold px-6 py-3.5 rounded-2xl transition-all hover:-translate-y-0.5 disabled:opacity-70">
                {state === "loading" ? <Loader2 size={18} className="animate-spin" /> : "Send me the playbook"}
              </button>
              {error && <p className="text-sm text-red-500 text-center">{error}</p>}
              <button type="button" onClick={() => setOpen(false)} className="w-full min-h-11 text-xs text-gray-500 hover:text-gray-700">No thanks, I&apos;ll pass</button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
