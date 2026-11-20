"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { CalendarDays, LayoutDashboard, LogOut, UserRound } from "lucide-react";
import { Logo } from "@/components/ui/Logo";
import { cn } from "@/lib/utils";

const NAV = [
  { label: "Home", href: "/account", icon: LayoutDashboard, exact: true },
  { label: "Bookings", href: "/account/bookings", icon: CalendarDays },
  { label: "Profile", href: "/account/profile", icon: UserRound },
];

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join("") || "?";

/**
 * The customer app frame: a slim top bar (logo, links, sign out) and one centred column, about 1100px wide. On a phone the links move to bottom tabs.
 * Everything the customer needs is on the home page, so there is no side menu.
 */
export function MyShell({ name, email, children }: { name: string; email: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const active = (n: (typeof NAV)[number]) => (n.exact ? pathname === n.href : pathname.startsWith(n.href));

  return (
    <div className="min-h-dvh bg-cv-paper font-dm text-cv-ink">
      <header className="sticky top-0 z-30 border-b border-cv-line bg-cv-card/95 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-[1100px] items-center justify-between gap-4 px-4 sm:px-6 lg:h-16 lg:px-8">
          <Link href="/account" aria-label="Calvy home"><Logo width={84} /></Link>
          <nav aria-label="My account" className="hidden items-center gap-1 lg:flex">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} aria-current={active(n) ? "page" : undefined}
                className={cn("rounded-xl px-4 py-2 text-sm font-semibold transition-colors", active(n) ? "bg-cv-blue-tint text-cv-blue" : "text-cv-mute hover:bg-cv-blue-tint/60 hover:text-cv-ink")}>
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-3">
            <span className="hidden text-right sm:block"><span className="block max-w-[14rem] truncate text-sm font-semibold">{name}</span><span className="block max-w-[14rem] truncate text-xs text-cv-mute">{email}</span></span>
            <span className="grid h-9 w-9 place-items-center rounded-full bg-cv-marigold text-xs font-bold text-cv-ink" aria-label={name}>{initials(name)}</span>
            <button type="button" onClick={() => signOut({ callbackUrl: "/account/login" })} aria-label="Sign out" className="grid h-11 w-11 place-items-center rounded-xl text-cv-mute hover:bg-cv-blue-tint/60 hover:text-cv-ink"><LogOut size={18} aria-hidden /></button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full min-w-0 max-w-[1100px] px-4 pb-28 pt-6 sm:px-6 lg:px-8 lg:pb-14 lg:pt-10">{children}</main>

      <nav aria-label="My account" className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-3 border-t border-cv-line bg-cv-card pb-[env(safe-area-inset-bottom)] lg:hidden">
        {NAV.map((n) => (
          <Link key={n.href} href={n.href} aria-current={active(n) ? "page" : undefined}
            className={cn("flex min-h-16 flex-col items-center justify-center gap-1 text-[11px] font-semibold", active(n) ? "text-cv-blue" : "text-cv-mute")}>
            <n.icon size={20} aria-hidden />{n.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
