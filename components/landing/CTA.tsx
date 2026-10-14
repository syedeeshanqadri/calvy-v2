import Link from "next/link";
import { ArrowRight, TrendingUp } from "lucide-react";

export function CTA() {
  return (
    <section className="py-16 px-4 sm:px-6 lg:px-8 bg-gray-50">
      <div className="max-w-4xl mx-auto">
        <div className="relative rounded-3xl overflow-hidden bg-sky-700">
          {/* Subtle light overlay — removes gradient, keeps depth */}
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute top-0 right-0 w-96 h-96 rounded-full opacity-10" style={{ background: "radial-gradient(circle, #fff 0%, transparent 70%)", transform: "translate(30%, -30%)" }} />
            <div className="absolute bottom-0 left-0 w-64 h-64 rounded-full opacity-[0.07]" style={{ background: "radial-gradient(circle, #fff 0%, transparent 70%)", transform: "translate(-30%, 30%)" }} />
          </div>
          <div className="relative px-8 py-16 text-center">
            <div className="inline-flex items-center gap-2 bg-white/10 border border-white/20 rounded-full px-4 py-2 mb-6 text-white/80 text-sm font-medium">
              <TrendingUp size={14} className="text-white/70" /> 147 businesses signed up this week
            </div>
            <h2 className="font-syne font-extrabold text-4xl lg:text-5xl text-white tracking-tight mb-4">
              Stop losing clients to missed bookings
            </h2>
            <p className="text-sky-200 text-lg mb-10 max-w-lg mx-auto">
              Join 12,000+ businesses that stopped managing bookings on WhatsApp. Your booking page is ready in 60 seconds — no tech skills needed.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-4">
              <Link href="/signup" className="inline-flex items-center gap-2 bg-white text-sky-700 hover:bg-sky-50 font-bold px-8 py-4 rounded-2xl transition-all shadow-xl hover:-translate-y-0.5 group text-base">
                Get your booking page free
                <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
              </Link>
              <Link href="/demo" className="inline-flex items-center gap-2 border border-white/30 text-white hover:bg-white/10 font-semibold px-8 py-4 rounded-2xl transition-all text-base">
                Watch a demo
              </Link>
            </div>
            <p className="text-sky-300 text-sm mt-6">14-day free trial · No credit card · Cancel anytime</p>
          </div>
        </div>
      </div>
    </section>
  );
}
