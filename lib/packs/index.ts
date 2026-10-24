import { PACK_IDS, packSchema, type Pack, type PackId } from "./types";

const t = (singular: string, plural = `${singular}s`) => ({ singular, plural });

const PACKS: Record<PackId, Pack> = {
  CLINIC: {
    id: "CLINIC", label: "Clinic",
    terms: {
      client: t("patient"), staff: t("doctor"), service: t("consultation"),
      appointment: t("appointment"), business: t("clinic"),
    },
    icons: { pack: "Stethoscope", client: "User", staff: "UserRound", service: "ClipboardList", appointment: "CalendarClock" },
    defaultBookingMode: "TOKEN",
  },
  SALON_SPA: {
    id: "SALON_SPA", label: "Salon & Spa",
    terms: {
      client: t("client"), staff: t("stylist"), service: t("service"),
      appointment: t("appointment"), business: t("salon"),
    },
    icons: { pack: "Scissors", client: "User", staff: "Brush", service: "Sparkles", appointment: "CalendarClock" },
    defaultBookingMode: "SLOT",
  },
  LAWYER: {
    id: "LAWYER", label: "Lawyer",
    terms: {
      client: t("client"), staff: t("advocate"), service: t("consultation"),
      appointment: t("meeting"), business: t("practice", "practices"),
    },
    icons: { pack: "Scale", client: "User", staff: "Briefcase", service: "FileText", appointment: "CalendarClock" },
    defaultBookingMode: "SLOT",
  },
  FITNESS: {
    id: "FITNESS", label: "Fitness",
    terms: {
      client: t("member"), staff: t("trainer"), service: t("session"),
      appointment: t("booking"), business: t("studio"),
    },
    icons: { pack: "Dumbbell", client: "User", staff: "Medal", service: "Timer", appointment: "CalendarClock" },
    defaultBookingMode: "SLOT",
  },
  OTHER: {
    id: "OTHER", label: "Other",
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
