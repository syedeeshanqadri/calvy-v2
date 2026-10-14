import { cn } from "@/lib/utils";

export function Shimmer({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <div
      className={cn("rounded-xl bg-[#ebebeb]", className)}
      style={{
        backgroundImage: "linear-gradient(90deg, #ebebeb 25%, #f5f5f5 50%, #ebebeb 75%)",
        backgroundSize: "800px 100%",
        animation: "shimmer 1.6s ease-in-out infinite",
        ...style,
      }}
    />
  );
}

export function ShimmerCard({ className, children }: { className?: string; children?: React.ReactNode }) {
  return (
    <div className={cn("bg-white rounded-2xl border border-[#e8e6e0] p-5", className)}>
      {children}
    </div>
  );
}

/** 4-column KPI stat cards */
export function ShimmerKPICards() {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      {Array.from({ length: 4 }).map((_, i) => (
        <ShimmerCard key={i}>
          <Shimmer className="h-3 w-20 mb-4" />
          <Shimmer className="h-8 w-28 mb-2" />
          <Shimmer className="h-3 w-16" />
        </ShimmerCard>
      ))}
    </div>
  );
}

/** Table skeleton */
export function ShimmerTable({ rows = 7, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <ShimmerCard className="p-0 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-[#f0ede8]">
        <Shimmer className="h-5 w-36" />
        <div className="flex gap-2">
          <Shimmer className="h-8 w-24 rounded-lg" />
          <Shimmer className="h-8 w-24 rounded-lg" />
        </div>
      </div>
      {/* Rows */}
      <div className="divide-y divide-[#f5f3ef]">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-5 py-3.5">
            {Array.from({ length: cols }).map((_, j) => (
              <Shimmer key={j} className={cn("h-4", j === 0 ? "w-32 flex-shrink-0" : "flex-1")} />
            ))}
          </div>
        ))}
      </div>
    </ShimmerCard>
  );
}

/** Card grid (services, staff, etc.) */
export function ShimmerCardGrid({ count = 6, cols = 3 }: { count?: number; cols?: number }) {
  return (
    <div className={cn("grid gap-4", cols === 2 ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3")}>
      {Array.from({ length: count }).map((_, i) => (
        <ShimmerCard key={i}>
          <div className="flex items-center gap-3 mb-4">
            <Shimmer className="w-10 h-10 rounded-xl flex-shrink-0" />
            <div className="flex-1">
              <Shimmer className="h-4 w-28 mb-1.5" />
              <Shimmer className="h-3 w-20" />
            </div>
          </div>
          <Shimmer className="h-3 w-full mb-2" />
          <Shimmer className="h-3 w-3/4" />
        </ShimmerCard>
      ))}
    </div>
  );
}

/** Chart area */
export function ShimmerChart({ height = "h-64" }: { height?: string }) {
  return (
    <ShimmerCard className="p-0 overflow-hidden">
      <div className="px-5 py-4 border-b border-[#f0ede8]">
        <Shimmer className="h-5 w-32 mb-1" />
        <Shimmer className="h-3 w-48" />
      </div>
      <div className={cn("p-5", height)}>
        <Shimmer className="h-full w-full rounded-xl" />
      </div>
    </ShimmerCard>
  );
}

/** Form section */
export function ShimmerForm({ fields = 5 }: { fields?: number }) {
  return (
    <ShimmerCard>
      <Shimmer className="h-5 w-40 mb-6" />
      <div className="space-y-5">
        {Array.from({ length: fields }).map((_, i) => (
          <div key={i}>
            <Shimmer className="h-3 w-24 mb-2" />
            <Shimmer className="h-10 w-full rounded-xl" />
          </div>
        ))}
        <Shimmer className="h-10 w-32 rounded-xl mt-2" />
      </div>
    </ShimmerCard>
  );
}
