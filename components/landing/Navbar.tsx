"use client";
import Link from "next/link";
import { useState, useEffect } from "react";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/ui/Logo";

const NAV_LINKS = [
  { label: "Features", href: "#features" },
  { label: "How it works", href: "#how-it-works" },
  { label: "Pricing", href: "#pricing" },
  { label: "Testimonials", href: "#testimonials" },
];

export function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className={cn(
      "fixed top-0 left-0 right-0 z-50 transition-all duration-300",
      scrolled ? "bg-white/95 backdrop-blur-md border-b border-gray-100 shadow-sm" : "bg-transparent"
    )}>
      <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <Link href="/">
            <Logo width={110} />
          </Link>

          <ul className="hidden md:flex items-center gap-8">
            {NAV_LINKS.map((link) => (
              <li key={link.label}>
                <a href={link.href} className="text-sm text-gray-500 hover:text-gray-900 transition-colors font-medium">
                  {link.label}
                </a>
              </li>
            ))}
          </ul>

          <div className="hidden md:flex items-center gap-3">
            <Link href="/login" className="text-sm text-gray-500 hover:text-gray-900 transition-colors font-medium px-3 py-2">
              Sign in
            </Link>
            <Link href="/signup" className="bg-sky-600 hover:bg-sky-700 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-colors">
              Get started free
            </Link>
          </div>

          <button onClick={() => setMobileOpen(!mobileOpen)} className="md:hidden text-gray-500 hover:text-gray-900 p-2">
            {mobileOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </nav>

      {mobileOpen && (
        <div className="md:hidden bg-white border-t border-gray-100 px-4 py-6 flex flex-col gap-4">
          {NAV_LINKS.map((link) => (
            <a key={link.label} href={link.href} onClick={() => setMobileOpen(false)} className="text-gray-600 hover:text-gray-900 text-base py-2 transition-colors font-medium">
              {link.label}
            </a>
          ))}
          <div className="flex flex-col gap-3 pt-4 border-t border-gray-100">
            <Link href="/login" className="text-center text-gray-600 hover:text-gray-900 py-2 transition-colors">Sign in</Link>
            <Link href="/signup" className="w-full text-center bg-sky-600 hover:bg-sky-700 text-white font-semibold px-5 py-3 rounded-xl transition-colors">
              Get started free
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
