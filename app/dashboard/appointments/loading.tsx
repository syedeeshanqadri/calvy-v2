"use client";
import { useTerms } from "@/components/providers/TermsProvider";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { ShimmerTable, Shimmer } from "@/components/ui/Shimmer";

export default function AppointmentsLoading() {
  const { t } = useTerms();
  return (
    <DashboardLayout title={t("appointment", { plural: true, cap: true })} subtitle="Manage your bookings">
      {/* Filter/search bar */}
      <div className="flex items-center gap-3 mb-5">
        <Shimmer className="h-9 flex-1 max-w-xs rounded-xl" />
        <Shimmer className="h-9 w-28 rounded-xl" />
        <Shimmer className="h-9 w-28 rounded-xl" />
        <Shimmer className="h-9 w-32 rounded-xl ml-auto" />
      </div>
      <ShimmerTable rows={8} cols={6} />
    </DashboardLayout>
  );
}
