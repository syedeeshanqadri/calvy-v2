"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import {
  LayoutDashboard, Building2, CreditCard, TrendingUp,
  ShieldCheck, LogOut, ChevronRight, Bell, X, Send,
  Users, Gift, HelpCircle, LifeBuoy, Newspaper, Contact, ScrollText, Menu,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useFlags } from "@/components/providers/FlagsProvider";
import type { FeatureFlag } from "@/lib/flags";
import { useCallback, useEffect, useRef, useState } from "react";
import { useFocusTrap } from "@/components/admin/useFocusTrap";
import { Logo } from "@/components/ui/Logo";

const NAV: { label: string; href: string; icon: typeof LayoutDashboard; exact?: boolean; flag?: FeatureFlag }[] = [
  { label: "Overview", href: "/admin", icon: LayoutDashboard, exact: true },
  { label: "Businesses", href: "/admin/businesses", icon: Building2 },
  { label: "Plans & Pricing", href: "/admin/plans", icon: CreditCard },
  { label: "Revenue", href: "/admin/revenue", icon: TrendingUp },
  { label: "Billing", href: "/admin/billing", icon: CreditCard },
  { label: "Offers", href: "/admin/offers", icon: Gift },
  { label: "Coupons", href: "/admin/coupons", icon: Gift },
  { label: "Customers", href: "/admin/customers", icon: Users },
  { label: "Referrals", href: "/admin/referrals", icon: Gift },
  { label: "Rewards", href: "/admin/rewards", icon: Gift },
  { label: "Notifications", href: "/admin/notifications", icon: Send, exact: true },
  { label: "Delivery log", href: "/admin/notifications/log", icon: ScrollText },
  { label: "WhatsApp review", href: "/admin/whatsapp-review", icon: Send },
  { label: "Blog", href: "/admin/blog", icon: Newspaper },
  { label: "CRM (Leads)", href: "/crm", icon: Contact },
  { label: "Support", href: "/admin/support", icon: LifeBuoy },
  { label: "Audit log", href: "/admin/audit", icon: ScrollText },
  { label: "Settings", href: "/admin/settings", icon: ShieldCheck },
];

/*
 * The admin shell. One viewport-sized frame (h-dvh, so a phone's address bar never hides the bottom): a sidebar, and next to it a column made of a
 * sticky header and ONE scrolling <main>. Pages render only their content: the shell gives them the padding, the width and the scrolling.
 * Below 1024px the sidebar is a drawer (backdrop, Escape, focus kept inside, focus returned to the menu button).
 *
 * Layers, lowest to highest: header 30, drawer backdrop 40, drawer 50, notifications backdrop 60, notifications panel 61, toast 70.
 * Only one of the drawer and the notifications panel is open at a time.
 */
