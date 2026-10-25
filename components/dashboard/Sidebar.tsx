"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, Calendar, Users, CalendarDays, CreditCard,
  BarChart2, Wrench, Link2, ChevronLeft, SlidersHorizontal,
  Sparkles, UserCog, Wallet, Globe, Megaphone, Receipt, LifeBuoy, ListOrdered,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useFlags } from "@/components/providers/FlagsProvider";
import type { FeatureFlag } from "@/lib/flags";
import { Logo } from "@/components/ui/Logo";
import { useTerms } from "@/components/providers/TermsProvider";
import type { TermKey } from "@/lib/packs/types";

const NAV_ITEMS: { label: string; href: string; icon: typeof LayoutDashboard; flag?: FeatureFlag; term?: TermKey; tokenOnly?: boolean }[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Queue", href: "/dashboard/queue", icon: ListOrdered, tokenOnly: true },
  { term: "appointment", label: "Appointments", href: "/dashboard/appointments", icon: Calendar },
  { term: "client", label: "Clients", href: "/dashboard/clients", icon: Users },
  { label: "Staff", href: "/dashboard/staff", icon: UserCog },
  { label: "Calendar", href: "/dashboard/calendar", icon: CalendarDays },
  { label: "Payments", href: "/dashboard/payments", icon: CreditCard, flag: "payments" },
  { label: "Wallet", href: "/dashboard/wallet", icon: Wallet, flag: "wallet" },
  { label: "Analytics", href: "/dashboard/analytics", icon: BarChart2 },
  { label: "Expenses", href: "/dashboard/expenses", icon: Receipt },
  { term: "service", label: "Services", href: "/dashboard/services", icon: Wrench },
  { label: "Broadcasts", href: "/dashboard/broadcasts", icon: Megaphone, flag: "broadcasts" },
  { label: "Booking Page", href: "/dashboard/booking-page", icon: Link2 },
  { label: "Website", href: "/dashboard/website", icon: Globe },
  { label: "Billing", href: "/dashboard/billing", icon: Sparkles, flag: "payments" },
  { label: "Support", href: "/dashboard/support", icon: LifeBuoy },
  { label: "Settings", href: "/dashboard/settings", icon: SlidersHorizontal },
];

interface SidebarProps { collapsed?: boolean; onToggle?: () => void; }

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const pathname = usePathname();
  const flags = useFlags();
  const { t, tokenMode } = useTerms();
  const labelOf = (i: { label: string; term?: TermKey }) => (i.term ? t(i.term, { plural: true, cap: true }) : i.label);
  const items = NAV_ITEMS.filter((i) => (!i.flag || flags[i.flag]) && (!i.tokenOnly || tokenMode));
  const mainCount = tokenMode ? 5 : 4;

  return (
    <aside className={cn("flex flex-col bg-white h-dvh border-r border-[#e8e6e0] transition-all duration-300", collapsed ? "w-16" : "w-64")}>
      {/* Logo */}
      <div className={cn("flex items-center h-16 px-4 border-b border-[#e8e6e0]", collapsed ? "justify-center" : "justify-between")}>
        {!collapsed && (
          <Link href="/">
            <Logo width={80} />
          </Link>
        )}
        {collapsed && <Logo width={28} />}
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
        {items.slice(0, mainCount).map((item) => {
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
              {!collapsed && <span className="text-sm font-medium">{labelOf(item)}</span>}
            </Link>
          );
        })}

        {!collapsed && <p className="text-[10px] font-bold tracking-[2px] text-[#b0b0c0] uppercase px-3 pb-2 pt-4">Business</p>}
        {items.slice(mainCount).map((item) => {
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
              {!collapsed && <span className="text-sm font-medium">{labelOf(item)}</span>}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
