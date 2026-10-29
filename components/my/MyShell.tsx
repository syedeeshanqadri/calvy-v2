"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { CalendarDays, LayoutDashboard, LogOut, UserRound, Wallet } from "lucide-react";
import { Logo } from "@/components/ui/Logo";
import { cn } from "@/lib/utils";

const NAV = [
  { label: "Overview", href: "/my", icon: LayoutDashboard, exact: true },
  { label: "Bookings", href: "/my/bookings", icon: CalendarDays },
  { label: "Wallet", href: "/my/wallet", icon: Wallet },
  { label: "Profile", href: "/my/profile", icon: UserRound },
];

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join("") || "?";

/** The customer app frame: a sidebar on laptops, a top bar and bottom tabs on phones. */
export function MyShell({ name, email, children }: { name: string; email: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const active = (n: (typeof NAV)[number]) => (n.exact ? pathname === n.href : pathname.startsWith(n.href));

  return (
    <div className="min-h-dvh bg-[#f8f7f4] text-[#0f0f1a] lg:flex">
      {/* Sidebar (laptop) */}
      <aside className="hidden lg:flex lg:w-64 lg:shrink-0 lg:flex-col lg:sticky lg:top-0 lg:h-dvh bg-white border-r border-[#e8e6e0]">
        <div className="h-16 px-5 flex items-center border-b border-[#e8e6e0]">
          <Link href="/my" aria-label="Calvy home"><Logo width={84} /></Link>
        </div>
        <nav aria-label="My account" className="flex-1 py-4 px-3 space-y-1">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} aria-current={active(n) ? "page" : undefined}
              className={cn("flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors",
                active(n) ? "bg-sky-50 text-sky-700" : "text-[#6b6b80] hover:bg-[#f8f7f4] hover:text-[#0f0f1a]")}>
              <n.icon size={18} aria-hidden />{n.label}
            </Link>
          ))}
        </nav>
        <div className="p-3 border-t border-[#e8e6e0]">
          <div className="flex items-center gap-3 px-2 py-2">
            <span className="h-9 w-9 rounded-full bg-sky-100 text-sky-700 text-sm font-bold grid place-items-center" aria-hidden>{initials(name)}</span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold truncate">{name}</span>
              <span className="block text-xs text-[#6b6b80] truncate">{email}</span>
            </span>
          </div>
          <button type="button" onClick={() => signOut({ callbackUrl: "/my/login" })}
            className="mt-1 w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-[#6b6b80] hover:bg-[#f8f7f4] hover:text-[#0f0f1a]">
            <LogOut size={18} aria-hidden />Sign out
          </button>
        </div>
      </aside>

      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top bar (phone) */}
        <header className="lg:hidden sticky top-0 z-30 h-14 px-4 flex items-center justify-between bg-white/95 backdrop-blur border-b border-[#e8e6e0]">
          <Link href="/my" aria-label="Calvy home"><Logo width={72} /></Link>
          <span className="h-8 w-8 rounded-full bg-sky-100 text-sky-700 text-xs font-bold grid place-items-center" aria-label={name}>{initials(name)}</span>
        </header>

        <main className="flex-1 w-full max-w-5xl mx-auto px-4 sm:px-6 lg:px-10 py-6 lg:py-10 pb-28 lg:pb-12">{children}</main>

        {/* Bottom tabs (phone) */}
        <nav aria-label="My account" className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-white border-t border-[#e8e6e0] grid grid-cols-4 pb-[env(safe-area-inset-bottom)]">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} aria-current={active(n) ? "page" : undefined}
              className={cn("flex flex-col items-center justify-center gap-1 min-h-16 text-[11px] font-medium", active(n) ? "text-sky-700" : "text-[#6b6b80]")}>
              <n.icon size={20} aria-hidden />{n.label}
            </Link>
          ))}
        </nav>
      </div>
    </div>
  );
}
