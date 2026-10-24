import { Facebook, Globe, Instagram, Linkedin, MessageCircle, Star, Twitter, Youtube } from "lucide-react";
import { SOCIAL_LABELS, SOCIAL_PLATFORMS, type SocialLinks, type SocialPlatform } from "@/lib/brandLinks";

const ICONS: Record<SocialPlatform, typeof Globe> = {
  instagram: Instagram, facebook: Facebook, whatsapp: MessageCircle, x: Twitter, linkedin: Linkedin, youtube: Youtube, website: Globe,
};

export function initialsOf(name: string): string {
  return name.split(/\s+/).filter(Boolean).map((w) => w[0]).join("").slice(0, 2).toUpperCase() || "?";
}

/** The business logo, or initials on the theme colour when there is none. */
export function BrandMark({ name, logoUrl, color, fg, size = 36, rounded = "rounded-xl" }: {
  name: string; logoUrl?: string | null; color: string; fg: string; size?: number; rounded?: string;
}) {
  if (logoUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={logoUrl} alt={`${name} logo`} width={size} height={size} className={`${rounded} object-contain shrink-0`} style={{ width: size, height: size }} />;
  }
  return (
    <span
      aria-hidden
      className={`${rounded} shrink-0 inline-flex items-center justify-center font-black`}
      style={{ width: size, height: size, background: color, color: fg, fontSize: size * 0.4 }}
    >
      {initialsOf(name)}
    </span>
  );
}

export function SocialIcons({ links, className = "", tone = "light" }: { links: SocialLinks; className?: string; tone?: "light" | "dark" }) {
  const items = SOCIAL_PLATFORMS.filter((p) => links[p]);
  if (items.length === 0) return null;
  const cls = tone === "light" ? "text-white/60 hover:text-white bg-white/10 hover:bg-white/20" : "text-gray-500 hover:text-gray-900 bg-gray-100 hover:bg-gray-200";
  return (
    <ul className={`flex items-center gap-2 flex-wrap ${className}`}>
      {items.map((p) => {
        const Icon = ICONS[p];
        return (
          <li key={p}>
            <a href={links[p]} target="_blank" rel="noopener noreferrer" aria-label={SOCIAL_LABELS[p]} title={SOCIAL_LABELS[p]}
              className={`w-9 h-9 rounded-full inline-flex items-center justify-center transition-colors ${cls}`}>
              <Icon size={16} />
            </a>
          </li>
        );
      })}
    </ul>
  );
}

export function ReviewButton({ href, color, fg, label = "Leave a Google review", className = "" }: {
  href: string; color: string; fg: string; label?: string; className?: string;
}) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer"
      className={`inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-sm font-bold transition-all hover:opacity-90 ${className}`}
      style={{ background: color, color: fg }}>
      <Star size={15} fill="currentColor" /> {label}
    </a>
  );
}
