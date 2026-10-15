"use client";
import Link from "next/link";
import { AlertTriangle, X } from "lucide-react";
import { useState, useEffect } from "react";
import { useFlags } from "@/components/providers/FlagsProvider";

export function TrialBanner() {
  const { payments } = useFlags();
  const [dismissed, setDismissed] = useState(false);
  const [status, setStatus] = useState<{ plan: string; planStatus: string } | null>(null);

  useEffect(() => {
    if (!payments) return;
    fetch("/api/billing/status")
      .then((r) => r.json())
      .then((d) => { if (!d.error) setStatus(d); })
      .catch(() => {});
  }, [payments]);

  if (!payments || dismissed || !status) return null;

  const { planStatus } = status;
  const isPastDue = planStatus === "past_due";

  if (!isPastDue) return null;

  return (
    <div className="flex items-center gap-2 px-4 py-2 border-b border-red-500/20 bg-red-500/10 text-red-400 text-xs font-medium">
      <AlertTriangle size={15} />
      <span>Payment failed. Update your payment method to restore access.</span>
      <Link href="/dashboard/billing" className="underline underline-offset-2 hover:opacity-80 ml-1">Fix billing</Link>
      <button onClick={() => setDismissed(true)} className="ml-auto p-0.5 hover:opacity-60 transition-opacity">
        <X size={13} />
      </button>
    </div>
  );
}
