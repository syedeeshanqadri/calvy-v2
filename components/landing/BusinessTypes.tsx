import { ALL_PACKS, type PackId } from "@/lib/packs";
import { FOR_PAGES } from "@/lib/forPages";
import { PackShowcase, type ShowcasePack } from "@/components/marketing/PackShowcase";
import { photoFor, type PhotoScene } from "@/lib/marketingConfig";
import { Section, Heading } from "@/components/marketing/ui";
import { Reveal } from "@/components/marketing/Reveal";

// Which photo scene suits which kind of business, when photos are switched on (lib/marketingConfig.ts).
const PHOTO: Record<PackId, PhotoScene> = { CLINIC: "hero-doctor", SALON_SPA: "salon", FITNESS: "trainer", LAWYER: "advisor", CONSULTANT: "advisor", OTHER: "team" };

/** What Calvy does for each kind of business, in that business's own words, as one tabbed showcase (the same wording as before). */
export function BusinessTypes() {
  const packs: ShowcasePack[] = ALL_PACKS.map((p) => {
    const token = p.defaultBookingMode === "TOKEN";
    const forPage = FOR_PAGES.find((f) => f.pack === p.id);
    return {
      id: p.id,
      label: p.label,
      title: p.label === "Other" ? "Any service business" : `${p.label} website and online booking`,
      bullets: [
        `Your ${p.terms.client.plural} book a ${p.terms.appointment.singular} online, and you manage your ${p.terms.staff.plural} and ${p.terms.service.plural} from one place.`,
        token ? "Token queue: patients take a number and you call the next one." : "Choose time slots that fit your day.",
        `Ready-made: ${p.defaultServices.map((s) => s.name).join(", ")}`,
      ],
      href: forPage ? `/for/${forPage.slug}` : null,
      more: `More for ${p.label.toLowerCase()}`,
      photos: { IN: photoFor(PHOTO[p.id], "india"), INTL: photoFor(PHOTO[p.id], "intl") },
    };
  });
  return (
    <Section id="business-types" tone="paper">
      <Reveal>
        <Heading
          title="A booking page and website that speak your language"
          intro="Pick your type when you sign up. Calvy sets up the right words, services and booking style for you, and you can change everything later."
        />
      </Reveal>
      <Reveal delay={0.08}><PackShowcase packs={packs} /></Reveal>
    </Section>
  );
}
