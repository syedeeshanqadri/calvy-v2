import { jsonLdString } from "@/lib/jsonLd";
import { notFound } from "next/navigation";
import { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { prisma } from "@/lib/prisma";
import { t } from "@/lib/terms";
import { parseWebsiteConfig, defaultWebsiteConfig, WebsiteConfig, currentPhoto, focusPosition } from "@/lib/website";
import { MapPin, Phone, Mail, Clock, ArrowRight, Check, Users, Tag, MessageCircle, CalendarClock, Video } from "lucide-react";
import { formatCurrencyAmount } from "@/lib/currency";
import { getFlags } from "@/lib/flags";
import { ChatWidget } from "@/components/chatbot/ChatWidget";
import { getBusinessFeatures } from "@/lib/getFeatures";
import { contactRequirements } from "@/lib/patients";
import { safeThemeColor, readableForeground, themeVars, brandInk } from "@/lib/theme";
import { BrandMark, SocialIcons, ReviewButton, initialsOf } from "@/components/site/Brand";
import { parseSocialLinks, safeReviewLink } from "@/lib/brandLinks";
import { formatOpeningHours, mapsEmbedUrl, openStatus, summarizeHours } from "@/lib/hours";
import { siteFontClasses } from "./fonts";
import { SiteHero } from "./SiteHero";
import { Suspense } from "react";
import { HeroAvailabilityCard } from "./HeroAvailabilityCard";
import { offersOnline, onlineBadge } from "@/lib/online";
import { PackIcon } from "@/components/site/PackIcon";
import { getPack } from "@/lib/packs";
import { resolveHeroLayout, offerVisible, sanitizeGallery, sanitizeFaq, faqJsonLd, parseServiceLayout } from "@/lib/siteSections";
import { OfferBanner, GallerySection, FaqSection, TeamCards, ServiceCards } from "@/components/site/SiteSections";
import "./site.css";
import { headers } from "next/headers";
import { siteBase, publicSiteUrl } from "@/lib/siteBase";

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
const publicUrlFor = (slug: string) => publicSiteUrl(slug, ROOT_DOMAIN);

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
  const bookingUrl = `${siteBase((await headers()).get("host"), business.slug, ROOT_DOMAIN)}/book-now`;
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
  const showOffer = offerVisible(cfg.offer, new Date(), business.timezone);
  const galleryImages = cfg.gallery && cfg.gallery.enabled !== false ? sanitizeGallery(cfg.gallery.images) : [];
  const faqItems = cfg.faq && cfg.faq.enabled !== false ? sanitizeFaq(cfg.faq.items) : [];
  const faqLd = faqJsonLd(faqItems);
  const serviceCards = parseServiceLayout(cfg.serviceLayout) === "cards";
  const hasSocial = Object.keys(social).length > 0;
  const showPhone = cfg.contact.showPhone && !!business.phone;
  const showEmail = cfg.contact.showEmail && !!business.email;
  const hasContactRows = showPhone || showEmail || showAddress;
  const heroImage = currentPhoto(cfg.hero.image, business.businessType, "hero");
  const aboutImage = currentPhoto(cfg.about.image, business.businessType, "about");
  const onInvert = primaryFg === "#ffffff" ? brandInk(primary) : primary;
  const footerHours = summarizeHours(hours);
  const pack = getPack(business.packId);
  const serviceCount = business.services.length;
  const staffCount = business.staff.length;
  // The next-available card streams in after the page, so a slow availability lookup never delays it.
  const wantsAvailability = cfg.hero.enabled && (business.bookingMode === "TOKEN" || serviceCount > 0);
  const availabilityCard = (where: "in-copy" | "in-media") => wantsAvailability ? (
    <Suspense fallback={null}>
      <HeroAvailabilityCard
        businessId={business.id} timezone={business.timezone} maxAdvanceDays={business.maxAdvanceDays} mode={business.bookingMode}
        serviceId={business.services[0]?.id ?? ""} serviceName={business.services[0]?.name ?? ""} bookingUrl={bookingUrl} ctaText={cfg.hero.ctaText} where={where}
      />
    </Suspense>
  ) : null;
  const anyOnline = business.services.some(offersOnline);
  const heroChips: { icon: React.ReactNode; label: string; sub?: string; live?: boolean; pos?: "a" | "b" }[] = [];
  // The availability card sits where the open-now chip would; the open status is also in the top bar.
  if (status && showHours && !wantsAvailability) heroChips.push({ icon: <Clock aria-hidden />, label: status.label, live: status.open, pos: "a" });
  if (prices.length > 0) heroChips.push({ icon: <Tag aria-hidden />, label: `From ${formatCurrencyAmount(Math.min(...prices), business.currency)}`, sub: `${serviceCount} ${t(business, "service", { plural: serviceCount !== 1 })}`, pos: "b" });
  const heroTrust: { icon: React.ReactNode; text: string }[] = [];
  if (staffCount > 0) heroTrust.push({ icon: <Users aria-hidden />, text: `${staffCount} ${t(business, "staff", { plural: staffCount !== 1 })}` });
  if (serviceCount > 0) heroTrust.push({ icon: <PackIcon name={pack.icons.service} />, text: `${serviceCount} ${t(business, "service", { plural: serviceCount !== 1 })}` });
  heroTrust.push({ icon: <Check aria-hidden />, text: cfg.contact.ctaNote || "Book online in minutes" });
  const quickServices = cfg.services.enabled ? business.services.slice(0, 5) : [];
  const railItems = [
    social.whatsapp && { href: social.whatsapp, label: "WhatsApp", icon: <MessageCircle className="st-ico" aria-hidden />, external: true },
    { href: bookingUrl, label: "Book now", icon: <CalendarClock className="st-ico" aria-hidden />, external: false },
    showPhone && { href: `tel:${business.phone}`, label: "Call", icon: <Phone className="st-ico" aria-hidden />, external: false },
  ].filter(Boolean) as { href: string; label: string; icon: React.ReactNode; external: boolean }[];

  return (
    <div className={`st ${fontClasses}`} data-pack={business.packId} style={themeVars(primary) as React.CSSProperties}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(jsonLd) }} />
      {faqLd && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(faqLd) }} />}
      <a className="st-sr" href="#main">Skip to content</a>
      {showOffer && <OfferBanner text={cfg.offer!.text.trim()} />}

      {/* ── TOP INFO BAR ── */}
      {((status && showHours) || showAddress || showPhone || hasSocial || anyOnline) && (
        <div className="st-util">
          <div className="st-wrap">
            <div className="st-util-items">
              {status && showHours && (
                <span className="st-util-item"><Clock className="st-ico" aria-hidden /><span className={status.open ? "st-live" : ""}>{status.label}</span></span>
              )}
              {showAddress && <span className="st-util-item hide-sm"><MapPin className="st-ico" aria-hidden />{business.address}</span>}
              {showPhone && <a className="st-util-item" href={`tel:${business.phone}`}><Phone className="st-ico" aria-hidden />{business.phone}</a>}
              {anyOnline && <span className="st-util-item"><Video className="st-ico" aria-hidden />Online appointments available</span>}
            </div>
            {hasSocial && <SocialIcons links={social} tone="light" className="hide-sm" />}
          </div>
        </div>
      )}

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
            {galleryImages.length > 0 && <a href="#gallery">{cfg.gallery!.title || "Gallery"}</a>}
            {faqItems.length > 0 && <a href="#faq">FAQ</a>}
            {cfg.contact.enabled && <a href="#contact">{cfg.contact.title}</a>}
          </nav>
          <Link href={bookingUrl} className="st-btn st-btn-primary st-btn-sm">{cfg.hero.ctaText}</Link>
        </div>
      </header>

      <main id="main">
        {/* ── HERO ── */}
        {cfg.hero.enabled && (
          <SiteHero
            layout={resolveHeroLayout(cfg.heroLook, business.packId)}
            businessName={business.name}
            badge={cfg.hero.badge}
            headline={cfg.hero.headline}
            subheadline={cfg.hero.subheadline}
            ctaText={cfg.hero.ctaText}
            secondaryCtaText={cfg.services.enabled && serviceCount > 0 ? cfg.hero.secondaryCtaText : undefined}
            bookingUrl={bookingUrl}
            image={heroImage}
            imageFocus={cfg.hero.imageFocus}
            chips={heroChips}
            trust={heroTrust}
            sealIcon={<PackIcon name={pack.icons.pack} />}
            availabilityCopy={availabilityCard("in-copy")}
            availabilityMedia={availabilityCard("in-media")}
          />
        )}

        {/* ── SERVICE SHORTCUTS ── */}
        {quickServices.length >= 2 && (
          <section className="st-quick" aria-label={cfg.services.title}>
            <div className="st-wrap">
              <ul className="st-quick-row" style={{ "--cols": quickServices.length } as React.CSSProperties}>
                {quickServices.map((svc) => (
                  <li key={svc.id}>
                    <Link href={`${bookingUrl}?service=${svc.id}`} className="st-quick-tile">
                      <span className="st-ico-wrap"><PackIcon name={pack.icons.service} /></span>
                      <span>
                        <b>{svc.name}</b>
                        <small>{svc.duration} min · {svc.price === 0 ? "Free" : formatCurrencyAmount(svc.price, business.currency)}{offersOnline(svc) ? ` · ${onlineBadge(svc)}` : ""}</small>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </section>
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
                {serviceCards ? (
                  <ServiceCards services={business.services} bookingUrl={bookingUrl} currency={business.currency} />
                ) : (
                  <>
                {groups.map((g) => (
                  <div key={g.key} className="st-svc-group">
                    {groups.length > 1 && <h3>{g.label}</h3>}
                    {g.items.map((svc) => (
                      <div key={svc.id} className="st-svc">
                        <div className="st-svc-name">
                          {svc.name}
                          {svc.capacity > 1 && <span className="st-tag">Up to {svc.capacity} people</span>}
                          {offersOnline(svc) && <span className="st-online"><Video className="st-ico" aria-hidden />{onlineBadge(svc)}</span>}
                        </div>
                        <div className="st-svc-price">{svc.price === 0 ? "Free" : formatCurrencyAmount(svc.price, business.currency)}</div>
                        {svc.description && <p className="st-svc-desc">{svc.description}</p>}
                        <div className="st-svc-meta">{svc.duration} min</div>
                        <Link href={`${bookingUrl}?service=${svc.id}`} className="st-btn st-btn-ghost st-btn-sm" aria-label={`Book ${svc.name}`}>Book</Link>
                      </div>
                    ))}
                  </div>
                ))}
                  </>
                )}
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
              <TeamCards staff={business.staff} />
            </div>
          </section>
        )}

        {/* ── ABOUT ── */}
        {cfg.about.enabled && (
          <section id="about" className="st-section">
            <div className="st-wrap st-about">
              {aboutImage && (
                <div className="st-about-media">
                  <Image src={aboutImage} alt={business.name} fill sizes="(max-width: 900px) 100vw, 50vw" style={{ objectPosition: focusPosition(cfg.about.imageFocus) }} unoptimized />
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
                {cfg.contact.subtext && <p className="st-muted" style={{ marginTop: 12 }}>{cfg.contact.subtext}</p>}
                {showHours && status && (
                  <div className="st-card">
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
                  </div>
                )}
                {hasContactRows && (
                  <ul className="st-contact">
                    {showPhone && <li><a href={`tel:${business.phone}`}><Phone className="st-ico" aria-hidden />{business.phone}</a></li>}
                    {showEmail && <li><a href={`mailto:${business.email}`}><Mail className="st-ico" aria-hidden />{business.email}</a></li>}
                    {showAddress && <li><div><MapPin className="st-ico" aria-hidden />{business.address}</div></li>}
                  </ul>
                )}
              </div>
              <div className="st-visit-side">
                <div className="st-cta-card">
                  <h3>{cfg.contact.ctaHeading}</h3>
                  {cfg.contact.ctaSubtext && <p>{cfg.contact.ctaSubtext}</p>}
                  <Link href={bookingUrl} className="st-btn st-btn-invert" style={{ "--on-invert": onInvert } as React.CSSProperties}>{cfg.hero.ctaText}</Link>
                  {cfg.contact.ctaNote && <small>{cfg.contact.ctaNote}</small>}
                </div>
                {showMap && (
                  <div className="st-map">
                    <iframe title={`Map of ${business.name}`} src={mapsEmbedUrl(business.address!)} loading="lazy" referrerPolicy="no-referrer-when-downgrade" />
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        {/* ── GALLERY ── */}
        {galleryImages.length > 0 && <GallerySection title={cfg.gallery!.title || "Gallery"} images={galleryImages} />}

        {/* ── FAQ ── */}
        {faqItems.length > 0 && <FaqSection title={cfg.faq!.title || "Questions we get asked"} items={faqItems} />}

        {/* ── REVIEW ── */}
        {reviewUrl && (
          <section className="st-section">
            <div className="st-wrap">
              <div className="st-review">
                <div>
                  <h3>Happy with your visit?</h3>
                  <p>A quick Google review helps others find us.</p>
                </div>
                <ReviewButton href={reviewUrl} color={primary} fg={primaryFg} />
              </div>
            </div>
          </section>
        )}
      </main>

      {/* ── FOOTER ── */}
      <footer className="st-foot">
        <div className="st-wrap st-foot-grid">
          <div>
            <div className="st-foot-name">
              <BrandMark name={business.name} logoUrl={business.logoUrl} color={primary} fg={primaryFg} size={40} rounded={logoRadius} />
              {business.name}
            </div>
            {business.description && <p className="st-foot-desc">{business.description}</p>}
            {hasSocial && <SocialIcons links={social} tone="light" className="st-foot-social" />}
          </div>
          <nav aria-label="Footer">
            <h3>Explore</h3>
            <ul>
              {cfg.about.enabled && <li><a href="#about">{cfg.about.title}</a></li>}
              {cfg.services.enabled && business.services.length > 0 && <li><a href="#services">{cfg.services.title}</a></li>}
              {hasTeam && <li><a href="#team">{cfg.team.title}</a></li>}
              {cfg.contact.enabled && <li><a href="#contact">{cfg.contact.title}</a></li>}
              <li><Link href={bookingUrl}>{cfg.hero.ctaText}</Link></li>
            </ul>
          </nav>
          {hasContactRows && (
            <div>
              <h3>Contact</h3>
              <ul>
                {showPhone && <li><a href={`tel:${business.phone}`}><Phone className="st-ico" aria-hidden />{business.phone}</a></li>}
                {showEmail && <li><a href={`mailto:${business.email}`}><Mail className="st-ico" aria-hidden />{business.email}</a></li>}
                {showAddress && <li><span><MapPin className="st-ico" aria-hidden />{business.address}</span></li>}
              </ul>
            </div>
          )}
          {showHours && (
            <div>
              <h3>Opening hours</h3>
              <dl className="st-foot-hours">
                {footerHours.map((h) => (
                  <div key={h.days}><dt>{h.days}</dt><dd>{h.label}</dd></div>
                ))}
              </dl>
            </div>
          )}
        </div>
        <div className="st-foot-base">
          <div className="st-wrap">
            <span>&copy; {new Date().getFullYear()} {business.name}</span>
            <span>Want a site like this? <a href="https://calvy.io">Grab it on Calvy</a></span>
          </div>
        </div>
      </footer>

      {/* Mobile: the booking button stays in reach */}
      <div className="st-bar">
        <Link href={bookingUrl} className="st-btn st-btn-primary st-btn-block">{cfg.hero.ctaText}</Link>
      </div>

      {/* Desktop: contact shortcuts stay on screen */}
      {railItems.length >= 2 && (
        <nav className="st-rail" aria-label="Contact shortcuts">
          {railItems.map((item) => (
            <a key={item.label} href={item.href} {...(item.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
              {item.icon}
              {item.label}
            </a>
          ))}
        </nav>
      )}

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
