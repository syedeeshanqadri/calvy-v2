import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Shimmer, ShimmerCard } from "@/components/ui/Shimmer";

export default function QueueLoading() {
  return (
    <DashboardLayout title="Queue" subtitle="Call the next token, handle no-shows, add walk-ins">
      <div className="max-w-2xl space-y-4" role="status" aria-label="Loading the queue">
        <ShimmerCard className="space-y-3"><Shimmer className="h-3 w-12" /><Shimmer className="h-11 w-full sm:w-56" /></ShimmerCard>
        <ShimmerCard className="space-y-4"><Shimmer className="h-3 w-24" /><div className="flex items-center gap-4"><Shimmer className="h-12 w-20" /><div className="flex-1 space-y-2"><Shimmer className="h-5 w-2/3" /><Shimmer className="h-4 w-1/2" /></div></div><Shimmer className="h-14 w-full rounded-2xl" /></ShimmerCard>
        <ShimmerCard className="space-y-3"><Shimmer className="h-3 w-20" />{[0, 1, 2].map((i) => <Shimmer key={i} className="h-12 w-full" />)}</ShimmerCard>
      </div>
    </DashboardLayout>
  );
}
