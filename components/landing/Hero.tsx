"use client";
import Link from "next/link";
import { ArrowRight, Star, Check, Bell, DollarSign } from "lucide-react";
import { ProductCarousel } from "./ProductCarousel";
import { ClientPhone, OwnerPhone } from "./PhoneMockups";
import { HeroLeadForm } from "./HeroLeadForm";

/* ─── Hero section ───────────────────────────────────────────── */
export function Hero() {
  return (
    <section className="relative bg-white overflow-hidden pt-16">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 right-0 w-[700px] h-[700px] rounded-full opacity-[0.06]" style={{ background: "radial-gradient(circle, #0284c7 0%, transparent 70%)" }} />
        <div className="absolute -bottom-20 -left-20 w-[500px] h-[500px] rounded-full opacity-[0.04]" style={{ background: "radial-gradient(circle, #0284c7 0%, transparent 70%)" }} />
        <div className="absolute inset-0 opacity-[0.4]" style={{ backgroundImage: "radial-gradient(#d1d5db 1px, transparent 1px)", backgroundSize: "28px 28px" }} />
      </div>

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14 lg:py-16">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-start">

          {/* Left — copy */}
          <div className="min-w-0">
            <div className="inline-flex items-center gap-2 bg-sky-50 border border-sky-100 text-sky-700 rounded-full px-4 py-2 mb-6 text-sm font-medium">
              <span className="w-2 h-2 rounded-full bg-sky-500 animate-pulse" />
              Trusted by 12,000+ service businesses
            </div>

            <h1 className="font-syne font-extrabold text-4xl sm:text-5xl lg:text-6xl leading-[1.05] tracking-tight text-gray-900 mb-6">
              Your clients book,{" "}
              <span className="relative">
                <span className="relative z-10" style={{ background: "linear-gradient(135deg, #0284c7 0%, #0ea5e9 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
                  pay & show up
                </span>
                <span className="absolute bottom-1 left-0 right-0 h-3 bg-sky-100 rounded -z-10 opacity-60" />
              </span>
              {" "}— on autopilot
            </h1>

            <p className="text-lg sm:text-xl text-gray-500 leading-relaxed mb-8 max-w-lg">
              Stop managing bookings over WhatsApp. Calvy gives you a booking page, business website, and payment collection — ready in 60 seconds.
            </p>

            <div className="mb-5">
              <HeroLeadForm />
            </div>
            <div className="mb-6">
              <Link href="/#demo" className="inline-flex items-center gap-1.5 min-h-11 text-sky-700 font-semibold text-sm hover:gap-2.5 transition-all">
                Or book a personal demo <ArrowRight size={15} />
              </Link>
            </div>

            <div className="flex flex-col gap-2.5 mb-10">
              {["Free forever plan", "No credit card required", "Cancel anytime"].map(t => (
                <div key={t} className="flex items-center gap-2.5 text-sm text-gray-500">
                  <div className="w-5 h-5 rounded-full bg-green-50 border border-green-200 flex items-center justify-center flex-shrink-0">
                    <Check size={11} className="text-green-600" strokeWidth={3} />
                  </div>
                  {t}
                </div>
              ))}
            </div>

            <div className="flex items-center gap-4">
              <div className="flex -space-x-2">
                {[
                  { initials: "JM", color: "#0284c7" },
                  { initials: "RC", color: "#0ea5e9" },
                  { initials: "SR", color: "#ec4899" },
                  { initials: "MB", color: "#f59e0b" },
                  { initials: "TK", color: "#10b981" },
                ].map(({ initials, color }) => (
                  <div key={initials} className="w-9 h-9 rounded-full border-2 border-white flex items-center justify-center text-[10px] text-white font-bold shadow-sm" style={{ background: color }}>
                    {initials}
                  </div>
                ))}
              </div>
              <div>
                <div className="flex items-center gap-1 mb-0.5">
                  {Array(5).fill(0).map((_, i) => <Star key={i} size={13} className="text-amber-400 fill-amber-400" />)}
                  <span className="text-sm font-bold text-gray-800 ml-1">4.9</span>
                </div>
                <p className="text-xs text-gray-500">from 2,400+ reviews</p>
              </div>
            </div>
          </div>

          {/* Right — live product carousel */}
          <div className="relative min-w-0 mt-6 lg:mt-0">
            {/* Floating accent cards (desktop) */}
            <div className="hidden lg:flex absolute -top-6 -left-5 z-20 bg-white rounded-2xl p-4 shadow-xl border border-gray-100 items-center gap-3" style={{ animation: "float 5s ease-in-out infinite" }}>
              <div className="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center">
                <DollarSign size={20} className="text-green-600" />
              </div>
              <div>
                <div className="font-syne font-bold text-base leading-none text-gray-900">+$1,240</div>
                <div className="text-xs text-gray-500 mt-0.5">Revenue today</div>
              </div>
            </div>

            <div className="hidden lg:flex absolute -top-6 -right-5 z-20 bg-white rounded-2xl p-4 shadow-xl border border-gray-100 items-center gap-3" style={{ animation: "float 5s ease-in-out infinite 2.5s" }}>
              <div className="w-10 h-10 rounded-xl bg-sky-50 flex items-center justify-center">
                <Bell size={18} className="text-sky-600" />
              </div>
              <div>
                <div className="font-syne font-bold text-base leading-none text-gray-900">Reminder sent</div>
                <div className="text-xs text-gray-500 mt-0.5">Sarah confirmed ✓</div>
              </div>
            </div>

            <div className="xl:mx-14">
              <ProductCarousel />
            </div>

            {/* Client booking phone — bottom-left */}
            <div className="hidden xl:block absolute z-30" style={{ bottom: -10, left: -28, transform: "rotate(-6deg)", transformOrigin: "bottom center" }}>
              <ClientPhone />
              <div className="mt-2 text-center">
                <span className="inline-block bg-gray-100 text-gray-500 text-[9px] font-semibold px-2.5 py-1 rounded-full">Client view</span>
              </div>
            </div>

            {/* Owner app phone — bottom-right */}
            <div className="hidden xl:block absolute z-30" style={{ bottom: -10, right: -28, transform: "rotate(6deg)", transformOrigin: "bottom center" }}>
              <OwnerPhone />
              <div className="mt-2 text-center">
                <span className="inline-block bg-gray-100 text-gray-500 text-[9px] font-semibold px-2.5 py-1 rounded-full">Owner app</span>
              </div>
            </div>
          </div>

        </div>
      </div>
    </section>
  );
}