export function AdminLayout({ children, adminEmail }: { children: React.ReactNode; adminEmail?: string }) {
  const pathname = usePathname();
  const flags = useFlags();
  const { data: session } = useSession();
  const [showNotifications, setShowNotifications] = useState(false);
  const [toast, setToast] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [narrow, setNarrow] = useState(false);
  const drawer = useRef<HTMLElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  const userName = session?.user?.name ?? "Admin";
  const userEmail = adminEmail ?? session?.user?.email ?? "";
  const initials = userName.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase();

  // Is the sidebar a drawer right now (under 1024px)? Widening the window closes the drawer.
  useEffect(() => {
    const m = window.matchMedia("(max-width: 1023px)");
    const sync = () => { setNarrow(m.matches); if (!m.matches) setMenuOpen(false); };
    sync();
    m.addEventListener("change", sync);
    return () => m.removeEventListener("change", sync);
  }, []);
  const closeMenu = useCallback(() => setMenuOpen(false), []);
  const closePanel = useCallback(() => setShowNotifications(false), []);
  const drawerOpen = narrow && menuOpen;
  useFocusTrap(drawer, drawerOpen, closeMenu);
  useFocusTrap(panel, showNotifications, closePanel);
  // Navigating closes the drawer.
  useEffect(() => { setMenuOpen(false); }, [pathname]);

  return (
    <div className="flex h-dvh overflow-hidden bg-[#f8f7f4]" data-admin-shell>
      {drawerOpen && <div className="fixed inset-0 z-40 bg-black/40 lg:hidden" onClick={closeMenu} aria-hidden data-testid="admin-backdrop" />}
      <aside
        id="admin-sidebar" ref={drawer} tabIndex={-1}
        aria-label="Admin menu" aria-modal={drawerOpen || undefined} role={narrow ? "dialog" : undefined}
        // Closed drawer: out of the tab order and the accessibility tree. Desktop: always there.
        inert={narrow && !menuOpen ? true : undefined}
        className={cn(
          "flex w-64 max-w-[85vw] shrink-0 flex-col overflow-y-auto overscroll-contain border-r border-[#e8e6e0] bg-white lg:w-60",
          "fixed inset-y-0 left-0 z-50 transition-transform duration-200 motion-reduce:transition-none lg:static lg:z-auto lg:translate-x-0",
          menuOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-16 shrink-0 items-center gap-2.5 border-b border-[#e8e6e0] px-5">
          <Logo width={72} />
          <div className="ml-1 flex items-center gap-1">
            <ShieldCheck size={13} className="text-accent" />
            <p className="text-[10px] text-[#6b6b80]">Admin</p>
          </div>
          <button type="button" onClick={closeMenu} aria-label="Close admin menu" className="ml-auto grid h-11 w-11 place-items-center rounded-xl text-[#6b6b80] hover:bg-[#f8f7f4] lg:hidden"><X size={18} /></button>
        </div>

        <nav className="flex-1 space-y-0.5 px-3 py-4" aria-label="Admin sections">
          <p className="px-2 pb-2 pt-1 text-[10px] font-bold uppercase tracking-[2px] text-[#8a8a9c]">Management</p>
          {NAV.filter((item) => !item.flag || flags[item.flag]).map((item) => {
            const isActive = item.exact ? pathname === item.href : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "group flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors",
                  isActive ? "bg-sky-50 text-sky-700" : "text-[#6b6b80] hover:bg-[#f8f7f4] hover:text-[#0f0f1a]",
                )}
              >
                <item.icon size={16} className={cn("flex-shrink-0", isActive && "text-sky-600")} />
                <span className="truncate font-medium">{item.label}</span>
                {isActive && <ChevronRight size={14} className="ml-auto shrink-0 text-sky-400" />}
              </Link>
            );
          })}
        </nav>

        <div className="shrink-0 space-y-1 border-t border-[#e8e6e0] p-3">
          <Link href="/dashboard" className="flex min-h-11 items-center gap-3 rounded-xl px-3 py-2 text-sm text-[#6b6b80] transition-colors hover:bg-[#f8f7f4] hover:text-[#0f0f1a]">
            <Users size={15} />
            <span>My Dashboard</span>
          </Link>
          <div className="mt-1 flex items-center gap-2.5 rounded-xl bg-[#f8f7f4] px-3 py-2.5">
            <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-accent text-xs font-bold text-white">{initials}</div>
            <div className="min-w-0">
              <p className="truncate text-xs font-medium text-[#0f0f1a]" title={userName}>{userName}</p>
              <p className="truncate text-[10px] text-[#6b6b80]" title={userEmail}>{userEmail}</p>
            </div>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="safe-header-16 sticky top-0 z-30 flex shrink-0 items-center gap-2 border-b border-[#e8e6e0] bg-white px-4 md:px-6" data-admin-header>
          <button ref={menuButton} type="button" onClick={() => { setShowNotifications(false); setMenuOpen(true); }} aria-label="Open admin menu" aria-controls="admin-sidebar" aria-expanded={drawerOpen}
            className="-ml-2 grid h-11 w-11 place-items-center rounded-xl text-[#6b6b80] hover:bg-[#f8f7f4] lg:hidden"><Menu size={20} /></button>
          <div className="flex-1" />
          <button
            onClick={() => { setToast("Help center coming soon!"); setTimeout(() => setToast(""), 3000); }}
            className="grid h-11 w-11 place-items-center rounded-xl text-[#6b6b80] transition-colors hover:bg-[#f8f7f4] hover:text-[#0f0f1a]"
            title="Help" aria-label="Help"
          >
            <HelpCircle size={18} />
          </button>
          <button
            onClick={() => { setMenuOpen(false); setShowNotifications(true); }}
            className="relative grid h-11 w-11 place-items-center rounded-xl text-[#6b6b80] transition-colors hover:bg-[#f8f7f4] hover:text-[#0f0f1a]"
            title="Notifications" aria-label="Notifications"
          >
            <Bell size={18} />
          </button>
          <button
            onClick={async () => { await fetch("/api/admin/logout", { method: "POST" }).catch(() => {}); await signOut({ callbackUrl: "/login" }); }}
            className="grid h-11 w-11 place-items-center rounded-xl text-[#6b6b80] transition-colors hover:bg-[#f8f7f4] hover:text-red-500"
            title="Sign out" aria-label="Sign out"
          >
            <LogOut size={18} />
          </button>
        </header>

        {/* The one scroller. Pages render inside it with no padding or width of their own. */}
        <main id="admin-main" className="min-w-0 flex-1 overflow-y-auto overscroll-contain bg-[#f8f7f4]" data-admin-main>
          <div className="mx-auto w-full min-w-0 max-w-[1400px] p-4 pb-[max(2rem,env(safe-area-inset-bottom))] sm:p-6 lg:p-8">{children}</div>
        </main>
      </div>

      {toast && (
        <div role="status" className="fixed right-4 top-20 z-[70] max-w-[calc(100vw-2rem)] animate-fade-in rounded-xl bg-[#0f0f1a] px-4 py-2 text-xs text-white shadow-lg">{toast}</div>
      )}

      {showNotifications && (
        <div className="fixed inset-0 z-[60] flex">
          <div className="absolute inset-0 bg-black/40" onClick={closePanel} aria-hidden />
          <div ref={panel} role="dialog" aria-modal="true" aria-label="Notifications" tabIndex={-1} className="relative z-[61] ml-auto flex h-full w-80 max-w-[90vw] flex-col bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#e8e6e0] px-5 py-4">
              <h2 className="font-syne text-base font-bold">Notifications</h2>
              <button onClick={closePanel} aria-label="Close notifications" className="grid h-11 w-11 place-items-center rounded-lg text-[#6b6b80] transition-colors hover:bg-[#f8f7f4]"><X size={16} /></button>
            </div>
            <div className="flex flex-1 items-center justify-center p-6 text-center">
              <div>
                <Bell size={32} className="mx-auto mb-3 text-[#c5c3bf]" />
                <p className="text-sm font-medium text-[#3d3d4d]">No notifications yet</p>
                <p className="mt-1 text-xs text-[#6b6b80]">Admin events will appear here.</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
