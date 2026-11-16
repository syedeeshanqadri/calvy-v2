import Link from "next/link";
import { LANDING_FAQ } from "@/lib/landingFaq";

export function LandingFaq() {
  return (
    <section id="faq" className="py-16 sm:py-20 lg:py-24 bg-white">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        <h2 className="font-syne font-extrabold text-3xl sm:text-4xl tracking-tight text-gray-900 text-center mb-10">Frequently asked questions</h2>
        <div className="space-y-3">
          {LANDING_FAQ.map((f) => (
            <details key={f.q} className="group bg-gray-50 rounded-2xl border border-gray-100">
              <summary className="cursor-pointer list-none min-h-12 px-6 py-4 font-semibold text-gray-900 text-[15px] flex items-center justify-between gap-4">
                {f.q}
                <span aria-hidden className="text-sky-700 text-xl leading-none group-open:rotate-45 transition-transform">+</span>
              </summary>
              <p className="px-6 pb-5 text-sm text-gray-600 leading-relaxed">{f.a}</p>
            </details>
          ))}
        </div>
        <p className="text-center mt-8">
          <Link href="/signup" className="inline-flex items-center justify-center min-h-12 px-8 rounded-2xl bg-sky-700 hover:bg-sky-800 text-white font-bold">Start free</Link>
        </p>
      </div>
    </section>
  );
}
