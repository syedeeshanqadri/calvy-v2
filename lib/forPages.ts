// The /for/<business type> landing pages. Wording comes from the pack (the same words the dashboard uses); only what the product really does.
import { getPack } from "@/lib/packs";
import type { PackId } from "@/lib/packs/types";

/** Made-up example content for the page graphics (not a real business). */
export interface ForSample { business: string; tagline: string; services: { name: string; duration: string }[]; people: string[]; queue: boolean }
export interface ForPage { slug: string; pack: PackId; what: string; points: string[]; sample: ForSample }

export const FOR_PAGES: ForPage[] = [
  { slug: "clinic", pack: "CLINIC", what: "clinics and doctors",
    points: ["Token queue: patients take a number online and see their place in line live, and you call the next one from your phone.", "Or use time slots, or both, from one booking link.", "Online consultations with a joining link, and free follow-up visits for a number of days you choose.", "Reminders by email, WhatsApp on Pro and Business, and push alerts for you.", "Reception and doctor logins with their own roles."], sample: { business: "Sunrise Family Clinic", tagline: "Book a visit or take a token", services: [{ name: "General consultation", duration: "15 min" }, { name: "Follow-up visit", duration: "10 min" }, { name: "Online consultation", duration: "20 min" }], people: ["Dr. Rao", "Dr. Iyer", "Dr. Khan"], queue: true } },
  { slug: "salon", pack: "SALON_SPA", what: "salons and spas",
    points: ["Clients pick a service, a stylist and a time slot, any time of day.", "Book more than one service in a single visit.", "Reminders by email, and by WhatsApp on Pro and Business, to cut no-shows.", "Your colours and logo on your website, with photos on paid plans.", "Staff logins with roles, and a phone app for today's list."], sample: { business: "Glow Beauty Studio", tagline: "Pick a service, a stylist and a time", services: [{ name: "Haircut and style", duration: "45 min" }, { name: "Facial", duration: "60 min" }, { name: "Manicure", duration: "30 min" }], people: ["Meera", "Sana", "Aditi"], queue: false } },
  { slug: "lawyer", pack: "LAWYER", what: "lawyers and law practices",
    points: ["Clients book a consultation with the right advocate at a time that suits both.", "Offer meetings in person, online or both, with a joining link.", "Confirmations and reminders by email, and by WhatsApp on Pro and Business.", "Take an advance or full payment into your own gateway on Pro and Business.", "Calendar invites with every confirmation."], sample: { business: "Bhat and Associates", tagline: "Book a consultation with an advocate", services: [{ name: "First consultation", duration: "30 min" }, { name: "Document review", duration: "45 min" }, { name: "Online meeting", duration: "30 min" }], people: ["Adv. Bhat", "Adv. Mir", "Adv. Dar"], queue: false } },
  { slug: "fitness", pack: "FITNESS", what: "gyms, studios and trainers",
    points: ["Members book sessions with a trainer online.", "Group sessions where several people share one slot, on the Business plan.", "Reminders by email, and by WhatsApp on Pro and Business.", "Trainer logins with roles, and a phone app for the day's sessions.", "A website with your classes, team and hours."], sample: { business: "Pulse Fitness Studio", tagline: "Reserve your next session", services: [{ name: "Personal training", duration: "60 min" }, { name: "Group class", duration: "45 min" }, { name: "Trial session", duration: "30 min" }], people: ["Imran", "Zoya", "Karan"], queue: false } },
  { slug: "consultant", pack: "CONSULTANT", what: "consultants and independent professionals",
    points: ["Clients book a consultation online, in person or by video.", "A simple website and booking link you can share anywhere.", "Confirmations and reminders by email, and by WhatsApp on Pro and Business.", "Take payment into your own gateway on Pro and Business.", "Push alerts on your phone when a booking comes in."], sample: { business: "Nair Advisory", tagline: "Book a session, in person or by video", services: [{ name: "Intro call", duration: "20 min" }, { name: "Strategy session", duration: "60 min" }, { name: "Follow-up", duration: "30 min" }], people: ["Anita", "Rohan"], queue: false } },
];

export const forPageBySlug = (slug: string) => FOR_PAGES.find((p) => p.slug === slug) ?? null;

const an = (w: string) => (/^[aeiou]/i.test(w) ? "an" : "a");

export function forPageCopy(p: ForPage) {
  const pack = getPack(p.pack);
  const t = pack.terms;
  return {
    title: `Website and online booking for ${p.what} | Calvy`,
    h1: `A free website and online booking page for ${p.what}`,
    description: `Build a free website and booking page for your ${t.business.singular}. Your ${t.client.plural} book ${an(t.appointment.singular)} ${t.appointment.singular} online, and you manage your ${t.staff.plural} and ${t.service.plural} from one dashboard and a phone app.`,
    intro: `Your ${t.client.plural} book ${an(t.appointment.singular)} ${t.appointment.singular} online at any hour, and you manage your ${t.staff.plural} and ${t.service.plural} from one place. The free plan has no monthly fee. Calvy uses the right words for your ${t.business.singular}, and you can change everything later.`,
  };
}
