import { SUPPORT_EMAIL, PLANT_TREE_URL } from "@/lib/site";
import Link from "next/link";
import { NewsletterForm } from "./NewsletterForm";
import { CurrentYear } from "./CurrentYear";
import { Logo } from "@/components/ui/Logo";

const LINKS: Record<string, { label: string; href: string }[]> = {
  Product: [
    { label: "Features", href: "/#features" },
    { label: "Pricing", href: "/pricing" },
  ],
  Company: [
    { label: "About", href: "/about" },
    { label: "Contact", href: "/contact" },
    { label: "Blog", href: "/blog" },
  ],
  Legal: [
    { label: "Privacy Policy", href: "/privacy" },
    { label: "Terms & Conditions", href: "/terms" },
    { label: "Refund & Cancellation", href: "/refund-policy" },
    { label: "Service Delivery", href: "/service-delivery" },
    { label: "Cookie Policy", href: "/cookies" },
    { label: "Data Deletion", href: "/data-deletion" },
  ],
  Support: [
    { label: "Help Center", href: "/help" },
    { label: "Email support", href: `mailto:${SUPPORT_EMAIL}` },
  ],
};

export function Footer() {
  return (
    <footer className="bg-gray-950 pt-16 pb-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-10 mb-12">
          <div className="col-span-2 lg:col-span-1">
            <div className="mb-5">
              <Logo width={90} className="brightness-0 invert" />
            </div>
            <p className="text-sm text-gray-400 leading-relaxed mb-5">The smartest appointment booking platform for modern service businesses.</p>
            <div className="mt-7 max-w-xs">
              <NewsletterForm />
            </div>
          </div>
          {Object.entries(LINKS).map(([category, links]) => (
            <div key={category}>
              <h3 className="text-sm font-semibold text-white mb-4">{category}</h3>
              <ul>
                {links.map((link) => (
                  <li key={link.label}>
                    <Link href={link.href} className="text-sm text-gray-400 hover:text-gray-200 transition-colors inline-flex items-center min-h-11">{link.label}</Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="border-t border-white/8 pt-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-sm text-gray-600">© <CurrentYear /> Calvy. All rights reserved.</p>
          <a
            href={PLANT_TREE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 min-h-11 px-4 rounded-full border border-white/10 text-sm text-gray-400 hover:text-white hover:border-white/30 transition-colors"
          >
            <span aria-hidden="true">🌱</span> Donate to plant a tree
          </a>
        </div>
      </div>
    </footer>
  );
}
