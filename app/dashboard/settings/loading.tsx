import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { ShimmerForm, ShimmerCard, Shimmer } from "@/components/ui/Shimmer";

export default function SettingsLoading() {
  return (
    <DashboardLayout title="Settings" subtitle="Manage your business profile">
      <div className="max-w-2xl space-y-6">
        <ShimmerForm fields={4} />
        <ShimmerCard>
          <Shimmer className="h-5 w-40 mb-6" />
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between">
                <div>
                  <Shimmer className="h-4 w-32 mb-1.5" />
                  <Shimmer className="h-3 w-48" />
                </div>
                <Shimmer className="h-6 w-10 rounded-full flex-shrink-0" />
              </div>
            ))}
          </div>
        </ShimmerCard>
      </div>
    </DashboardLayout>
  );
}
