import type { PackId } from "@/lib/packs/types";

// One dynamic import per pack, so a tenant page ships only its own display font (plus Figtree for body text).
const DISPLAY: Record<PackId, () => Promise<{ font: { variable: string } }>> = {
  CLINIC: () => import("./clinic"),
  SALON_SPA: () => import("./salon"),
  LAWYER: () => import("./lawyer"),
  FITNESS: () => import("./fitness"),
  CONSULTANT: () => import("./consultant"),
  OTHER: () => import("./other"),
};

/** className carrying the `--font-st-body` and `--font-st-display` variables for a pack. */
export async function siteFontClasses(packId: PackId): Promise<string> {
  const [body, display] = await Promise.all([import("./body"), (DISPLAY[packId] ?? DISPLAY.OTHER)()]);
  return `${body.font.variable} ${display.font.variable}`;
}
