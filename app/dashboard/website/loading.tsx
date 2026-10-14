import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { ShimmerCard, Shimmer } from "@/components/ui/Shimmer";

export default function WebsiteLoading() {
  return (
    <DashboardLayout title="Website" subtitle="Your business website">
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Editor panels */}
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <ShimmerCard key={i}>
              <Shimmer className="h-4 w-28 mb-4" />
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, j) => (
                  <div key={j}>
                    <Shimmer className="h-3 w-20 mb-1.5" />
                    <Shimmer className="h-9 w-full rounded-xl" />
                  </div>
                ))}
              </div>
            </ShimmerCard>
          ))}
        </div>
        {/* Preview */}
        <div className="xl:col-span-2">
          <ShimmerCard className="p-0 overflow-hidden h-full min-h-[500px]">
            <div className="h-10 border-b border-[#f0ede8] flex items-center px-4 gap-1.5">
              {["w-3", "w-3", "w-3"].map((w, i) => (
                <Shimmer key={i} className={`h-3 ${w} rounded-full`} />
              ))}
              <Shimmer className="h-5 flex-1 mx-3 rounded-md" />
            </div>
            <Shimmer className="w-full rounded-none" style={{ minHeight: "460px" }} />
          </ShimmerCard>
        </div>
      </div>
    </DashboardLayout>
  );
}
