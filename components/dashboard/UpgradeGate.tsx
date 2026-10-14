import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Lock, Zap } from "lucide-react";
import Link from "next/link";

interface UpgradeGateProps {
  title: string;
  subtitle?: string;
  description: string;
}

export function UpgradeGate({ title, subtitle, description }: UpgradeGateProps) {
  return (
    <DashboardLayout title={title} subtitle={subtitle}>
      <div className="flex items-start justify-start pt-4">
        <div className="bg-white rounded-2xl border border-[#e8e6e0] p-8 text-center max-w-md w-full">
          <div className="w-14 h-14 rounded-2xl bg-sky-50 flex items-center justify-center text-[#0284c7] mx-auto mb-5">
            <Lock size={24} />
          </div>
          <h2 className="font-syne font-bold text-lg text-[#0f0f1a] mb-2">Plan upgrade required</h2>
          <p className="text-sm text-[#6b6b80] leading-relaxed mb-6">{description}</p>
          <Link
            href="/dashboard/billing"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-accent text-white text-sm font-semibold rounded-xl hover:bg-accent-hover transition-colors"
          >
            <Zap size={15} />
            Upgrade your plan
          </Link>
        </div>
      </div>
    </DashboardLayout>
  );
}
