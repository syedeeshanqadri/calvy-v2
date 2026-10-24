import { cn } from "@/lib/utils";
import type { AppointmentStatus } from "@/types";

const statusConfig: Record<AppointmentStatus, { label: string; className: string }> = {
  confirmed: { label: "Confirmed", className: "bg-green-50 text-green-700 border border-green-200" },
  pending: { label: "Pending", className: "bg-amber-50 text-amber-700 border border-amber-200" },
  cancelled: { label: "Cancelled", className: "bg-red-50 text-red-600 border border-red-200" },
  completed: { label: "Completed", className: "bg-blue-50 text-blue-700 border border-blue-200" },
  "no-show": { label: "No Show", className: "bg-gray-100 text-gray-600 border border-gray-200" },
  pending_payment: { label: "Awaiting payment", className: "bg-amber-50 text-amber-700 border border-amber-200" },
  expired: { label: "Payment expired", className: "bg-gray-100 text-gray-500 border border-gray-200" },
};

export function StatusBadge({ status }: { status: AppointmentStatus }) {
  const config = statusConfig[status];
  return (
    <span className={cn("inline-flex items-center text-xs font-medium px-2.5 py-1 rounded-full", config.className)}>
      <span className="w-1.5 h-1.5 rounded-full bg-current mr-1.5 opacity-70" />
      {config.label}
    </span>
  );
}

export function Badge({ children, variant = "default", className }: { children: React.ReactNode; variant?: "default" | "accent" | "success" | "warning"; className?: string }) {
  const variants = {
    default: "bg-brand-800/8 text-brand-800",
    accent: "bg-accent/10 text-accent",
    success: "bg-green-50 text-green-700",
    warning: "bg-amber-50 text-amber-700",
  };
  return <span className={cn("inline-flex items-center text-xs font-medium px-2.5 py-1 rounded-full", variants[variant], className)}>{children}</span>;
}
