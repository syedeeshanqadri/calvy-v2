import type { LevelId } from "@/lib/rewards/levels";

/** One coded line-art icon per level (24x24, stroke only, currentColor). They are decorative: the level's name is always written beside them. */
const PATHS: Record<LevelId, React.ReactNode> = {
  // Sprout: a start.
  STARTER: <><path d="M12 21v-9" /><path d="M12 12c0-3.6-2.6-6-6.5-6 0 3.9 2.6 6 6.5 6Z" /><path d="M12 14.5c0-3 2.2-5 5.5-5 0 3.3-2.2 5-5.5 5Z" /></>,
  // Ribbon: regular.
  REGULAR: <><circle cx="12" cy="9" r="5.5" /><path d="m9 13.6-1.8 7 4.8-2.6 4.8 2.6-1.8-7" /></>,
  // Key: insider access.
  INSIDER: <><circle cx="8" cy="12" r="3.8" /><path d="M11.8 12H21" /><path d="M17.5 12v3" /><path d="M20.8 12v2.2" /></>,
  // Shield with a tick: pro.
  PRO: <><path d="M12 3 4.5 6v5.4c0 4.4 3 8 7.5 9.6 4.5-1.6 7.5-5.2 7.5-9.6V6L12 3Z" /><path d="m8.8 12 2.4 2.4 4.2-4.6" /></>,
  // Crown: legend.
  LEGEND: <><path d="m3.5 8.5 4.6 4 3.9-7 3.9 7 4.6-4-1.6 9.5H5.1L3.5 8.5Z" /><path d="M5.5 20.5h13" /></>,
};

export function LevelIcon({ level, size = 28, className }: { level: LevelId; size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className} data-level-icon={level}>
      {PATHS[level]}
    </svg>
  );
}
