import { PACK_IDS, packSchema, type Pack, type PackId } from "./types";

const t = (singular: string, plural = `${singular}s`) => ({ singular, plural });

const PACKS: Record<PackId, Pack> = {
  CLINIC: {
    id: "CLINIC", label: "Clinic",
    blurb: "Patients, doctors and consultations", businessType: "clinic",
    placeholders: { serviceName: "e.g. General Consultation", serviceDescription: "e.g. First visit with the doctor, includes checkup" },
    staffRoles: ["Doctor", "Dentist", "Physiotherapist", "Nurse", "Receptionist"],
    defaultServices: [
      { name: "General Consultation", description: "Doctor consultation and advice", duration: 20, price: 50, category: "consultation", color: "#0ea5e9" },
      { name: "Follow-up Visit", description: "Short review of an earlier visit", duration: 15, price: 30, category: "consultation", color: "#22c55e" },
      { name: "Health Check-up", description: "Routine check-up and basic tests", duration: 30, price: 70, category: "consultation", color: "#f59e0b" },
    ],
    terms: {
      client: t("patient"), staff: t("doctor"), service: t("consultation"),
      appointment: t("appointment"), business: t("clinic"),
    },
    icons: { pack: "Stethoscope", client: "User", staff: "UserRound", service: "ClipboardList", appointment: "CalendarClock" },
    defaultBookingMode: "TOKEN",
  },
  SALON_SPA: {
    id: "SALON_SPA", label: "Salon & Spa",
    blurb: "Clients, stylists and services", businessType: "salon",
    placeholders: { serviceName: "e.g. Haircut & Style", serviceDescription: "e.g. Wash, cut and blow-dry" },
    staffRoles: ["Stylist", "Barber", "Beautician", "Therapist", "Nail Technician", "Receptionist"],
    defaultServices: [
      { name: "Haircut & Style", description: "Cut, wash and blow dry", duration: 45, price: 40, category: "haircare", color: "#e84545" },
      { name: "Facial", description: "Cleansing and relaxing facial", duration: 60, price: 60, category: "wellness", color: "#ec4899" },
      { name: "Massage", description: "Relaxing full-body massage", duration: 60, price: 70, category: "wellness", color: "#8b5cf6" },
    ],
    terms: {
      client: t("client"), staff: t("stylist"), service: t("service"),
      appointment: t("appointment"), business: t("salon"),
    },
    icons: { pack: "Scissors", client: "User", staff: "Brush", service: "Sparkles", appointment: "CalendarClock" },
    defaultBookingMode: "SLOT",
  },
  LAWYER: {
    id: "LAWYER", label: "Lawyer",
    blurb: "Clients, advocates and meetings", businessType: "lawyer",
    placeholders: { serviceName: "e.g. Initial Legal Consultation", serviceDescription: "e.g. 30-minute discussion of your case" },
    staffRoles: ["Advocate", "Senior Advocate", "Associate", "Legal Assistant", "Paralegal"],
    defaultServices: [
      { name: "Initial Consultation", description: "First meeting to review your matter", duration: 45, price: 100, category: "legal", color: "#6366f1" },
      { name: "Document Review", description: "Contract or agreement review", duration: 60, price: 150, category: "legal", color: "#ec4899" },
      { name: "Case Strategy Meeting", description: "Plan next steps for an ongoing case", duration: 60, price: 200, category: "legal", color: "#f59e0b" },
    ],
    terms: {
      client: t("client"), staff: t("advocate"), service: t("consultation"),
      appointment: t("meeting"), business: t("practice", "practices"),
    },
    icons: { pack: "Scale", client: "User", staff: "Briefcase", service: "FileText", appointment: "CalendarClock" },
    defaultBookingMode: "SLOT",
  },
  FITNESS: {
    id: "FITNESS", label: "Fitness",
    blurb: "Members, trainers and sessions", businessType: "fitness",
    placeholders: { serviceName: "e.g. Personal Training Session", serviceDescription: "e.g. One-on-one workout with a trainer" },
    staffRoles: ["Trainer", "Yoga Instructor", "Coach", "Nutritionist", "Receptionist"],
    defaultServices: [
      { name: "Personal Training", description: "One-on-one session with a trainer", duration: 60, price: 40, category: "training", color: "#ef4444" },
      { name: "Fitness Assessment", description: "Body metrics and goal setting", duration: 45, price: 25, category: "training", color: "#f59e0b" },
      { name: "Group Class", description: "Instructor-led group workout", duration: 60, price: 15, category: "class", color: "#14b8a6" },
    ],
    terms: {
      client: t("member"), staff: t("trainer"), service: t("session"),
      appointment: t("booking"), business: t("studio"),
    },
    icons: { pack: "Dumbbell", client: "User", staff: "Medal", service: "Timer", appointment: "CalendarClock" },
    defaultBookingMode: "SLOT",
  },
  OTHER: {
    id: "OTHER", label: "Other",
    blurb: "Clients, staff and services", businessType: "general",
    placeholders: { serviceName: "e.g. Standard Appointment", serviceDescription: "e.g. What the customer gets" },
    staffRoles: ["Staff", "Consultant", "Manager", "Receptionist"],
    defaultServices: [
      { name: "Consultation", description: "Initial consultation session", duration: 30, price: 50, category: "consulting", color: "#0284c7" },
      { name: "Standard Session", description: "Standard one-hour service", duration: 60, price: 80, category: "general", color: "#f97316" },
      { name: "Extended Session", description: "Longer in-depth session", duration: 120, price: 150, category: "general", color: "#22c55e" },
    ],
    terms: {
      client: t("client"), staff: t("staff", "staff"), service: t("service"),
      appointment: t("appointment"), business: t("business", "businesses"),
    },
    icons: { pack: "Store", client: "User", staff: "UserRound", service: "Tag", appointment: "CalendarClock" },
    defaultBookingMode: "SLOT",
  },
};

for (const id of PACK_IDS) packSchema.parse(PACKS[id]);

export function getPack(id: string | null | undefined): Pack {
  return id && id in PACKS ? PACKS[id as PackId] : PACKS.OTHER;
}

export const ALL_PACKS: readonly Pack[] = PACK_IDS.map((id) => PACKS[id]);

/** Legacy Business.businessType string -> pack (mirrors the migration backfill). */
export function packForBusinessType(businessType: string | null | undefined): PackId {
  switch (businessType) {
    case "clinic": case "dental": case "physio": case "therapy": return "CLINIC";
    case "salon": case "barbershop": case "spa": case "beauty": case "tattoo": return "SALON_SPA";
    case "fitness": return "FITNESS";
    case "lawyer": return "LAWYER";
    default: return "OTHER";
  }
}

export * from "./types";
