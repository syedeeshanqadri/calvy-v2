import Link from "next/link";
import Image from "next/image";
import { NewsletterForm } from "./NewsletterForm";

const LINKS: Record<string, { label: string; href: string }[]> = {
  Product: [
    { label: "Features", href: "/#features" },
    { label: "Pricing", href: "/#pricing" },
    { label: "Integrations", href: "#" },
    { label: "Changelog", href: "#" },
  ],
  Company: [
    { label: "About", href: "#" },
    { label: "Blog", href: "/blog" },
    { label: "Careers", href: "#" },
    { label: "Contact", href: "mailto:support@calvy.io" },
  ],
  Legal: [
    { label: "Privacy Policy", href: "/privacy" },
    { label: "Terms & Conditions", href: "/terms" },
    { label: "Refund Policy", href: "/refund-policy" },
  ],
  Support: [
    { label: "Help Center", href: "/help" },
    { label: "Razorpay setup", href: "/help/connect-razorpay-to-accept-payments" },
    { label: "Contact", href: "mailto:support@calvy.io" },
  ],
};

export function Footer() {
  return (
    <footer className="bg-gray-950 pt-16 pb-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-10 mb-12">
          <div className="col-span-2 lg:col-span-1">
            <div className="mb-5">
              <Image src="/calvy.svg" alt="Calvy" width={90} height={26} className="brightness-0 invert" />
            </div>
            <p className="text-sm text-gray-500 leading-relaxed mb-5">The smartest appointment booking platform for modern service businesses.</p>
            <div className="flex gap-3">
              {[
                { label: "𝕏", href: "#" },
                { label: "in", href: "#" },
                { label: "f", href: "#" },
              ].map((s) => (
                <a key={s.label} href={s.href} className="w-9 h-9 rounded-xl border border-white/10 flex items-center justify-center text-gray-500 hover:text-white hover:border-white/30 cursor-pointer transition-colors text-sm">
                  {s.label}
                </a>
              ))}
            </div>
            <div className="mt-7 max-w-xs">
              <NewsletterForm />
            </div>
          </div>
          {Object.entries(LINKS).map(([category, links]) => (
            <div key={category}>
              <h4 className="text-sm font-semibold text-white mb-4">{category}</h4>
              <ul className="space-y-3">
                {links.map((link) => (
                  <li key={link.label}>
                    <Link href={link.href} className="text-sm text-gray-500 hover:text-gray-300 transition-colors">{link.label}</Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="border-t border-white/8 pt-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-sm text-gray-600">© 2025 Calvy. All rights reserved.</p>
          <p className="text-sm text-gray-600">Made with ♥ for service businesses everywhere</p>
        </div>
      </div>
    </footer>
  );
}
