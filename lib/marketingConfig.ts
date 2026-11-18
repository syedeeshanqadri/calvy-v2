// Marketing visuals: illustrations by default, photos when they exist and this flag is on.
//   NEXT_PUBLIC_MARKETING_PHOTOS=1  switches the hero (and later the tabs and spotlight) to photos from
//   public/marketing/photos/{india,intl}/<n>-<slug>-<pick>.webp, falling back to the illustration for any scene without a file.
import { existsSync } from "node:fs";
import { join } from "node:path";

export const MARKETING_PHOTOS = process.env.NEXT_PUBLIC_MARKETING_PHOTOS === "1";

export type PhotoScene = "hero-doctor" | "salon" | "trainer" | "advisor" | "at-home" | "team" | "faq" | "about";
const SCENE_NUM: Record<PhotoScene, number> = { "hero-doctor": 1, salon: 2, trainer: 3, advisor: 4, "at-home": 5, team: 6, faq: 7, about: 8 };

/** Which photo suits which kind of business: used by the home tabs and the hero of each /for page. */
export const PACK_PHOTO: Record<"CLINIC" | "SALON_SPA" | "FITNESS" | "LAWYER" | "CONSULTANT" | "OTHER", PhotoScene> = { CLINIC: "hero-doctor", SALON_SPA: "salon", FITNESS: "trainer", LAWYER: "advisor", CONSULTANT: "advisor", OTHER: "team" };

/** Both regions' photos for a scene (null when the flag is off or the file is missing). */
export function photosFor(scene: PhotoScene): { IN: string | null; INTL: string | null } {
  return { IN: photoFor(scene, "india"), INTL: photoFor(scene, "intl") };
}

/** Public path of the chosen photo for a scene and region, or null (flag off, or no file): the caller draws the illustration. Server only. */
export function photoFor(scene: PhotoScene, region: "india" | "intl"): string | null {
  if (!MARKETING_PHOTOS) return null;
  const rel = `/marketing/photos/${region}/${SCENE_NUM[scene]}-${scene}.webp`;
  return existsSync(join(process.cwd(), "public", rel)) ? rel : null;
}
