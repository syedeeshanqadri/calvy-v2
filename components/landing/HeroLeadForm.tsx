"use client";
import { useState } from "react";
import { ArrowRight, Check, Loader2 } from "lucide-react";
import { postLead, EMAIL_RE } from "./postLead";

export function HeroLeadForm() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "loading" | "done">("idle");
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!EMAIL_RE.test(email.trim())) { setError("Enter a valid email"); return; }
    setError(""); setState("loading");
    const r = await postLead({ email, source: "hero", demoRequested: false });
    if (r.ok) setState("done");
    else { setError(r.error ?? "Try again"); setState("idle"); }
  }

  if (state === "done") {
    return (
      <div className="flex items-center gap-2.5 bg-green-50 border border-green-200 rounded-2xl px-5 py-4 max-w-md animate-[fadeIn_.3s_ease]">
        <div className="w-7 h-7 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0">
          <Check size={15} className="text-white" strokeWidth={3} />
        </div>
        <p className="text-sm font-medium text-green-800">You&apos;re in! Check your inbox to get started.</p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="max-w-md">
      <div className="flex flex-col sm:flex-row gap-2.5">
        <input
          type="email"
          value={email}
          onChange={e => { setEmail(e.target.value); setError(""); }}
          placeholder="Enter your email"
          className="flex-1 rounded-2xl border border-gray-200 bg-white px-5 py-4 text-base focus:outline-none focus:ring-4 focus:ring-sky-100 focus:border-sky-500 transition-all"
        />
        <button
          type="submit"
          disabled={state === "loading"}
          className="group inline-flex w-full sm:w-auto min-h-12 items-center justify-center gap-2 bg-sky-600 hover:bg-sky-700 text-white font-semibold px-6 py-4 rounded-2xl transition-all shadow-lg shadow-sky-200 hover:shadow-sky-300 hover:-translate-y-0.5 disabled:opacity-70 whitespace-nowrap"
        >
          {state === "loading" ? <Loader2 size={18} className="animate-spin" /> : <>Start free <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" /></>}
        </button>
      </div>
      {error && <p className="text-sm text-red-500 mt-2 ml-1">{error}</p>}
      <p className="text-xs text-gray-400 mt-2.5 ml-1">No credit card · Free forever plan · Setup in 60 seconds</p>
    </form>
  );
}
