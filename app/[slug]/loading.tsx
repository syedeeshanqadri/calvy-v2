import { Shimmer, ShimmerCard } from "@/components/ui/Shimmer";

export default function TenantSiteLoading() {
  return (
    <main className="min-h-dvh bg-white" aria-busy="true" aria-label="Loading">
      <div className="flex items-center justify-between px-4 sm:px-8 h-16 border-b border-[#f0ede8]">
        <Shimmer className="h-6 w-32" />
        <Shimmer className="h-10 w-28 rounded-full" />
      </div>
      <div className="mx-auto w-full max-w-5xl px-4 sm:px-8 py-10 space-y-8">
        <div className="space-y-3">
          <Shimmer className="h-9 w-3/4 max-w-md" />
          <Shimmer className="h-4 w-full max-w-lg" />
          <Shimmer className="h-12 w-40 rounded-full mt-4" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <ShimmerCard key={i}>
              <Shimmer className="h-4 w-28 mb-3" />
              <Shimmer className="h-3 w-full mb-2" />
              <Shimmer className="h-3 w-2/3" />
            </ShimmerCard>
          ))}
        </div>
      </div>
    </main>
  );
}
