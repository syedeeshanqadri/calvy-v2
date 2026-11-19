"use client";
import { useState } from "react";
import { primaryBtn } from "@/components/auth/AuthShell";

export default function StopRemindersClient({ query }: { query: string }) {
  const [state, setState] = useState<"ask" | "working" | "done" | "error">("ask");
  async function confirm() {
    setState("working");
    try { setState((await fetch(`/api/unsubscribe/onboarding?${query}`, { method: "POST" })).ok ? "done" : "error"); } catch { setState("error"); }
  }
  if (state === "done") {
    return (
      <div className="text-center" aria-live="polite">
        <h1 className="font-syne font-bold text-xl text-[#0f0f1a] mb-2">No more setup reminders</h1>
        <p className="text-sm text-[#6b6b80]">We will not send you reminders about finishing your Calvy setup. Your account and your progress are untouched.</p>
      </div>
    );
  }
  return (
    <div className="text-center" aria-live="polite">
      <h1 className="font-syne font-bold text-xl text-[#0f0f1a] mb-2">Stop setup reminders?</h1>
      <p className="text-sm text-[#6b6b80] mb-6">You will stop getting emails about finishing your Calvy setup. Messages about your account, like sign-in links, are always sent.</p>
      {state === "error" && <p role="alert" className="text-sm text-red-600 mb-4">That did not work. Please try again.</p>}
      <button type="button" onClick={confirm} disabled={state === "working"} className={primaryBtn}>{state === "working" ? "Working…" : "Yes, stop these emails"}</button>
    </div>
  );
}
