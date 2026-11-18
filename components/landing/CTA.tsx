import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { DemoButton } from "./DemoButton";
import { ReminderCard, StatusCard } from "@/components/marketing/Mockups";

export function CTA() {
  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-sky-600 via-sky-700 to-indigo-800 py-14 sm:py-20">
      <div className="absolute inset-0 pointer-events-none" aria-hidden>
        <div className="absolute -top-32 -right-24 w-[520px] h-[520px] rounded-full bg-white/10 blur-3xl" />
        <div className="absolute -bottom-40 -left-24 w-[480px] h-[480px] rounded-full bg-sky-300/20 blur-3xl" />
        <div className="absolute inset-0 opacity-[0.07]" style={{ backgroundImage: "radial-gradient(#fff 1px, transparent 1px)", backgroundSize: "30px 30px" }} />
      </div>
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid lg:grid-cols-5 gap-10 lg:gap-14 items-center">
        <div className="lg:col-span-3 text-center lg:text-left">
          <h2 className="font-syne font-extrabold text-3xl sm:text-4xl lg:text-5xl text-white tracking-tight text-balance">Stop losing clients to missed bookings</h2>
          <p className="mt-5 text-sky-100 text-lg max-w-xl mx-auto lg:mx-0">Put your website and booking page online today. Start free, add your services, and share one link with your customers. No tech skills needed.</p>
          <ul className="mt-6 flex flex-wrap justify-center lg:justify-start gap-x-6 gap-y-2 text-sm text-sky-100">
            {["Free plan", "No credit card", "Cancel anytime"].map((t) => (
              <li key={t} className="flex items-center gap-1.5"><Check size={15} aria-hidden /> {t}</li>
            ))}
          </ul>
          <div className="mt-8 flex flex-col sm:flex-row items-stretch sm:items-center justify-center lg:justify-start gap-3">
            <Link href="/signup" className="group inline-flex items-center justify-center gap-2 bg-white text-sky-700 hover:bg-sky-50 font-bold px-8 min-h-12 rounded-2xl transition-all shadow-xl hover:-translate-y-0.5 text-base">
              Start free <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
            </Link>
            <DemoButton source="cta-demo" className="inline-flex items-center justify-center gap-2 min-h-12 border border-white/30 text-white hover:bg-white/10 font-semibold px-8 rounded-2xl transition-all text-base">
              Book a personal demo
            </DemoButton>
          </div>
        </div>
        <div className="lg:col-span-2 hidden sm:flex flex-col items-center gap-4" aria-hidden>
          <div className="self-center lg:self-end"><StatusCard queue appointmentWord="appointment" /></div>
          <div className="self-center lg:self-start"><ReminderCard appointmentWord="appointment" /></div>
        </div>
      </div>
    </section>
  );
}
