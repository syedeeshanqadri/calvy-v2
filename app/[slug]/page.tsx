import { notFound } from "next/navigation";
import { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { prisma } from "@/lib/prisma";
import { t } from "@/lib/terms";
import { parseWebsiteConfig, defaultWebsiteConfig, WebsiteConfig } from "@/lib/website";
import { MapPin, Phone, Mail, Clock, ArrowRight } from "lucide-react";
import { formatCurrencyAmount } from "@/lib/currency";
import { getFlags } from "@/lib/flags";
import { ChatWidget } from "@/components/chatbot/ChatWidget";
import { getBusinessFeatures } from "@/lib/getFeatures";
import { contactRequirements } from "@/lib/patients";
import { safeThemeColor, readableForeground, themeVars } from "@/lib/theme";
import { BrandMark, SocialIcons, ReviewButton, initialsOf } from "@/components/site/Brand";
import { parseSocialLinks, safeReviewLink } from "@/lib/brandLinks";
import { formatOpeningHours, mapsEmbedUrl, openStatus } from "@/lib/hours";
import { siteFontClasses } from "./fonts";
import "./site.css";

export const dynamic = "force-dynamic";

async function getBusiness(slug: string) {
  return prisma.business.findUnique({
    where: { slug },
    include: {
      services: { where: { isActive: true }, orderBy: { createdAt: "asc" } },
      staff: { where: { isActive: true }, orderBy: { createdAt: "asc" } },
      workingHours: { where: { staffId: null } },
    },
  });
}

const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "calvy.io";
const publicUrlFor = (slug: string) => `https://${slug}.${ROOT_DOMAIN}`;

export async function generateMetadata(props: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const params = await props.params;
  const business = await getBusiness(params.slug);
  if (!business) return { title: "Not Found" };
  const cfg: WebsiteConfig =
    parseWebsiteConfig(business.websiteJson) ??
    defaultWebsiteConfig(business.name, business.businessType, business);
  const title = cfg.metaTitle || `${business.name} — Book online`;
  const description = cfg.metaDescription || business.description || `Book ${t(business, "appointment", { plural: true })} with ${business.name} online. Pick a ${t(business, "service")}, choose a time, and confirm in seconds.`;
  const url = publicUrlFor(params.slug);
  return {
    title,
    description,
    ...(business.logoUrl ? { icons: { icon: business.logoUrl } } : {}),
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      type: "website",
      ...(cfg.hero?.image ? { images: [{ url: cfg.hero.image }] } : {}),
    },
    twitter: { card: cfg.hero?.image ? "summary_large_image" : "summary", title, description },
  };
}

/** Services grouped by category in first-seen order; the "other" default reads as plain "Other services". */
function groupByCategory<T extends { category: string }>(services: T[]): { key: string; label: string; items: T[] }[] {
  const groups = new Map<string, T[]>();
  for (const s of services) groups.set(s.category, [...(groups.get(s.category) ?? []), s]);
  return [...groups].map(([key, items]) => {
    const label = key === "other" ? "Other services" : key.replace(/[-_]+/g, " ").replace(/^./, (c) => c.toUpperCase());
    return { key, label, items };
  });
}

