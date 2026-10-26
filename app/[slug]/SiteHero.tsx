import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { splitHeadline, type HeroLayout } from "@/lib/siteLayout";
import { focusPosition, type ImageFocus } from "@/lib/website";

export interface HeroChip { icon: ReactNode; label: string; sub?: string; live?: boolean }
export interface HeroTrust { icon: ReactNode; text: string }

/**
 * The hero for every business type. One structure, three looks (split, arch, immersive) chosen by
 * the pack; the photo frame always fills the full height of the section. Chips and trust items carry
 * only facts the business already has (hours, prices, team size), never made-up numbers.
 */
export function SiteHero({ layout, businessName, badge, headline, subheadline, ctaText, secondaryCtaText, bookingUrl, image, imageFocus, chips, trust, sealIcon }: {
  layout: HeroLayout;
  businessName: string;
  badge?: string;
  headline: string;
  subheadline?: string;
  ctaText: string;
  secondaryCtaText?: string;
  bookingUrl: string;
  image: string;
  imageFocus?: ImageFocus;
  chips: HeroChip[];
  trust: HeroTrust[];
  sealIcon?: ReactNode;
}) {
  const h = splitHeadline(headline, businessName);
  return (
    <section className="st-hero" data-layout={layout}>
      <div className={`st-hero-grid${image ? " has-image" : ""}`}>
        <div className="st-hero-copy">
          {badge && <span className="st-badge">{badge}</span>}
          <h1>
            {h.lead}
            {h.accent && <span className="st-accent">{h.accent}</span>}
            {h.trail}
          </h1>
          {subheadline && <p className="st-lede">{subheadline}</p>}
          <div className="st-ctas">
            <Link href={bookingUrl} className="st-btn st-btn-primary">{ctaText}</Link>
            {secondaryCtaText && <a href="#services" className="st-btn st-btn-ghost">{secondaryCtaText}</a>}
          </div>
          {trust.length > 0 && (
            <ul className="st-trust-row">
              {trust.map((item) => (
                <li key={item.text} className="st-trust-item">
                  <span className="st-ico-wrap">{item.icon}</span>
                  <span>{item.text}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {image && (
          <div className="st-hero-media">
            <div className="st-hero-frame">
              <Image src={image} alt={businessName} fill priority sizes={layout === "immersive" ? "100vw" : "(max-width: 900px) 100vw, 50vw"} style={{ objectPosition: focusPosition(imageFocus) }} unoptimized />
            </div>
            {layout === "arch" && (
              <svg className="st-seal" viewBox="0 0 120 120" role="img" aria-label="Book online">
                <defs><path id="st-seal-path" d="M60,60 m-45,0 a45,45 0 1,1 90,0 a45,45 0 1,1 -90,0" /></defs>
                <circle cx="60" cy="60" r="58" fill="var(--brand)" />
                <text fill="var(--brand-fg)" fontSize="11" fontWeight="600">
                  <textPath href="#st-seal-path" textLength="280" lengthAdjust="spacing">BOOK ONLINE · BOOK ONLINE · BOOK ONLINE · </textPath>
                </text>
              </svg>
            )}
            {layout === "arch" && sealIcon && <span className="st-seal-icon">{sealIcon}</span>}
            {chips.map((chip, i) => (
              <div key={chip.label} className={`st-chip ${i === 0 ? "a" : "b"}`}>
                <span className={`st-chip-ico${chip.live ? " live" : ""}`}>{chip.icon}</span>
                <span>
                  <b>{chip.label}</b>
                  {chip.sub && <small>{chip.sub}</small>}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
