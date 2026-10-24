import { Dumbbell, Scale, Scissors, Stethoscope, Store, type LucideIcon } from "lucide-react";
import type { PackId } from "@/lib/packs/types";

/** Icon per pack for the picker (the pack's `icons.pack` key, resolved without a dynamic import). */
export const PACK_ICON: Record<PackId, LucideIcon> = {
  CLINIC: Stethoscope,
  SALON_SPA: Scissors,
  LAWYER: Scale,
  FITNESS: Dumbbell,
  OTHER: Store,
};
