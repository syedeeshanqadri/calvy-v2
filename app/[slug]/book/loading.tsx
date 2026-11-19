import { Shimmer, ShimmerCard } from "@/components/ui/Shimmer";

export default function BookingLoading() {
  return (
    <main className="min-h-dvh bg-white" aria-busy="true" aria-label="Loading booking">
      <div className="mx-auto w-full max-w-xl px-4 py-8 space-y-5">
        <Shimmer className="h-7 w-48" />
        <Shimmer className="h-2 w-full rounded-full" />
        {Array.from({ length: 4 }).map((_, i) => <ShimmerCard key={i}><Shimmer className="h-5 w-40 mb-2" /><Shimmer className="h-4 w-full" /></ShimmerCard>)}
        <Shimmer className="h-12 w-full rounded-full" />
      </div>
    </main>
  );
}
