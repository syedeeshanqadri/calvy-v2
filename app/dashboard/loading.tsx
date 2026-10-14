import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { ShimmerKPICards, ShimmerTable, ShimmerChart, ShimmerCard, Shimmer } from "@/components/ui/Shimmer";

export default function DashboardLoading() {
  return (
    <DashboardLayout title="Dashboard">
      <ShimmerKPICards />
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 mb-6">
        <div className="xl:col-span-2">
          <ShimmerTable rows={6} cols={4} />
        </div>
        <div className="flex flex-col gap-6">
          {/* Mini calendar */}
          <ShimmerCard>
            <Shimmer className="h-4 w-32 mb-4" />
            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: 35 }).map((_, i) => (
                <Shimmer key={i} className="h-7 w-full rounded-lg" />
              ))}
            </div>
          </ShimmerCard>
          {/* Quick actions */}
          <ShimmerCard>
            <Shimmer className="h-4 w-28 mb-4" />
            <div className="space-y-2">
              <Shimmer className="h-10 w-full rounded-xl" />
              <Shimmer className="h-10 w-full rounded-xl" />
            </div>
          </ShimmerCard>
        </div>
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2">
          <ShimmerChart height="h-72" />
        </div>
        <ShimmerCard>
          <Shimmer className="h-4 w-24 mb-4" />
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <Shimmer className="w-8 h-8 rounded-full flex-shrink-0" />
                <div className="flex-1">
                  <Shimmer className="h-3 w-24 mb-1.5" />
                  <Shimmer className="h-3 w-16" />
                </div>
                <Shimmer className="h-5 w-8 rounded-lg" />
              </div>
            ))}
          </div>
        </ShimmerCard>
      </div>
    </DashboardLayout>
  );
}
