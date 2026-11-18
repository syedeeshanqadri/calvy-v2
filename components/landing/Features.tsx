"use client";
import { Calendar, Bell, Globe, Users, Star, Smartphone, Repeat, CreditCard, Gift, Video, UserCircle, BarChart3, Layers, Megaphone, Palette, Receipt, type LucideIcon } from "lucide-react";
import { useRegion } from "./useRegion";
import type { Region } from "@/lib/pricing";

interface Feature { Icon: LucideIcon; title: string; desc: string; plan: string; bg: string; cls: string }

// Honest list: everything here exists in the product today. `plan` says which plans have it.
const BASE: Feature[] = [
  { Icon: Calendar, title: "Time slots and token queues", desc: "Let customers pick a time, or take a token and wait their turn, the way clinics and walk-in shops work. Both run from one booking link, with a live queue page for customers.", plan: "All plans", bg: "bg-sky-50", cls: "text-sky-600" },
  { Icon: Globe, title: "A free website, built for you", desc: "Every business gets a website with services, team, hours and a Book Now button. Edit the text, photos, colours and sections in the website builder.", plan: "All plans", bg: "bg-purple-50", cls: "text-purple-600" },
  { Icon: Bell, title: "Email, WhatsApp and push alerts", desc: "Confirmations and reminders by email on every plan, WhatsApp on Pro and Business, and instant push alerts on your phone.", plan: "Email: all plans · WhatsApp: Pro and Business", bg: "bg-green-50", cls: "text-green-600" },
  { Icon: Users, title: "Team roles", desc: "Add staff and receptionists with their own logins. Each person sees only what their role allows.", plan: "Pro and Business", bg: "bg-rose-50", cls: "text-rose-500" },
  { Icon: Star, title: "Reviews", desc: "Show your Google reviews link on your website and ask happy customers to leave one after a visit.", plan: "All plans", bg: "bg-amber-50", cls: "text-amber-600" },
  { Icon: Repeat, title: "Follow-ups", desc: "Offer a free follow-up visit for a set number of days after an appointment, and let customers book again in a tap.", plan: "All plans", bg: "bg-blue-50", cls: "text-blue-600" },
  { Icon: Gift, title: "Rewards", desc: "Customers who keep coming back earn rewards across Calvy businesses. There will be lots more rewards over time, for customers and for businesses.", plan: "All plans", bg: "bg-pink-50", cls: "text-pink-600" },
  { Icon: UserCircle, title: "A customer account", desc: "Customers see their bookings across businesses in one place, and can reschedule or cancel within each business's rules.", plan: "Free for customers", bg: "bg-teal-50", cls: "text-teal-600" },
  { Icon: Video, title: "Online consultations", desc: "Offer a service in person, online or both. Customers get the joining link once they are booked.", plan: "All plans", bg: "bg-cyan-50", cls: "text-cyan-600" },
  { Icon: Smartphone, title: "A business app on your phone", desc: "Install Calvy on your phone's home screen. See today's list, mark people arrived, and call the next token. It works like an app, with no app store needed.", plan: "All plans", bg: "bg-indigo-50", cls: "text-indigo-600" },
  { Icon: Palette, title: "Your brand and search listing", desc: "Your colours and logo on your site and emails, plus control over how your page appears in Google.", plan: "Pro and Business", bg: "bg-fuchsia-50", cls: "text-fuchsia-600" },
  { Icon: BarChart3, title: "Analytics, exports and expenses", desc: "See bookings and revenue at a glance, export your data to CSV and track expenses.", plan: "Pro and Business", bg: "bg-orange-50", cls: "text-orange-600" },
  { Icon: Layers, title: "Group and multi-service bookings", desc: "Let several people share one session, or book more than one service in a single visit. Calendar invites go out with every confirmation.", plan: "Multi-service: all plans · Group sessions: Business", bg: "bg-lime-50", cls: "text-lime-700" },
  { Icon: Megaphone, title: "Client database and broadcasts", desc: "Keep your clients in one place and send them a message about a new offer or a change of hours.", plan: "Business", bg: "bg-red-50", cls: "text-red-600" },
];

const PAYMENTS: Record<Region, Feature> = {
  IN: {
    Icon: CreditCard, title: "Online payments", plan: "Free",
    desc: "On the free plan customers pay a nominal confirmation fee when they book online, and pay for the service at your place. On Pro and Business there is no platform fee: connect your own payment account and customers pay you directly, in full or as an advance.",
    bg: "bg-emerald-50", cls: "text-emerald-600",
  },
  INTL: {
    Icon: CreditCard, title: "Online payments", plan: "Free: pay at your place · Pro and Business: your own gateway",
    desc: "On the free plan customers pay for the service at your place. On Pro and Business, connect your own Stripe or PayPal account and customers pay you directly, in full or as an advance, in your own currency. Calvy never holds your money.",
    bg: "bg-emerald-50", cls: "text-emerald-600",
  },
};

const RECEIPTS: Record<Region, Feature | null> = {
  IN: { Icon: Receipt, title: "Receipts", plan: "All plans", desc: "Customers get a receipt by email for the confirmation fee they pay, and Calvy plan payments come with an invoice you can download as a PDF.", bg: "bg-slate-50", cls: "text-slate-600" },
  INTL: null,
};

export function Features() {
  const region = useRegion();
  const extra = RECEIPTS[region];
  const features = [...BASE.slice(0, 7), PAYMENTS[region], ...BASE.slice(7), ...(extra ? [extra] : [])];
  return (
    <section id="features" className="py-16 sm:py-20 lg:py-24 bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12 lg:mb-16">
          <span className="inline-block bg-sky-100 text-sky-700 text-xs font-bold tracking-widest uppercase px-4 py-2 rounded-full mb-4">Features</span>
          <h2 className="font-syne font-extrabold text-3xl sm:text-4xl lg:text-5xl tracking-tight text-gray-900 mb-4">
            Everything you need to take bookings online
          </h2>
          <p className="text-gray-600 text-lg max-w-xl mx-auto leading-relaxed">
            Build your website and booking page for free. These are real features you can use today, and each card says which plan has it.
          </p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {features.map((f) => (
            <div key={f.title} className="bg-white p-7 rounded-2xl border border-gray-100 flex flex-col">
              <div className={`w-12 h-12 rounded-2xl ${f.bg} flex items-center justify-center mb-5`}>
                <f.Icon size={22} className={f.cls} aria-hidden />
              </div>
              <h3 className="font-syne font-bold text-base text-gray-900 mb-2">{f.title}</h3>
              <p className="text-sm text-gray-600 leading-relaxed flex-1">{f.desc}</p>
              <p className="mt-4 text-xs font-semibold text-gray-500">{f.plan}</p>
            </div>
          ))}
        </div>
              </div>
    </section>
  );
}
