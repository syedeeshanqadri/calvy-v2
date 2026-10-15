"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import {
  LayoutDashboard, Building2, CreditCard, TrendingUp,
  ShieldCheck, LogOut, ChevronRight, ArrowDownToLine, Bell, X, Send,
  Users, HelpCircle, LifeBuoy, Newspaper, Contact,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useFlags } from "@/components/providers/FlagsProvider";
import type { FeatureFlag } from "@/lib/flags";
import { useState } from "react";
import { Logo } from "@/components/ui/Logo";

const NAV: { label: string; href: string; icon: typeof LayoutDashboard; exact?: boolean; flag?: FeatureFlag }[] = [
  { label: "Overview", href: "/admin", icon: LayoutDashboard, exact: true },
  { label: "Tenants", href: "/admin/tenants", icon: Building2 },
  { label: "Plans & Pricing", href: "/admin/plans", icon: CreditCard },
  { label: "Revenue", href: "/admin/revenue", icon: TrendingUp },
  { label: "Withdrawals", href: "/admin/withdrawals", icon: ArrowDownToLine, flag: "wallet" },
  { label: "Notifications", href: "/admin/notifications", icon: Send },
  { label: "Blog", href: "/admin/blog", icon: Newspaper },
  { label: "CRM (Leads)", href: "/crm", icon: Contact },
  { label: "Support", href: "/admin/support", icon: LifeBuoy },
];

export function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const flags = useFlags();
  const { data: session } = useSession();
  const [showNotifications, setShowNotifications] = useState(false);
  const [toast, setToast] = useState("");
  const userName = session?.user?.name ?? "Admin";
  const userEmail = session?.user?.email ?? "";
  const initials = userName.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase();

  return (
    <div className="flex h-screen overflow-hidden bg-[#f8f7f4]">
      {/* Sidebar */}
      <aside className="w-60 flex flex-col bg-white border-r border-[#e8e6e0] flex-shrink-0">
        {/* Logo */}
        <div className="flex items-center gap-2.5 px-5 h-16 border-b border-[#e8e6e0]">
          <Logo width={72} />
          <div className="flex items-center gap-1 ml-1">
            <ShieldCheck size={13} className="text-accent" />
            <p className="text-[10px] text-[#6b6b80]">Admin</p>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-4 px-3 space-y-0.5">
          <p className="text-[10px] font-bold tracking-[2px] text-[#b0b0c0] uppercase px-2 pb-2 pt-1">Management</p>
          {NAV.filter((item) => !item.flag || flags[item.flag]).map((item) => {
            const isActive = item.exact ? pathname === item.href : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all duration-200 group",
                  isActive ? "bg-sky-50 text-sky-700" : "text-[#6b6b80] hover:text-[#0f0f1a] hover:bg-[#f8f7f4]"
                )}
              >
                <item.icon size={16} className={cn("flex-shrink-0", isActive && "text-sky-600")} />
                <span className="font-medium">{item.label}</span>
                {isActive && <ChevronRight size={14} className="ml-auto text-sky-400" />}
              </Link>
            );
          })}
        </nav>

        {/* Bottom */}
        <div className="p-3 border-t border-[#e8e6e0] space-y-1">
          <Link href="/dashboard" className="flex items-center gap-3 px-3 py-2 rounded-xl text-[#6b6b80] hover:text-[#0f0f1a] hover:bg-[#f8f7f4] transition-colors text-sm">
            <Users size={15} />
            <span>My Dashboard</span>
          </Link>
          <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-[#f8f7f4] mt-1">
            <div className="w-7 h-7 rounded-full bg-accent flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
              {initials}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium text-[#0f0f1a] truncate">{userName}</p>
              <p className="text-[10px] text-[#6b6b80] truncate">{userEmail}</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top nav */}
        <header className="bg-white border-b border-[#e8e6e0] flex items-center px-6 gap-2 sticky top-0 z-30 safe-header-16">
          <div className="flex-1" />
          <button
            onClick={() => { setToast("Help center coming soon!"); setTimeout(() => setToast(""), 3000); }}
            className="p-2 rounded-xl text-[#6b6b80] hover:bg-[#f8f7f4] hover:text-[#0f0f1a] transition-colors"
            title="Help"
          >
            <HelpCircle size={18} />
          </button>
          <button
            onClick={() => setShowNotifications(true)}
            className="relative p-2 rounded-xl text-[#6b6b80] hover:bg-[#f8f7f4] hover:text-[#0f0f1a] transition-colors"
            title="Notifications"
          >
            <Bell size={18} />
          </button>
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="p-2 rounded-xl text-[#6b6b80] hover:bg-[#f8f7f4] hover:text-red-500 transition-colors"
            title="Sign out"
          >
            <LogOut size={18} />
          </button>
        </header>

        <main className="flex-1 overflow-y-auto bg-[#f8f7f4]">
          {children}
        </main>
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed top-20 right-6 z-50 px-4 py-2 rounded-xl bg-[#0f0f1a] text-white text-xs shadow-lg animate-fade-in">
          {toast}
        </div>
      )}

      {/* Notifications panel */}
      {showNotifications && (
        <div className="fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowNotifications(false)} />
          <div className="relative ml-auto w-80 h-full bg-white shadow-2xl flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#e8e6e0]">
              <h2 className="font-syne font-bold text-base">Notifications</h2>
              <button onClick={() => setShowNotifications(false)} className="p-1.5 rounded-lg hover:bg-[#f8f7f4] transition-colors text-[#6b6b80]">
                <X size={16} />
              </button>
            </div>
            <div className="flex-1 flex items-center justify-center p-6 text-center">
              <div>
                <Bell size={32} className="mx-auto mb-3 text-[#c5c3bf]" />
                <p className="text-sm font-medium text-[#3d3d4d]">No notifications yet</p>
                <p className="text-xs text-[#6b6b80] mt-1">Admin events will appear here.</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
