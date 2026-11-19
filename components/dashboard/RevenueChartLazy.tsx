"use client";
import dynamic from "next/dynamic";

// recharts is the heaviest thing on the home dashboard and sits below the fold: it loads after the first paint.
export const RevenueChart = dynamic(() => import("@/components/dashboard/RevenueChart").then((m) => m.RevenueChart), {
  ssr: false,
  loading: () => <div aria-busy="true" aria-label="Loading revenue chart" className="animate-pulse rounded-2xl bg-[#f0ede8] h-72" />,
});
