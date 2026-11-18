// The /for/<business type> landing pages. Wording comes from the pack (the same words the dashboard uses); only what the product really does.
import { getPack } from "@/lib/packs";
import type { PackId } from "@/lib/packs/types";

export interface ForPage { slug: string; pack: PackId; what: string; points: string[] }

export const FOR_PAGES: ForPage[] = [
  { slug: "clinic", pack: "CLINIC", what: "clinics and doctors",
    points: ["Token queue: patients take a number online and see their place in line live, and you call the next one from your phone.", "Or use time slots, or both, from one booking link.", "Online consultations with a joining link, and free follow-up visits for a number of days you choose.", "Reminders by email, WhatsApp on Pro and Business, and push alerts for you.", "Reception and doctor logins with their own roles."] },
  { slug: "salon", pack: "SALON_SPA", what: "salons and spas",
    points: ["Clients pick a service, a stylist and a time slot, any time of day.", "Book more than one service in a single visit.", "Reminders by email, and by WhatsApp on Pro and Business, to cut no-shows.", "Your colours and logo on your website, with photos on paid plans.", "Staff logins with roles, and a phone app for today's list."] },
  { slug: "lawyer", pack: "LAWYER", what: "lawyers and law practices",
    points: ["Clients book a consultation with the right advocate at a time that suits both.", "Offer meetings in person, online or both, with a joining link.", "Confirmations and reminders by email, and by WhatsApp on Pro and Business.", "Take an advance or full payment into your own gateway on Pro and Business.", "Calendar invites with every confirmation."] },
  { slug: "fitness", pack: "FITNESS", what: "gyms, studios and trainers",
    points: ["Members book sessions with a trainer online.", "Group sessions where several people share one slot, on the Business plan.", "Reminders by email, and by WhatsApp on Pro and Business.", "Trainer logins with roles, and a phone app for the day's sessions.", "A website with your classes, team and hours."] },
  { slug: "consultant", pack: "CONSULTANT", what: "consultants and independent professionals",
    points: ["Clients book a consultation online, in person or by video.", "A simple website and booking link you can share anywhere.", "Confirmations and reminders by email, and by WhatsApp on Pro and Business.", "Take payment into your own gateway on Pro and Business.", "Push alerts on your phone when a booking comes in."] },
];

export const forPageBySlug = (slug: string) => FOR_PAGES.find((p) => p.slug === slug) ?? null;

export function forPageCopy(p: ForPage) {
  const pack = getPack(p.pack);
  const t = pack.terms;
  return {
    title: `Website and online booking for ${p.what} | Calvy`,
    h1: `A free website and online booking page for ${p.what}`,
    description: `Build a free website and booking page for your ${t.business.singular}. Your ${t.client.plural} book a ${t.appointment.singular} online, and you manage your ${t.staff.plural} and ${t.service.plural} from one dashboard and a phone app.`,
    intro: `Your ${t.client.plural} book a ${t.appointment.singular} online at any hour, and you manage your ${t.staff.plural} and ${t.service.plural} from one place. The free plan has no monthly fee. Calvy uses the right words for your ${t.business.singular}, and you can change everything later.`,
  };
}
