import { Stethoscope, Scissors, Scale, Dumbbell, UserRound, Briefcase, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { ALL_PACKS, type PackId } from "@/lib/packs";
import { FOR_PAGES } from "@/lib/forPages";
import { Section, Heading, Icon, Phone, Browser } from "@/components/marketing/ui";

const ICONS: Record<PackId, LucideIcon> = {
  CLINIC: Stethoscope, SALON_SPA: Scissors, LAWYER: Scale, FITNESS: Dumbbell, CONSULTANT: UserRound, OTHER: Briefcase,
};

// A real screen from the demo accounts beside each type, alternating sides. The same product for every type.
const SHOT: Record<PackId, { kind: "phone" | "browser"; name: string; alt: string }> = {
  CLINIC: { kind: "phone", name: "queue", alt: "The live token queue on a phone: who is being served and who is waiting" },
  SALON_SPA: { kind: "phone", name: "booking", alt: "A booking page: choose services, then a time" },
  LAWYER: { kind: "browser", name: "website", alt: "A business website with services, team and a Book Now button" },
  FITNESS: { kind: "phone", name: "today", alt: "The Today list with Arrived, Completed and No-show buttons" },
  CONSULTANT: { kind: "phone", name: "share", alt: "Sharing the booking link by WhatsApp, embed code or URL" },
  OTHER: { kind: "browser", name: "dashboard", alt: "The dashboard with the day's appointments and revenue" },
};

/** What Calvy does for each kind of business, in that business's own words (the same wording the dashboard uses). */
export function BusinessTypes() {
  return (
    <Section id="business-types" tone="card">
      <Heading
        title="A booking page and website that speak your language"
        intro="Pick your type when you sign up. Calvy sets up the right words, services and booking style for you, and you can change everything later."
      />
      <ul className="m-0 flex list-none flex-col gap-14 p-0 lg:gap-20">
        {ALL_PACKS.map((p, i) => {
          const token = p.defaultBookingMode === "TOKEN";
          const shot = SHOT[p.id];
          const forPage = FOR_PAGES.find((f) => f.pack === p.id);
          return (
            <li key={p.id} className="grid items-center gap-8 border-t border-cv-line pt-10 lg:grid-cols-2 lg:gap-16">
              <div className={`min-w-0 ${i % 2 ? "lg:order-2" : ""}`}>
                <Icon Svg={ICONS[p.id]} size={26} />
                <h3 className="mt-4 mb-3 font-display font-bold text-2xl text-cv-ink">{p.label === "Other" ? "Any service business" : `${p.label} website and online booking`}</h3>
                <p className="mb-4 leading-relaxed text-cv-mute">
                  Your {p.terms.client.plural} book a {p.terms.appointment.singular} online, and you manage your {p.terms.staff.plural} and {p.terms.service.plural} from one place.
                  {token ? " Token queue: patients take a number and you call the next one." : " Choose time slots that fit your day."}
                </p>
                <p className="mb-3 text-sm text-cv-mute">Ready-made: {p.defaultServices.map((s) => s.name).join(", ")}</p>
                {forPage && <Link href={`/for/${forPage.slug}`} className="inline-flex min-h-11 items-center text-sm font-semibold text-cv-blue underline underline-offset-4">More for {p.label.toLowerCase()}</Link>}
              </div>
              <div className={`min-w-0 ${i % 2 ? "lg:order-1" : ""}`}>
                {shot.kind === "phone" ? <Phone name={shot.name} alt={shot.alt} crop className="max-w-[240px]" /> : <Browser name={shot.name} alt={shot.alt} />}
              </div>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}
