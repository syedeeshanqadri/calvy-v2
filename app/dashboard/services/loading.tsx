"use client";
import { useTerms } from "@/components/providers/TermsProvider";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { ShimmerCard, Shimmer } from "@/components/ui/Shimmer";

export default function ServicesLoading() {
  const { t } = useTerms();
  return (
    <DashboardLayout title={t("service", { plural: true, cap: true })} subtitle="Manage your offerings">
      <div className="flex justify-end mb-5">
        <Shimmer className="h-9 w-32 rounded-xl" />
      </div>
      <div className="space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <ShimmerCard key={i} className="flex items-center gap-4 py-4">
            <Shimmer className="w-3 h-14 rounded-full flex-shrink-0" />
            <div className="flex-1">
              <Shimmer className="h-4 w-36 mb-2" />
              <Shimmer className="h-3 w-48" />
            </div>
            <div className="flex items-center gap-6 mr-4">
              <div>
                <Shimmer className="h-3 w-12 mb-1.5" />
                <Shimmer className="h-5 w-16" />
              </div>
              <div>
                <Shimmer className="h-3 w-12 mb-1.5" />
                <Shimmer className="h-5 w-10" />
              </div>
            </div>
            <div className="flex gap-2">
              <Shimmer className="h-8 w-16 rounded-xl" />
              <Shimmer className="h-8 w-16 rounded-xl" />
            </div>
          </ShimmerCard>
        ))}
      </div>
    </DashboardLayout>
  );
}
