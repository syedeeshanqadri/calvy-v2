"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  LayoutDashboard, CalendarDays, Calendar, Users, MoreHorizontal, X,
  UserCog, CreditCard, Wallet, BarChart2, Wrench, Link2, Globe,
  Sparkles, SlidersHorizontal, LogOut, Megaphone, Receipt,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useFlags } from "@/components/providers/FlagsProvider";
import type { FeatureFlag } from "@/lib/flags";

const PRIMARY = [
  { label: "Home", href: "/dashboard", icon: LayoutDashboard, exact: true },
  { label: "Calendar", href: "/dashboard/calendar", icon: CalendarDays },
  { label: "Bookings", href: "/dashboard/appointments", icon: Calendar },
  { label: "Clients", href: "/dashboard/clients", icon: Users },
];

const ALL_MORE_ITEMS: { label: string; href: string; icon: typeof UserCog; flag?: FeatureFlag }[] = [
  { label: "Staff", href: "/dashboard/staff", icon: UserCog },
  { label: "Payments", href: "/dashboard/payments", icon: CreditCard, flag: "payments" },
  { label: "Wallet", href: "/dashboard/wallet", icon: Wallet, flag: "wallet" },
  { label: "Analytics", href: "/dashboard/analytics", icon: BarChart2 },
  { label: "Expenses", href: "/dashboard/expenses", icon: Receipt },
  { label: "Services", href: "/dashboard/services", icon: Wrench },
  { label: "Broadcasts", href: "/dashboard/broadcasts", icon: Megaphone, flag: "broadcasts" },
  { label: "Booking Page", href: "/dashboard/booking-page", icon: Link2 },
  { label: "Website", href: "/dashboard/website", icon: Globe },
  { label: "Billing", href: "/dashboard/billing", icon: Sparkles, flag: "payments" },
  { label: "Settings", href: "/dashboard/settings", icon: SlidersHorizontal },
];

export function BottomNav() {
  const pathname = usePathname();
  const flags = useFlags();
  const MORE_ITEMS = ALL_MORE_ITEMS.filter((i) => !i.flag || flags[i.flag]);
  const [showMore, setShowMore] = useState(false);

  const isMoreActive = MORE_ITEMS.some(item => pathname.startsWith(item.href));

  useEffect(() => {
    if (!showMore) return;
    const handleKey = (e: KeyboardEvent) => { if (e.key === "Escape") setShowMore(false); };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [showMore]);

  return (
    <>
      {/* More sheet backdrop */}
      {showMore && (
        <div
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
          onClick={() => setShowMore(false)}
        />
      )}

      {/* More sheet */}
      <div
        className={cn(
          "fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl shadow-2xl border-t border-[#e8e6e0] lg:hidden transition-transform duration-300 ease-out",
          showMore ? "translate-y-0" : "translate-y-full"
        )}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-[#e8e6e0]" />
        </div>

        <div className="flex items-center justify-between px-5 py-3">
          <p className="font-syne font-bold text-base">More</p>
          <button
            onClick={() => setShowMore(false)}
            className="p-1.5 rounded-xl text-[#6b6b80] hover:bg-[#f8f7f4] transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <div className="grid grid-cols-3 gap-2 px-4 pb-3">
          {MORE_ITEMS.map(item => {
            const isActive = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setShowMore(false)}
                className={cn(
                  "flex flex-col items-center gap-2 p-3 rounded-2xl transition-colors",
                  isActive ? "bg-sky-50 text-sky-700" : "text-[#6b6b80] hover:bg-[#f8f7f4] hover:text-[#0f0f1a]"
                )}
              >
                <item.icon size={20} strokeWidth={isActive ? 2.5 : 1.5} />
                <span className="text-[11px] font-medium text-center leading-tight">{item.label}</span>
              </Link>
            );
          })}
        </div>

        <div className="px-4 pb-3 pt-1 border-t border-[#f0ede8] mx-4 rounded-xl">
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="flex items-center gap-3 w-full px-4 py-3 rounded-xl text-sm text-red-500 hover:bg-red-50 transition-colors font-medium"
          >
            <LogOut size={16} />
            Sign out
          </button>
        </div>

        <div style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 1rem)" }} />
      </div>

      {/* Bottom tab bar */}
      <nav className="fixed bottom-0 left-0 right-0 z-30 bg-white/95 backdrop-blur-md border-t border-[#e8e6e0] lg:hidden">
        <div className="flex items-stretch h-16">
          {PRIMARY.map(item => {
            const isActive = item.exact ? pathname === item.href : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex flex-col items-center justify-center gap-1 flex-1 transition-colors active:scale-95",
                  isActive ? "text-sky-600" : "text-[#b0b0c0]"
                )}
              >
                <item.icon size={22} strokeWidth={isActive ? 2.5 : 1.5} />
                <span className={cn("text-[10px] font-medium", isActive ? "text-sky-600" : "text-[#b0b0c0]")}>
                  {item.label}
                </span>
              </Link>
            );
          })}

          <button
            onClick={() => setShowMore(true)}
            className={cn(
              "flex flex-col items-center justify-center gap-1 flex-1 transition-colors active:scale-95",
              isMoreActive ? "text-sky-600" : "text-[#b0b0c0]"
            )}
          >
            <MoreHorizontal size={22} strokeWidth={isMoreActive ? 2.5 : 1.5} />
            <span className={cn("text-[10px] font-medium", isMoreActive ? "text-sky-600" : "text-[#b0b0c0]")}>
              More
            </span>
          </button>
        </div>
        <div style={{ paddingBottom: "env(safe-area-inset-bottom)" }} />
      </nav>
    </>
  );
}
