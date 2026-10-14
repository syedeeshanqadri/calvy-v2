import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { ShimmerKPICards, ShimmerChart, ShimmerCard, Shimmer } from "@/components/ui/Shimmer";

export default function AnalyticsLoading() {
  return (
    <DashboardLayout title="Analytics" subtitle="Business insights">
      <ShimmerKPICards />
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-6">
        <ShimmerChart height="h-64" />
        <ShimmerChart height="h-64" />
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2">
          <ShimmerChart height="h-56" />
        </div>
        <ShimmerCard>
          <Shimmer className="h-4 w-32 mb-4" />
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <Shimmer className="w-8 h-8 rounded-xl flex-shrink-0" />
                <div className="flex-1">
                  <Shimmer className="h-3 w-24 mb-1.5" />
                  <Shimmer className="h-2 w-full rounded-full" />
                </div>
                <Shimmer className="h-4 w-10" />
              </div>
            ))}
          </div>
        </ShimmerCard>
      </div>
    </DashboardLayout>
  );
}
