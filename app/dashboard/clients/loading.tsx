import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { ShimmerTable, ShimmerCard, Shimmer } from "@/components/ui/Shimmer";

export default function ClientsLoading() {
  return (
    <DashboardLayout title="Clients" subtitle="Your client directory">
      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-5">
        {Array.from({ length: 4 }).map((_, i) => (
          <ShimmerCard key={i}>
            <Shimmer className="h-3 w-16 mb-3" />
            <Shimmer className="h-7 w-12" />
          </ShimmerCard>
        ))}
      </div>
      {/* Search */}
      <div className="flex gap-3 mb-5">
        <Shimmer className="h-9 flex-1 max-w-xs rounded-xl" />
        <Shimmer className="h-9 w-24 rounded-xl ml-auto" />
      </div>
      <ShimmerTable rows={8} cols={5} />
    </DashboardLayout>
  );
}
