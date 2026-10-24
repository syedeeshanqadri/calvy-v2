import { SUPPORT_EMAIL, PLANT_TREE_URL } from "@/lib/site";
import Link from "next/link";
import { NewsletterForm } from "./NewsletterForm";
import { CurrentYear } from "./CurrentYear";
import { Logo } from "@/components/ui/Logo";

const LINKS: Record<string, { label: string; href: string }[]> = {
  Product: [
    { label: "Features", href: "/#features" },
    { label: "Pricing", href: "/#pricing" },
  ],
  Company: [
    { label: "Blog", href: "/blog" },
    { label: "Contact", href: `mailto:${SUPPORT_EMAIL}` },
  ],
  Legal: [
    { label: "Privacy Policy", href: "/privacy" },
    { label: "Terms & Conditions", href: "/terms" },
    { label: "Refund Policy", href: "/refund-policy" },
  ],
  Support: [
    { label: "Help Center", href: "/help" },
    { label: "Razorpay setup", href: "/help/connect-razorpay-to-accept-payments" },
    { label: "Contact", href: `mailto:${SUPPORT_EMAIL}` },
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
            <p className="text-sm text-gray-500 leading-relaxed mb-5">The smartest appointment booking platform for modern service businesses.</p>
            <div className="mt-7 max-w-xs">
              <NewsletterForm />
            </div>
          </div>
          {Object.entries(LINKS).map(([category, links]) => (
            <div key={category}>
              <h4 className="text-sm font-semibold text-white mb-4">{category}</h4>
              <ul>
                {links.map((link) => (
                  <li key={link.label}>
                    <Link href={link.href} className="text-sm text-gray-500 hover:text-gray-300 transition-colors inline-flex items-center min-h-11">{link.label}</Link>
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
          <p className="text-sm text-gray-600">Made with ♥ for service businesses everywhere</p>
        </div>
      </div>
    </footer>
  );
}
