"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, Calendar, Users, CalendarDays, CreditCard,
  BarChart2, Wrench, Link2, ChevronLeft, SlidersHorizontal,
  Sparkles, UserCog, Wallet, Globe, Megaphone, Receipt, LifeBuoy,
} from "lucide-react";
import Image from "next/image";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Appointments", href: "/dashboard/appointments", icon: Calendar },
  { label: "Clients", href: "/dashboard/clients", icon: Users },
  { label: "Staff", href: "/dashboard/staff", icon: UserCog },
  { label: "Calendar", href: "/dashboard/calendar", icon: CalendarDays },
  { label: "Payments", href: "/dashboard/payments", icon: CreditCard },
  { label: "Wallet", href: "/dashboard/wallet", icon: Wallet },
  { label: "Analytics", href: "/dashboard/analytics", icon: BarChart2 },
  { label: "Expenses", href: "/dashboard/expenses", icon: Receipt },
  { label: "Services", href: "/dashboard/services", icon: Wrench },
  { label: "Broadcasts", href: "/dashboard/broadcasts", icon: Megaphone },
  { label: "Booking Page", href: "/dashboard/booking-page", icon: Link2 },
  { label: "Website", href: "/dashboard/website", icon: Globe },
  { label: "Billing", href: "/dashboard/billing", icon: Sparkles },
  { label: "Support", href: "/dashboard/support", icon: LifeBuoy },
  { label: "Settings", href: "/dashboard/settings", icon: SlidersHorizontal },
];

interface SidebarProps { collapsed?: boolean; onToggle?: () => void; }

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const pathname = usePathname();

  return (
    <aside className={cn("flex flex-col bg-white h-dvh border-r border-[#e8e6e0] transition-all duration-300", collapsed ? "w-16" : "w-64")}>
      {/* Logo */}
      <div className={cn("flex items-center h-16 px-4 border-b border-[#e8e6e0]", collapsed ? "justify-center" : "justify-between")}>
        {!collapsed && (
          <Link href="/">
            <Image src="/calvy.svg" alt="Calvy" width={80} height={24} />
          </Link>
        )}
        {collapsed && <Image src="/calvy.svg" alt="Calvy" width={28} height={28} />}
        <button
          onClick={onToggle}
          className={cn("p-1.5 rounded-lg text-[#6b6b80] hover:text-[#0f0f1a] hover:bg-[#f8f7f4] transition-colors", collapsed && "rotate-180")}
        >
          <ChevronLeft size={16} />
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 min-h-0 py-4 px-2 space-y-0.5 overflow-y-auto">
        {!collapsed && <p className="text-[10px] font-bold tracking-[2px] text-[#b0b0c0] uppercase px-3 pb-2">Main</p>}
        {NAV_ITEMS.slice(0, 4).map((item) => {
          const isActive = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href));
          return (
            <Link
              key={item.label}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 group relative",
                isActive ? "bg-sky-50 text-sky-700" : "text-[#6b6b80] hover:text-[#0f0f1a] hover:bg-[#f8f7f4]",
                collapsed && "justify-center"
              )}
            >
              <item.icon size={18} className={cn("flex-shrink-0 transition-transform group-hover:scale-110", isActive && "text-sky-600")} />
              {!collapsed && <span className="text-sm font-medium">{item.label}</span>}
            </Link>
          );
        })}

        {!collapsed && <p className="text-[10px] font-bold tracking-[2px] text-[#b0b0c0] uppercase px-3 pb-2 pt-4">Business</p>}
        {NAV_ITEMS.slice(4).map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href);
          return (
            <Link
              key={item.label}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 group",
                isActive ? "bg-sky-50 text-sky-700" : "text-[#6b6b80] hover:text-[#0f0f1a] hover:bg-[#f8f7f4]",
                collapsed && "justify-center"
              )}
            >
              <item.icon size={18} className={cn("flex-shrink-0", isActive && "text-sky-600")} />
              {!collapsed && <span className="text-sm font-medium">{item.label}</span>}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
