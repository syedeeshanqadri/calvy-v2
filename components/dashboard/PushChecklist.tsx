"use client";
import { CheckCircle2, CircleAlert, CircleMinus, XCircle } from "lucide-react";
import { buildChecklist, soundSteps, type ChecklistFacts, type ItemState } from "@/lib/pushChecklist";

const ICON: Record<ItemState, React.ReactNode> = {
  ok: <CheckCircle2 size={18} className="text-emerald-600" aria-label="Done" />,
  warn: <CircleAlert size={18} className="text-amber-600" aria-label="Needs attention" />,
  fail: <XCircle size={18} className="text-red-600" aria-label="Not working" />,
  na: <CircleMinus size={18} className="text-[#6b6b80]" aria-label="Not needed" />,
};

/** Live setup status for phone alerts, with the plain steps to make them loud on THIS kind of device. */
export function PushChecklist({ facts }: { facts: ChecklistFacts }) {
  const items = buildChecklist(facts);
  const sound = soundSteps(facts.platform);
  return (
    <div className="space-y-4" data-testid="push-checklist">
      <ul className="divide-y divide-[#f0ede8]">
        {items.map((i) => (
          <li key={i.id} className="py-2.5 flex items-start gap-3" data-state={i.state}>
            <span className="mt-0.5 shrink-0">{ICON[i.state]}</span>
            <div className="min-w-0">
              <p className="text-sm font-medium">{i.label}</p>
              <p className="text-xs text-[#6b6b80]">{i.detail}</p>
            </div>
          </li>
        ))}
      </ul>
      <details className="rounded-xl bg-[#f8f7f4] p-3 text-sm" open>
        <summary className="cursor-pointer font-semibold min-h-11 flex items-center">Make alerts loud on {sound.title}</summary>
        <ol className="list-decimal pl-5 space-y-1 text-[#3d3d4d]">{sound.steps.map((s) => <li key={s}>{s}</li>)}</ol>
        <p className="mt-2 text-xs text-[#6b6b80]">The web page cannot change these phone settings; they decide whether an alert makes a sound when the app is closed.</p>
      </details>
    </div>
  );
}
