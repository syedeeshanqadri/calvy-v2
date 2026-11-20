"use client";
import { useEffect, useRef } from "react";
import { Check } from "lucide-react";
import { LEVEL_LABEL, type LevelId } from "@/lib/rewards/levels";
import { barPercent, feeLines, ladderSteps, progressWords } from "@/lib/my/levelUi";
import { LevelIcon } from "@/components/my/LevelIcons";

/**
 * The hero of /account: where the customer is on the Calvy level ladder. Five steps (past ones ticked, the current one filled marigold, the rest muted),
 * a bar that fills to the next level in plain words (never a number), the level's perk, and (only where a nominal fee applies to them) one line about it.
 * On a narrow phone the ladder scrolls sideways and opens with the current level in view.
 */
export function LevelHero({ level, perk, feeApplies, progressRatio }: { level: LevelId; perk: string | null; feeApplies: boolean; progressRatio: number }) {
  const steps = ladderSteps(level);
  const atTop = level === "LEGEND";
  const words = progressWords(progressRatio, atTop);
  const pct = barPercent(progressRatio, atTop);
  const next = steps.find((s) => s.state === "next");
  const rail = useRef<HTMLOListElement>(null);

  // Bring the current level into view inside the ladder only (never scrolls the page).
  useEffect(() => {
    const el = rail.current?.querySelector<HTMLElement>('[aria-current="step"]');
    const box = rail.current;
    if (el && box) box.scrollTo({ left: el.offsetLeft - (box.clientWidth - el.clientWidth) / 2, behavior: "auto" });
  }, [level]);

  return (
    <section aria-labelledby="level-title" data-testid="level-hero" className="acct-card overflow-hidden">
      <div className="bg-cv-blue px-5 pt-6 pb-7 text-center text-white sm:px-8">
        <p className="font-dm text-xs font-semibold uppercase tracking-[0.14em] text-white/70">Your Calvy level</p>
        <div className="mt-3 flex flex-col items-center gap-3">
          <span className="grid h-16 w-16 place-items-center rounded-full bg-cv-marigold text-cv-ink shadow-[0_8px_24px_-8px_rgba(232,163,23,.7)]"><LevelIcon level={level} size={34} /></span>
          <h2 id="level-title" data-testid="level-name" className="font-display text-3xl font-bold leading-none sm:text-4xl">{LEVEL_LABEL[level]}</h2>
          {perk && <p className="max-w-md text-sm text-white/85">{perk}</p>}
          {feeLines(level, feeApplies).map((l) => <p key={l} data-testid="fee-line" className="max-w-md text-sm text-white/85">{l}</p>)}
        </div>
      </div>

      <div className="px-4 pb-6 pt-5 sm:px-8">
        <ol ref={rail} aria-label="Calvy levels" className="acct-scroll -mx-4 flex snap-x snap-mandatory gap-1 overflow-x-auto px-4 sm:mx-0 sm:justify-between sm:overflow-visible sm:px-0">
          {steps.map((s, i) => (
            <li key={s.id} aria-current={s.state === "current" ? "step" : undefined} data-state={s.state} style={{ ["--i" as string]: i }}
              className="acct-step flex min-w-[3.9rem] flex-1 snap-center flex-col items-center gap-1.5 text-center">
              <span className={`relative grid h-12 w-12 place-items-center rounded-full border-2 transition-colors ${
                s.state === "current" ? "border-cv-marigold bg-cv-marigold text-cv-ink"
                : s.state === "done" ? "border-cv-blue bg-cv-blue-tint text-cv-blue"
                : s.state === "next" ? "border-dashed border-cv-blue/50 bg-white text-cv-blue/70"
                : "border-cv-line bg-white text-cv-mute/60"}`}>
                <LevelIcon level={s.id} size={24} />
                {s.state === "done" && <span className="absolute -right-1 -top-1 grid h-5 w-5 place-items-center rounded-full bg-cv-blue text-white ring-2 ring-white"><Check size={12} strokeWidth={3} aria-label="Reached" /></span>}
              </span>
              <span className={`text-xs font-semibold ${s.state === "current" ? "text-cv-ink" : s.state === "locked" ? "text-cv-mute/70" : "text-cv-mute"}`}>{s.label}</span>
              <span className="sr-only">{s.state === "done" ? "reached" : s.state === "current" ? "your level" : s.state === "next" ? "next level" : "locked"}</span>
            </li>
          ))}
        </ol>

        <div className="mt-6">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span data-testid="progress-words" className="font-semibold text-cv-ink">{words}</span>
            {next && <span className="text-cv-mute">Next: {next.label}</span>}
          </div>
          <div role="progressbar" aria-label={`Progress to ${next?.label ?? "the next level"}`} aria-valuetext={words} className="mt-2 h-3 overflow-hidden rounded-full bg-cv-blue-tint">
            <div className="acct-bar-fill h-full rounded-full bg-cv-marigold" style={{ ["--acct-w" as string]: `${pct}%` }} />
          </div>
          <p className="mt-3 text-xs text-cv-mute">Visits count once the business marks them attended. Moving a booking is always free.</p>
        </div>
      </div>
    </section>
  );
}
