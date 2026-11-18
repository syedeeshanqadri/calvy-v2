"use client";
import Link from "next/link";
import { useState, useEffect } from "react";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/ui/Logo";

const NAV_LINKS = [
  { label: "Features", href: "/#features" },
  { label: "How it works", href: "/#how-it-works" },
  { label: "Pricing", href: "/#pricing" },
  { label: "FAQ", href: "/#faq" },
];

export function Navbar({ tone = "light", solid = false }: { tone?: "light" | "dark"; solid?: boolean }) {
  const dark = tone === "dark";
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className={cn(
      "mk",
      "fixed top-0 left-0 right-0 z-50 transition-all duration-300",
      solid ? "bg-white border-b border-black/[0.06]" : scrolled ? (dark ? "bg-[#08203F]/85 backdrop-blur-md border-b border-white/10" : "bg-white/80 backdrop-blur-md border-b border-black/[0.06]") : "bg-transparent"
    )}>
      <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <Link href="/" aria-label="Calvy home" className="inline-flex items-center min-h-11">
            <Logo width={110} className={dark ? "brightness-0 invert" : ""} />
          </Link>

          <ul className="hidden md:flex items-center gap-8">
            {NAV_LINKS.map((link) => (
              <li key={link.label}>
                <a href={link.href} className={cn("text-sm transition-colors font-medium", dark ? "text-white/80 hover:text-white" : "text-cv-mute hover:text-cv-ink")}>
                  {link.label}
                </a>
              </li>
            ))}
          </ul>

          <div className="hidden md:flex items-center gap-3">
            <Link href="/login" className={cn("text-sm transition-colors font-medium px-3 py-2", dark ? "text-white/80 hover:text-white" : "text-cv-mute hover:text-cv-ink")}>
              Sign in
            </Link>
            <Link href="/signup" className={cn("text-sm font-semibold px-5 py-2.5 rounded-xl transition-colors", dark ? "bg-white text-cv-blue hover:bg-cv-blue-tint" : "bg-cv-blue hover:bg-cv-blue-dark text-white")}>
              Get started free
            </Link>
          </div>

          <button onClick={() => setMobileOpen(!mobileOpen)} aria-label={mobileOpen ? "Close menu" : "Open menu"} aria-expanded={mobileOpen} className={cn("md:hidden w-11 h-11 -mr-2 inline-flex items-center justify-center", dark ? "text-white" : "text-cv-mute hover:text-cv-ink")}>
            {mobileOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </nav>

      {mobileOpen && (
        <div className={cn("md:hidden border-t px-4 py-4 flex flex-col gap-1 max-h-[calc(100dvh-4rem)] overflow-y-auto", dark ? "bg-[#08203F] border-white/10 [&_a]:!text-white" : "bg-white border-black/[0.06]")}>
          {NAV_LINKS.map((link) => (
            <a key={link.label} href={link.href} onClick={() => setMobileOpen(false)} className="text-gray-600 hover:text-gray-900 text-base min-h-11 flex items-center transition-colors font-medium">
              {link.label}
            </a>
          ))}
          <div className="flex flex-col gap-3 pt-4 mt-2 border-t border-gray-100">
            <Link href="/login" onClick={() => setMobileOpen(false)} className="text-center text-gray-600 hover:text-gray-900 min-h-11 flex items-center justify-center transition-colors">Sign in</Link>
            <Link href="/signup" onClick={() => setMobileOpen(false)} className="w-full min-h-11 flex items-center justify-center text-center bg-cv-blue hover:bg-cv-blue-dark text-white font-semibold px-5 py-3 rounded-xl transition-colors">
              Get started free
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