export default async function TenantWebsitePage(props: { params: Promise<{ slug: string }> }) {
  const params = await props.params;
  const business = await getBusiness(params.slug);
  if (!business) notFound();

  const cfg: WebsiteConfig =
    parseWebsiteConfig(business.websiteJson) ??
    defaultWebsiteConfig(business.name, business.businessType, business);

  const primary = safeThemeColor(business.primaryColor);
  const primaryFg = readableForeground(primary);
  const social = parseSocialLinks(business.socialLinks);
  const reviewUrl = safeReviewLink(business.googleReviewUrl);
  const hours = formatOpeningHours(business.workingHours);
  const hasHours = business.workingHours.length > 0;
  const bookingUrl = `/book-now`;
  const features = await getBusinessFeatures(business.id);

  // ── SEO: schema.org structured data (LocalBusiness + service offers) ──
  const publicUrl = publicUrlFor(business.slug);
  const currency = business.currency ?? "INR";
  const prices = business.services.map(s => s.price).filter(p => p > 0);
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    "@id": `${publicUrl}#business`,
    name: business.name,
    description: cfg.metaDescription || business.description || `Book ${t(business, "appointment", { plural: true })} with ${business.name}.`,
    url: publicUrl,
    ...(business.phone ? { telephone: business.phone } : {}),
    ...(business.email ? { email: business.email } : {}),
    ...(business.address ? { address: { "@type": "PostalAddress", streetAddress: business.address } } : {}),
    ...(business.logoUrl ? { logo: business.logoUrl } : {}),
    ...(cfg.hero?.image ? { image: cfg.hero.image } : {}),
    ...(Object.values(social).length ? { sameAs: Object.values(social) } : {}),
    ...(prices.length ? { priceRange: `${formatCurrencyAmount(Math.min(...prices), currency)} - ${formatCurrencyAmount(Math.max(...prices), currency)}` } : {}),
    potentialAction: {
      "@type": "ReserveAction",
      target: `${publicUrl}/book-now`,
      name: `Book an ${t(business, "appointment")}`,
    },
    makesOffer: business.services.map(s => ({
      "@type": "Offer",
      price: s.price,
      priceCurrency: currency,
      itemOffered: {
        "@type": "Service",
        name: s.name,
        ...(s.description ? { description: s.description } : {}),
        provider: { "@type": "LocalBusiness", name: business.name },
      },
    })),
  };

  const fontClasses = await siteFontClasses(business.packId);
  const status = hasHours ? openStatus(business.workingHours, business.timezone) : null;
  const showHours = cfg.contact.showHours !== false && hasHours;
  const showAddress = cfg.contact.showAddress && !!business.address;
  const showMap = cfg.contact.showMap !== false && showAddress;
  const logoRadius = business.packId === "SALON_SPA" || business.packId === "CONSULTANT" ? "rounded-full" : "rounded-[10px]";
  const groups = groupByCategory(business.services);
  const hasTeam = cfg.team.enabled && business.staff.length > 0;
  const hasSocial = Object.keys(social).length > 0;
  const showPhone = cfg.contact.showPhone && !!business.phone;
  const showEmail = cfg.contact.showEmail && !!business.email;
  const hasContactRows = showPhone || showEmail || showAddress;
  const factItems = [
    status && showHours && { key: "hours", icon: <Clock className="st-ico" aria-hidden />, text: <span className={status.open ? "st-open" : "st-shut"}>{status.label}</span> },
    showAddress && { key: "address", icon: <MapPin className="st-ico" aria-hidden />, text: <span>{business.address}</span> },
    showPhone && { key: "phone", icon: <Phone className="st-ico" aria-hidden />, text: <a href={`tel:${business.phone}`}>{business.phone}</a> },
  ].filter(Boolean) as { key: string; icon: React.ReactNode; text: React.ReactNode }[];

  return (
    <div className={`st ${fontClasses}`} data-pack={business.packId} style={themeVars(primary) as React.CSSProperties}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <a className="st-sr" href="#main">Skip to content</a>

      {/* ── HEADER ── */}
      <header className="st-head">
        <div className="st-wrap">
          <span className="st-brand">
            <BrandMark name={business.name} logoUrl={business.logoUrl} color={primary} fg={primaryFg} size={40} rounded={logoRadius} />
            <b>{business.name}</b>
          </span>
          <nav className="st-nav" aria-label="Sections">
            {cfg.about.enabled && <a href="#about">{cfg.about.title}</a>}
            {cfg.services.enabled && business.services.length > 0 && <a href="#services">{cfg.services.title}</a>}
            {hasTeam && <a href="#team">{cfg.team.title}</a>}
            {cfg.contact.enabled && <a href="#contact">{cfg.contact.title}</a>}
          </nav>
          <Link href={bookingUrl} className="st-btn st-btn-primary st-btn-sm">{cfg.hero.ctaText}</Link>
        </div>
      </header>

      <main id="main">
        {/* ── HERO ── */}
        {cfg.hero.enabled && (
          <section className="st-hero">
            <div className={`st-wrap st-hero-grid${cfg.hero.image ? " has-image" : ""}`}>
              <div>
                {cfg.hero.badge && <span className="st-badge">{cfg.hero.badge}</span>}
                <h1>{cfg.hero.headline}</h1>
                {cfg.hero.subheadline && <p className="st-lede">{cfg.hero.subheadline}</p>}
                <div className="st-ctas">
                  <Link href={bookingUrl} className="st-btn st-btn-primary">{cfg.hero.ctaText}</Link>
                  {cfg.services.enabled && cfg.hero.secondaryCtaText && business.services.length > 0 && (
                    <a href="#services" className="st-btn st-btn-ghost">{cfg.hero.secondaryCtaText}</a>
                  )}
                </div>
              </div>
              {cfg.hero.image && (
                <div className="st-media">
                  <Image src={cfg.hero.image} alt={business.name} fill priority sizes="(max-width: 900px) 100vw, 45vw" unoptimized />
                </div>
              )}
            </div>
          </section>
        )}

        {/* ── QUICK FACTS ── */}
        {factItems.length > 0 && (
          <div className="st-facts">
            <div className="st-wrap">
              <ul>{factItems.map((f) => <li key={f.key}>{f.icon}{f.text}</li>)}</ul>
            </div>
          </div>
        )}

        {/* ── SERVICES ── */}
        {cfg.services.enabled && business.services.length > 0 && (
          <section id="services" className="st-section">
            <div className="st-wrap st-svc-layout">
              <div className="st-head-sec">
                {cfg.services.badge && <div className="st-kicker">{cfg.services.badge}</div>}
                <h2>{cfg.services.title}</h2>
                {cfg.services.subtitle && <p>{cfg.services.subtitle}</p>}
              </div>
              <div>
                {groups.map((g) => (
                  <div key={g.key} className="st-svc-group">
                    {groups.length > 1 && <h3>{g.label}</h3>}
                    {g.items.map((svc) => (
                      <div key={svc.id} className="st-svc">
                        <div className="st-svc-name">
                          {svc.name}
                          {svc.capacity > 1 && <span className="st-tag">Up to {svc.capacity} people</span>}
                        </div>
                        <div className="st-svc-price">{svc.price === 0 ? "Free" : formatCurrencyAmount(svc.price, business.currency)}</div>
                        {svc.description && <p className="st-svc-desc">{svc.description}</p>}
                        <div className="st-svc-meta">{svc.duration} min</div>
                        <Link href={`${bookingUrl}?service=${svc.id}`} className="st-btn st-btn-ghost st-btn-sm" aria-label={`Book ${svc.name}`}>Book</Link>
                      </div>
                    ))}
                  </div>
                ))}
                {cfg.services.ctaText && (
                  <div className="st-more">
                    <Link href={bookingUrl} className="st-btn st-btn-primary">{cfg.services.ctaText}</Link>
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        {/* ── TEAM ── */}
        {hasTeam && (
          <section id="team" className="st-section tint">
            <div className="st-wrap">
              <div className="st-head-sec">
                {cfg.team.badge && <div className="st-kicker">{cfg.team.badge}</div>}
                <h2>{cfg.team.title}</h2>
                {cfg.team.subtitle && <p>{cfg.team.subtitle}</p>}
              </div>
              <ul className="st-team">
                {business.staff.map((member) => (
                  <li key={member.id} className="st-person">
                    <div className="st-avatar" aria-hidden>{initialsOf(member.name)}</div>
                    <b>{member.name}</b>
                    <span className="st-muted">{member.role}</span>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        )}

        {/* ── ABOUT ── */}
        {cfg.about.enabled && (
          <section id="about" className="st-section">
            <div className="st-wrap st-about">
              {cfg.about.image && (
                <div className="st-media">
                  <Image src={cfg.about.image} alt={business.name} fill sizes="(max-width: 900px) 100vw, 50vw" unoptimized />
                </div>
              )}
              <div>
                {cfg.about.badge && <div className="st-kicker">{cfg.about.badge}</div>}
                <h2>{cfg.about.title}</h2>
                <p className="st-about-body">{cfg.about.body}</p>
                {cfg.about.trustLabel && business.services.length > 0 && (
                  <p className="st-trust">{cfg.about.trustLabel}: {business.services.length} {t(business, "service", { plural: business.services.length !== 1 })}</p>
                )}
                {cfg.about.ctaText && (
                  <Link href={bookingUrl} className="st-link">{cfg.about.ctaText} <ArrowRight size={16} aria-hidden /></Link>
                )}
              </div>
            </div>
          </section>
        )}

        {/* ── VISIT / CONTACT ── */}
        {cfg.contact.enabled && (
          <section id="contact" className="st-section tint">
            <div className="st-wrap st-visit">
              <div>
                {cfg.contact.badge && <div className="st-kicker">{cfg.contact.badge}</div>}
                <h2>{cfg.contact.title}</h2>
                {cfg.contact.subtext && <p className="st-muted" style={{ marginTop: 10 }}>{cfg.contact.subtext}</p>}
                {showHours && status && (
                  <table className="st-hours">
                    <caption className="st-sr">Opening hours</caption>
                    <tbody>
                      {hours.map((h) => (
                        <tr key={h.weekday} className={`${h.weekday === status.weekday ? "today" : ""} ${h.closed ? "closed" : ""}`}>
                          <th scope="row">
                            {h.day}
                            {h.weekday === status.weekday && <span className="st-today-tag">Today</span>}
                          </th>
                          <td>{h.label.split(", ").map((range, i) => <span key={i}>{i > 0 && <br />}{range}</span>)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                {hasContactRows && (
                  <ul className="st-contact">
                    {showPhone && <li><a href={`tel:${business.phone}`}><Phone className="st-ico" aria-hidden />{business.phone}</a></li>}
                    {showEmail && <li><a href={`mailto:${business.email}`}><Mail className="st-ico" aria-hidden />{business.email}</a></li>}
                    {showAddress && <li><div><MapPin className="st-ico" aria-hidden />{business.address}</div></li>}
                  </ul>
                )}
              </div>
              {showMap && (
                <div className="st-map">
                  <iframe title={`Map of ${business.name}`} src={mapsEmbedUrl(business.address!)} loading="lazy" referrerPolicy="no-referrer-when-downgrade" />
                </div>
              )}
              <div className="st-cta">
                <div>
                  <h3>{cfg.contact.ctaHeading}</h3>
                  {cfg.contact.ctaSubtext && <p>{cfg.contact.ctaSubtext}</p>}
                </div>
                <div>
                  <Link href={bookingUrl} className="st-btn st-btn-primary">{cfg.hero.ctaText}</Link>
                  {cfg.contact.ctaNote && <small>{cfg.contact.ctaNote}</small>}
                </div>
              </div>
            </div>
          </section>
        )}

        {/* ── REVIEW + SOCIAL ── */}
        {(reviewUrl || hasSocial) && (
          <section className="st-section">
            <div className={`st-wrap st-connect${reviewUrl && hasSocial ? " two" : ""}`}>
              {reviewUrl && (
                <div className="st-panel">
                  <h3>Happy with your visit?</h3>
                  <p>A quick Google review helps others find us.</p>
                  <ReviewButton href={reviewUrl} color={primary} fg={primaryFg} />
                </div>
              )}
              {hasSocial && (
                <div className="st-panel">
                  <h3>Follow {business.name}</h3>
                  <p>Updates and news.</p>
                  <SocialIcons links={social} tone="dark" />
                </div>
              )}
            </div>
          </section>
        )}
      </main>

      {/* ── FOOTER ── */}
      <footer className="st-foot">
        <div className="st-wrap">
          <span>{business.name}{business.address ? `, ${business.address}` : ""}</span>
          <nav aria-label="Footer">
            {cfg.about.enabled && <a href="#about">{cfg.about.title}</a>}
            {cfg.services.enabled && business.services.length > 0 && <a href="#services">{cfg.services.title}</a>}
            {hasTeam && <a href="#team">{cfg.team.title}</a>}
            {cfg.contact.enabled && <a href="#contact">{cfg.contact.title}</a>}
          </nav>
        </div>
      </footer>

      {/* Mobile: the booking button stays in reach */}
      <div className="st-bar">
        <Link href={bookingUrl} className="st-btn st-btn-primary st-btn-block">{cfg.hero.ctaText}</Link>
      </div>

      {/* Chat booking widget, plan-gated */}
      {features.chatbotWidget && getFlags().chatWidget && business.bookingMode !== "TOKEN" && (
        <ChatWidget business={{
          slug: business.slug,
          name: business.name,
          primaryColor: primary,
          currency: business.currency ?? "USD",
          phoneRequired: contactRequirements(business.currency).phone,
          services: business.services.map(s => ({
            id: s.id,
            name: s.name,
            duration: s.duration,
            price: s.price,
            color: s.color,
            capacity: (s as { capacity?: number }).capacity ?? 1,
          })),
        }} />
      )}
    </div>
  );
}
