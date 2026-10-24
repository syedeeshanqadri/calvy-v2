"use client";
import { useState } from "react";
import { Send, Check, Loader2 } from "lucide-react";
import { postLead, EMAIL_RE } from "./postLead";

export function NewsletterForm() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "loading" | "done">("idle");
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!EMAIL_RE.test(email.trim())) { setError("Enter a valid email"); return; }
    setError(""); setState("loading");
    const r = await postLead({ email, source: "newsletter", message: "Newsletter subscriber" });
    if (r.ok) setState("done"); else { setError(r.error ?? "Try again"); setState("idle"); }
  }

  return (
    <div>
      <h4 className="text-sm font-semibold text-white mb-3">Get growth tips</h4>
      <p className="text-sm text-gray-500 mb-4 leading-relaxed">Practical playbooks for service businesses, twice a month. No fluff.</p>
      {state === "done" ? (
        <div className="flex items-center gap-2 text-sm text-green-400">
          <Check size={16} /> Subscribed — talk soon!
        </div>
      ) : (
        <form onSubmit={submit}>
          <div className="flex items-center bg-white/5 border border-white/10 rounded-xl overflow-hidden focus-within:border-sky-500 transition-colors">
            <input
              type="email" value={email}
              onChange={e => { setEmail(e.target.value); setError(""); }}
              placeholder="you@business.com"
              className="flex-1 bg-transparent text-white placeholder:text-gray-600 text-sm px-4 min-h-11 focus:outline-none min-w-0"
            />
            <button type="submit" disabled={state === "loading"} aria-label="Subscribe"
              className="flex-shrink-0 w-11 h-11 flex items-center justify-center text-sky-400 hover:text-white hover:bg-sky-600 transition-colors disabled:opacity-60">
              {state === "loading" ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            </button>
          </div>
          {error && <p className="text-xs text-red-400 mt-1.5">{error}</p>}
        </form>
      )}
    </div>
  );
}
