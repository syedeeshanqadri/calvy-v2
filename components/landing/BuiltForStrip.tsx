import { Briefcase, Dumbbell, Scale, Scissors, Stethoscope, UserRound, type LucideIcon } from "lucide-react";
import { FOR_PAGES } from "@/lib/forPages";
import type { PackId } from "@/lib/packs/types";
import { WRAP } from "@/components/marketing/ui";

const ICON: Record<PackId, LucideIcon> = { CLINIC: Stethoscope, SALON_SPA: Scissors, LAWYER: Scale, FITNESS: Dumbbell, CONSULTANT: UserRound, OTHER: Briefcase };

/** A quiet row of icon and label: who Calvy is for. No logos, no claims. The words are the ones the /for pages already use. */
export function BuiltForStrip() {
  const items = [...FOR_PAGES.map((p) => ({ key: p.slug, pack: p.pack, label: p.what.charAt(0).toUpperCase() + p.what.slice(1) })), { key: "any", pack: "OTHER" as PackId, label: "Any service business" }];
  return (
    <section aria-label="Who Calvy is for" className="border-b border-black/[0.06] bg-white">
      <div className={`${WRAP} py-8`}>
        <ul className="m-0 grid list-none grid-cols-2 gap-x-4 gap-y-6 p-0 sm:grid-cols-3 lg:grid-cols-6">
          {items.map(({ key, pack, label }) => {
            const Icon = ICON[pack];
            return <li key={key} className="flex min-w-0 flex-col items-center gap-2 text-center text-sm font-medium leading-snug text-cv-mute"><Icon size={18} className="text-cv-blue" strokeWidth={1.75} aria-hidden />{label}</li>;
          })}
        </ul>
      </div>
    </section>
  );
}
