import { Check, ArrowRight } from "lucide-react";
import { HeroLeadForm } from "./HeroLeadForm";
import { DemoButton } from "./DemoButton";
import { Phone, WRAP } from "@/components/marketing/ui";

/* Hero: left-aligned heading in solid ink, one marigold highlight, one real booking-page screenshot in a phone frame. */
export function Hero() {
  return (
    <section className="bg-cv-paper pt-16">
      <div className={`${WRAP} py-12 sm:py-16 lg:py-20`}>
        <div className="grid grid-cols-1 lg:grid-cols-[1.15fr_0.85fr] gap-12 lg:gap-16 items-center">
          <div className="min-w-0">
            <p className="m-0 mb-6 text-sm font-semibold text-cv-blue">Free booking page and website for service businesses</p>
            <h1 className="font-display font-bold text-4xl sm:text-5xl lg:text-6xl leading-[1.05] tracking-tight text-cv-ink mb-6 text-balance">
              Your clients book,{" "}
              <mark className="bg-cv-marigold/45 text-cv-ink px-1.5 -mx-1.5 box-decoration-clone">pay &amp; show up</mark>
              {" "}— on autopilot
            </h1>
            <p className="text-lg sm:text-xl text-cv-mute leading-relaxed mb-8 max-w-xl">
              Build your business website and online booking page for free. Time slots or token queues, reminders on email, WhatsApp and push, and online payments, ready in minutes.
            </p>
            <div className="mb-5"><HeroLeadForm /></div>
            <div className="mb-8">
              <DemoButton source="hero-demo" className="inline-flex items-center gap-1.5 min-h-11 text-cv-blue font-semibold text-sm hover:underline">
                Or book a personal demo <ArrowRight size={15} />
              </DemoButton>
            </div>
            <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
              {["Free forever plan", "No credit card required", "Cancel anytime"].map((t) => (
                <li key={t} className="flex items-center gap-2.5 text-sm text-cv-mute">
                  <Check size={16} className="text-cv-blue shrink-0" strokeWidth={2.5} aria-hidden />
                  {t}
                </li>
              ))}
            </ul>
          </div>
          <div className="min-w-0">
            <Phone name="booking" alt="A Calvy booking page on a phone: choose a service and time" priority className="max-w-[300px]" />
          </div>
        </div>
      </div>
    </section>
  );
}
