import { Stethoscope, Scissors, Scale, Dumbbell, UserRound, Briefcase, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { ALL_PACKS, type PackId } from "@/lib/packs";
import { FOR_PAGES } from "@/lib/forPages";

const ICONS: Record<PackId, LucideIcon> = {
  CLINIC: Stethoscope, SALON_SPA: Scissors, LAWYER: Scale, FITNESS: Dumbbell, CONSULTANT: UserRound, OTHER: Briefcase,
};

/** What Calvy does for each kind of business, in that business's own words (the same wording the dashboard uses). */
export function BusinessTypes() {
  return (
    <section id="business-types" className="py-16 sm:py-20 lg:py-24 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12 lg:mb-16">
          <span className="inline-block bg-sky-100 text-sky-700 text-xs font-bold tracking-widest uppercase px-4 py-2 rounded-full mb-4">Made for your business</span>
          <h2 className="font-syne font-extrabold text-3xl sm:text-4xl lg:text-5xl tracking-tight text-gray-900 mb-4">A booking page and website that speak your language</h2>
          <p className="text-gray-600 text-lg max-w-2xl mx-auto leading-relaxed">
            Pick your type when you sign up. Calvy sets up the right words, services and booking style for you, and you can change everything later.
          </p>
        </div>
        <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {ALL_PACKS.map((p) => {
            const Icon = ICONS[p.id];
            const token = p.defaultBookingMode === "TOKEN";
            return (
              <li key={p.id} className="bg-gray-50 rounded-2xl border border-gray-100 p-7">
                <div className="w-12 h-12 rounded-2xl bg-sky-100 flex items-center justify-center mb-5"><Icon size={22} className="text-sky-700" aria-hidden /></div>
                <h3 className="font-syne font-bold text-lg text-gray-900 mb-2">{p.label === "Other" ? "Any service business" : `${p.label} website and online booking`}</h3>
                <p className="text-sm text-gray-600 leading-relaxed mb-4">
                  Your {p.terms.client.plural} book a {p.terms.appointment.singular} online, and you manage your {p.terms.staff.plural} and {p.terms.service.plural} from one place.
                  {token ? " Token queue: patients take a number and you call the next one." : " Choose time slots that fit your day."}
                </p>
                <p className="text-xs text-gray-500">Ready-made: {p.defaultServices.map((s) => s.name).join(", ")}</p>
                {FOR_PAGES.find((f) => f.pack === p.id) && <Link href={`/for/${FOR_PAGES.find((f) => f.pack === p.id)!.slug}`} className="mt-3 inline-flex items-center min-h-11 text-sm font-semibold text-sky-700 underline">More for {p.label.toLowerCase()}</Link>}
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
