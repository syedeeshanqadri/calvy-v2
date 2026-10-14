import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { ShimmerCard, Shimmer } from "@/components/ui/Shimmer";

export default function BillingLoading() {
  return (
    <DashboardLayout title="Billing & Plans" subtitle="Manage your subscription">
      <div className="space-y-6 max-w-5xl">
        {/* Current plan + usage */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <ShimmerCard>
            <Shimmer className="h-3 w-24 mb-4" />
            <div className="flex items-center gap-3">
              <Shimmer className="w-10 h-10 rounded-xl flex-shrink-0" />
              <div>
                <Shimmer className="h-5 w-28 mb-1.5" />
                <Shimmer className="h-3 w-16" />
              </div>
            </div>
          </ShimmerCard>
          <ShimmerCard>
            <Shimmer className="h-3 w-28 mb-4" />
            <div className="grid grid-cols-2 gap-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="bg-[#f8f7f4] rounded-xl p-3">
                  <Shimmer className="h-6 w-10 mb-1.5" />
                  <Shimmer className="h-3 w-20" />
                </div>
              ))}
            </div>
          </ShimmerCard>
        </div>
        {/* Plan cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <ShimmerCard key={i}>
              <div className="flex items-center gap-3 mb-4">
                <Shimmer className="w-9 h-9 rounded-xl flex-shrink-0" />
                <div>
                  <Shimmer className="h-4 w-24 mb-1.5" />
                  <Shimmer className="h-3 w-32" />
                </div>
              </div>
              <Shimmer className="h-9 w-20 mb-5" />
              <div className="space-y-2 mb-5">
                {Array.from({ length: 4 }).map((_, j) => (
                  <div key={j} className="flex items-center gap-2">
                    <Shimmer className="w-3.5 h-3.5 rounded-full flex-shrink-0" />
                    <Shimmer className="h-3 flex-1" />
                  </div>
                ))}
              </div>
              <Shimmer className="h-10 w-full rounded-xl" />
            </ShimmerCard>
          ))}
        </div>
      </div>
    </DashboardLayout>
  );
}
