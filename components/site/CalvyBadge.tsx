import { calvyBadgeUrl } from "@/lib/calvyBadgeUrl";

/**
 * "Bookings by [Calvy logo]": small, quiet, in the business's own colour (the logo is a mask filled with `color`, so it is
 * never Calvy blue). `color` defaults to the surrounding text colour.
 */
export function CalvyBadge({ slug, color, className = "", href }: { slug: string; color?: string; className?: string; href?: string }) {
  return (
    <a
      href={href ?? calvyBadgeUrl(slug)} target="_blank" rel="noopener" aria-label="Bookings by Calvy"
      className={`calvy-badge inline-flex items-center gap-1.5 text-[12px] leading-none no-underline opacity-70 hover:opacity-100 transition-opacity ${className}`}
      style={{ color: color ?? "inherit" }}
    >
      <span>Bookings by</span>
      <span aria-hidden style={{ display: "inline-block", width: 46, height: 12, backgroundColor: "currentColor", WebkitMask: "url(/calvy.svg) no-repeat center / contain", mask: "url(/calvy.svg) no-repeat center / contain" }} />
    </a>
  );
}
