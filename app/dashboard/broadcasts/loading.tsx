import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { ShimmerCardGrid, ShimmerTable } from "@/components/ui/Shimmer";

export default function BroadcastsLoading() {
  return (
    <DashboardLayout title="Broadcasts" subtitle="Send offers and updates to your clients">
      <div className="max-w-2xl space-y-6">
        <ShimmerCardGrid cols={3} />
        <ShimmerTable rows={5} />
      </div>
    </DashboardLayout>
  );
}
