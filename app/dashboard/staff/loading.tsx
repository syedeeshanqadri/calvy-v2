"use client";
import { useTerms } from "@/components/providers/TermsProvider";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { ShimmerCard, Shimmer } from "@/components/ui/Shimmer";

export default function StaffLoading() {
  const { t } = useTerms();
  return (
    <DashboardLayout title={t("staff", { plural: true, cap: true })} subtitle="Manage your team">
      <div className="flex justify-end mb-5">
        <Shimmer className="h-9 w-32 rounded-xl" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <ShimmerCard key={i}>
            <div className="flex items-center gap-3 mb-4">
              <Shimmer className="w-12 h-12 rounded-full flex-shrink-0" />
              <div className="flex-1">
                <Shimmer className="h-4 w-28 mb-1.5" />
                <Shimmer className="h-3 w-20" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 mb-4">
              <Shimmer className="h-12 rounded-xl" />
              <Shimmer className="h-12 rounded-xl" />
            </div>
            <Shimmer className="h-8 w-full rounded-xl" />
          </ShimmerCard>
        ))}
      </div>
    </DashboardLayout>
  );
}
