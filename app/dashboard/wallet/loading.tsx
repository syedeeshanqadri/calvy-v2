import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { ShimmerTable, ShimmerCard, Shimmer } from "@/components/ui/Shimmer";

export default function WalletLoading() {
  return (
    <DashboardLayout title="Wallet" subtitle="Your earnings">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        {Array.from({ length: 3 }).map((_, i) => (
          <ShimmerCard key={i} className={i === 0 ? "sm:col-span-1" : ""}>
            <Shimmer className="h-3 w-24 mb-3" />
            <Shimmer className="h-9 w-32 mb-1" />
            <Shimmer className="h-3 w-20" />
          </ShimmerCard>
        ))}
      </div>
      <ShimmerTable rows={7} cols={4} />
    </DashboardLayout>
  );
}
