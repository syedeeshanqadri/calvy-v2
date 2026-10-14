import { cn } from "@/lib/utils";
import { Card } from "./Card";
import type { LucideIcon } from "lucide-react";

interface StatCardProps {
  label: string;
  value: string | number;
  change?: string;
  changeType?: "up" | "down" | "neutral";
  icon: LucideIcon;
  iconColor?: string;
  className?: string;
}

export function StatCard({ label, value, change, changeType = "up", icon: Icon, iconColor = "#fef3c7", className }: StatCardProps) {
  return (
    <Card className={cn("p-5", className)}>
      <div className="flex items-start justify-between mb-4">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: iconColor }}>
          <Icon size={18} className="text-brand-800 opacity-70" />
        </div>
        {change && (
          <span className={cn("text-xs font-medium px-2.5 py-1 rounded-full", changeType === "up" && "bg-green-50 text-green-700", changeType === "down" && "bg-red-50 text-red-600", changeType === "neutral" && "bg-gray-100 text-gray-600")}>
            {changeType === "up" ? "↑" : changeType === "down" ? "↓" : "—"} {change}
          </span>
        )}
      </div>
      <div className="font-syne font-bold text-2xl text-brand-900 tracking-tight leading-none mb-1">{value}</div>
      <div className="text-sm text-[#6b6b80]">{label}</div>
    </Card>
  );
}
