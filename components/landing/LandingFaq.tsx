import Link from "next/link";
import { LANDING_FAQ } from "@/lib/landingFaq";
import { FOR_PAGES } from "@/lib/forPages";
import { ReminderCard, TodayMock } from "@/components/marketing/Mockups";
import { SUPPORT_EMAIL } from "@/lib/site";

export function LandingFaq() {
  return (
    <section id="faq" className="py-14 sm:py-20 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-2xl mx-auto mb-10 sm:mb-14">
          <span className="inline-block bg-sky-100 text-sky-700 text-xs font-bold tracking-widest uppercase px-4 py-2 rounded-full mb-4">FAQ</span>
          <h2 className="font-syne font-extrabold text-3xl sm:text-4xl tracking-tight text-gray-900 text-balance">Frequently asked questions</h2>
          <p className="mt-3 text-gray-600 text-lg">Straight answers about plans, payments and how Calvy works.</p>
        </div>
        <div className="grid lg:grid-cols-5 gap-8 lg:gap-12 items-start">
          <div className="lg:col-span-2 lg:sticky lg:top-28">
            <div className="relative rounded-3xl bg-gradient-to-br from-sky-100 via-white to-indigo-100 px-6 pt-10 pb-14 sm:px-10">
              <TodayMock sample={FOR_PAGES[0].sample} clientWord="patient" />
              <div className="absolute -bottom-5 left-1/2 -translate-x-1/2 hidden sm:block"><ReminderCard appointmentWord="appointment" /></div>
            </div>
            <p className="mt-10 text-center text-sm text-gray-600">Still have a question? <a href={`mailto:${SUPPORT_EMAIL}`} className="font-semibold text-sky-700 underline">{SUPPORT_EMAIL}</a></p>
          </div>
          <div className="lg:col-span-3">
            <div className="space-y-3">
              {LANDING_FAQ.map((f) => (
                <details key={f.q} className="group bg-gray-50 rounded-2xl border border-gray-100 open:bg-white open:shadow-md transition-shadow">
                  <summary className="cursor-pointer list-none min-h-12 px-6 py-4 font-semibold text-gray-900 text-[15px] flex items-center justify-between gap-4">
                    {f.q}
                    <span aria-hidden className="text-sky-700 text-xl leading-none group-open:rotate-45 transition-transform">+</span>
                  </summary>
                  <p className="px-6 pb-5 text-sm text-gray-600 leading-relaxed">{f.a}</p>
                </details>
              ))}
            </div>
            <p className="mt-8">
              <Link href="/signup" className="inline-flex items-center justify-center min-h-12 px-8 rounded-2xl bg-sky-700 hover:bg-sky-800 text-white font-bold">Start free</Link>
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
