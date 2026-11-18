import Link from "next/link";
import { LANDING_FAQ } from "@/lib/landingFaq";
import { Phone, Section, Heading } from "@/components/marketing/ui";
import { SUPPORT_EMAIL } from "@/lib/site";

export function LandingFaq() {
  return (
    <Section id="faq" tone="card">
      <Heading title="Frequently asked questions" intro="Straight answers about plans, payments and how Calvy works." />
      <div className="grid lg:grid-cols-5 gap-10 lg:gap-14 items-start">
        <div className="lg:col-span-2 lg:sticky lg:top-28">
          <Phone name="today" alt="Calvy Today screen: the day's bookings in one list" crop className="max-w-[240px]" />
          <p className="mt-6 text-sm text-cv-mute">Still have a question? <a href={`mailto:${SUPPORT_EMAIL}`} className="font-semibold text-cv-blue underline underline-offset-4">{SUPPORT_EMAIL}</a></p>
        </div>
        <div className="lg:col-span-3">
          <div className="space-y-3">
            {LANDING_FAQ.map((f) => (
              <details key={f.q} className="group rounded-xl border border-cv-line bg-cv-paper open:bg-white">
                <summary className="cursor-pointer list-none min-h-12 px-6 py-4 font-semibold text-cv-ink text-[15px] flex items-center justify-between gap-4">
                  {f.q}
                  <span aria-hidden className="text-cv-blue text-xl leading-none group-open:rotate-45 transition-transform">+</span>
                </summary>
                <p className="px-6 pb-5 m-0 text-sm text-cv-mute leading-relaxed">{f.a}</p>
              </details>
            ))}
          </div>
          <p className="mt-8">
            <Link href="/signup" className="inline-flex items-center justify-center min-h-12 px-8 rounded-xl bg-cv-blue hover:bg-cv-blue-dark text-white font-semibold">Start free</Link>
          </p>
        </div>
      </div>
    </Section>
  );
}
