import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { ShimmerTable, ShimmerCard, Shimmer } from "@/components/ui/Shimmer";

export default function PaymentsLoading() {
  return (
    <DashboardLayout title="Payments" subtitle="Track your revenue">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <ShimmerCard key={i}>
            <Shimmer className="h-3 w-20 mb-3" />
            <Shimmer className="h-7 w-24" />
          </ShimmerCard>
        ))}
      </div>
      <ShimmerTable rows={8} cols={5} />
    </DashboardLayout>
  );
}
