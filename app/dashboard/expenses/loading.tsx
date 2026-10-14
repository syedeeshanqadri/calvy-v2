import { DashboardLayout } from "@/components/dashboard/DashboardLayout";

export default function Loading() {
  return (
    <DashboardLayout title="Expenses" subtitle="Track your business costs and profitability">
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="bg-white rounded-2xl border border-[#e8e6e0] p-4 animate-pulse">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-7 h-7 rounded-lg bg-[#f0ede8]" />
              <div className="h-3 bg-[#f0ede8] rounded w-28" />
            </div>
            <div className="h-6 bg-[#f0ede8] rounded w-24" />
          </div>
        ))}
      </div>
      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-2xl border border-[#e8e6e0] animate-pulse h-96" />
        <div className="bg-white rounded-2xl border border-[#e8e6e0] animate-pulse h-64" />
      </div>
    </DashboardLayout>
  );
}
