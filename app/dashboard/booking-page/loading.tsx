import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { ShimmerCard, Shimmer } from "@/components/ui/Shimmer";

export default function BookingPageLoading() {
  return (
    <DashboardLayout title="Booking Page" subtitle="Your public booking link">
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Link card */}
        <div className="space-y-4">
          <ShimmerCard>
            <Shimmer className="h-4 w-32 mb-3" />
            <div className="flex gap-2">
              <Shimmer className="h-10 flex-1 rounded-xl" />
              <Shimmer className="h-10 w-20 rounded-xl" />
            </div>
          </ShimmerCard>
          <ShimmerCard>
            <Shimmer className="h-4 w-28 mb-4" />
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i}>
                  <Shimmer className="h-3 w-24 mb-1.5" />
                  <Shimmer className="h-10 w-full rounded-xl" />
                </div>
              ))}
              <Shimmer className="h-10 w-32 rounded-xl mt-2" />
            </div>
          </ShimmerCard>
        </div>
        {/* Preview */}
        <ShimmerCard className="p-0 overflow-hidden">
          <div className="h-12 border-b border-[#f0ede8] flex items-center px-4 gap-1.5">
            {["w-3", "w-3", "w-3"].map((w, i) => (
              <Shimmer key={i} className={`h-3 ${w} rounded-full`} />
            ))}
            <Shimmer className="h-6 flex-1 mx-3 rounded-lg" />
          </div>
          <div className="p-6">
            <Shimmer className="h-32 w-full rounded-2xl mb-4" />
            <Shimmer className="h-5 w-40 mb-2 mx-auto" />
            <Shimmer className="h-3 w-56 mx-auto mb-6" />
            <div className="grid grid-cols-2 gap-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Shimmer key={i} className="h-16 rounded-xl" />
              ))}
            </div>
          </div>
        </ShimmerCard>
      </div>
    </DashboardLayout>
  );
}
