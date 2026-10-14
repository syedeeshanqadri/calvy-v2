import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { ShimmerCard, Shimmer } from "@/components/ui/Shimmer";

export default function CalendarLoading() {
  return (
    <DashboardLayout title="Calendar">
      {/* Toolbar */}
      <div className="flex items-center gap-3 mb-5">
        <Shimmer className="h-9 w-24 rounded-xl" />
        <Shimmer className="h-6 w-40" />
        <Shimmer className="h-9 w-24 rounded-xl" />
        <div className="ml-auto flex gap-2">
          <Shimmer className="h-9 w-20 rounded-xl" />
          <Shimmer className="h-9 w-20 rounded-xl" />
          <Shimmer className="h-9 w-24 rounded-xl" />
        </div>
      </div>
      <ShimmerCard className="p-0 overflow-hidden">
        {/* Day header */}
        <div className="grid grid-cols-7 border-b border-[#f0ede8]">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(d => (
            <div key={d} className="p-3 text-center">
              <Shimmer className="h-3 w-8 mx-auto rounded" />
            </div>
          ))}
        </div>
        {/* Calendar grid */}
        <div className="grid grid-cols-7">
          {Array.from({ length: 35 }).map((_, i) => (
            <div key={i} className="border-r border-b border-[#f5f3ef] p-2 min-h-[100px]">
              <Shimmer className="h-5 w-5 rounded-lg mb-2" />
              {i % 4 === 0 && <Shimmer className="h-6 w-full rounded-lg mb-1" />}
              {i % 6 === 1 && <Shimmer className="h-6 w-4/5 rounded-lg" />}
            </div>
          ))}
        </div>
      </ShimmerCard>
    </DashboardLayout>
  );
}
