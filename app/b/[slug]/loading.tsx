import { Shimmer, ShimmerCard } from "@/components/ui/Shimmer";

export default function BookingLoading() {
  return (
    <main className="min-h-dvh" aria-busy="true" aria-label="Loading booking page">
      <div className="mx-auto w-full max-w-2xl p-4 sm:p-6 space-y-4">
        <div className="flex items-center gap-3 py-2">
          <Shimmer className="w-12 h-12 rounded-2xl flex-shrink-0" />
          <div className="flex-1">
            <Shimmer className="h-5 w-40 mb-2" />
            <Shimmer className="h-3 w-56 max-w-full" />
          </div>
        </div>
        {Array.from({ length: 4 }).map((_, i) => (
          <ShimmerCard key={i}>
            <div className="flex items-center justify-between gap-4">
              <div className="flex-1">
                <Shimmer className="h-4 w-36 mb-2" />
                <Shimmer className="h-3 w-24" />
              </div>
              <Shimmer className="h-6 w-16" />
            </div>
          </ShimmerCard>
        ))}
        <Shimmer className="h-12 w-full rounded-full" />
      </div>
    </main>
  );
}
