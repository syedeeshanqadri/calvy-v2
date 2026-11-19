import { Shimmer, ShimmerCard } from "@/components/ui/Shimmer";

/** A generic page-body skeleton: a heading, a row of stat cards and a list. Used by loading.tsx files whose layout stays on screen. */
export function PageSkeleton({ label = "Loading", cards = 3, rows = 5 }: { label?: string; cards?: number; rows?: number }) {
  return (
    <div aria-busy="true" aria-label={label} className="space-y-5 p-4 sm:p-6">
      <div className="space-y-2"><Shimmer className="h-7 w-48" /><Shimmer className="h-4 w-72 max-w-full" /></div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {Array.from({ length: cards }).map((_, i) => <ShimmerCard key={i}><Shimmer className="h-3 w-20 mb-3" /><Shimmer className="h-7 w-24" /></ShimmerCard>)}
      </div>
      <ShimmerCard className="space-y-3">
        {Array.from({ length: rows }).map((_, i) => <Shimmer key={i} className="h-10 w-full" />)}
      </ShimmerCard>
    </div>
  );
}
