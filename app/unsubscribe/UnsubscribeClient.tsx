"use client";
import { useState } from "react";
import { primaryBtn } from "@/components/auth/AuthShell";

type State = "ask" | "working" | "done" | "error";

export default function UnsubscribeClient({ businessName, query, whatsapp = false }: { businessName: string; query: string; whatsapp?: boolean }) {
  const what = whatsapp ? "WhatsApp updates" : "optional emails";
  const [state, setState] = useState<State>("ask");

  async function confirm() {
    setState("working");
    try {
      const res = await fetch(`/api/unsubscribe?${query}`, { method: "POST" });
      setState(res.ok ? "done" : "error");
    } catch {
      setState("error");
    }
  }

  if (state === "done") {
    return (
      <div className="text-center" aria-live="polite">
        <h1 className="font-syne font-bold text-xl text-[#0f0f1a] mb-2">You are unsubscribed</h1>
        <p className="text-sm text-[#6b6b80]">{businessName} will no longer send you {what}. {whatsapp ? "You will still get emails about your bookings." : "You will still get messages about your bookings, such as confirmations, changes and receipts."}</p>
      </div>
    );
  }

  return (
    <div className="text-center" aria-live="polite">
      <h1 className="font-syne font-bold text-xl text-[#0f0f1a] mb-2">{whatsapp ? "Stop WhatsApp updates?" : "Stop optional emails?"}</h1>
      <p className="text-sm text-[#6b6b80] mb-6">
        {whatsapp
          ? `You will stop getting WhatsApp messages from ${businessName}. You will still get emails about your bookings.`
          : `You will stop getting optional emails from ${businessName}, such as thank-you messages. Messages about your bookings, like confirmations, changes and receipts, are always sent.`}
      </p>
      {state === "error" && <p role="alert" className="text-sm text-red-600 mb-4">That did not work. Please try again.</p>}
      <button type="button" onClick={confirm} disabled={state === "working"} className={primaryBtn}>
        {state === "working" ? "Working…" : whatsapp ? "Yes, stop WhatsApp updates" : "Yes, stop these emails"}
      </button>
    </div>
  );
}
