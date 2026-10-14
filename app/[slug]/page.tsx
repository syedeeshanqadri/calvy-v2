import { notFound } from "next/navigation";
import { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { prisma } from "@/lib/prisma";
import { parseWebsiteConfig, defaultWebsiteConfig, WebsiteConfig } from "@/lib/website";
import { MapPin, Phone, Mail, Clock, ChevronDown, ArrowRight, Star, CheckCircle2 } from "lucide-react";
import { formatCurrencyAmount } from "@/lib/currency";
import { ChatWidget } from "@/components/chatbot/ChatWidget";
import { getBusinessFeatures } from "@/lib/getFeatures";

export const dynamic = "force-dynamic";

async function getBusiness(slug: string) {
  return prisma.business.findUnique({
    where: { slug },
    include: {
      services: { where: { isActive: true }, orderBy: { createdAt: "asc" } },
      staff: { where: { isActive: true }, orderBy: { createdAt: "asc" } },
    },
  });
}

const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "calvy.io";
const publicUrlFor = (slug: string) => `https://${slug}.${ROOT_DOMAIN}`;

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const business = await getBusiness(params.slug);
  if (!business) return { title: "Not Found" };
  const cfg: WebsiteConfig =
    parseWebsiteConfig(business.websiteJson) ??
    defaultWebsiteConfig(business.name, business.businessType);
  const title = cfg.metaTitle || `${business.name} — Book online`;
  const description = cfg.metaDescription || business.description || `Book appointments with ${business.name} online. Pick a service, choose a time, and confirm in seconds.`;
  const url = publicUrlFor(params.slug);
  return {
    title,
    description,
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

const STAFF_COLORS = ["#0284c7","#3b82f6","#22c55e","#8b5cf6","#f59e0b","#ec4899","#14b8a6","#f97316"];

export default async function TenantWebsitePage({ params }: { params: { slug: string } }) {
  const business = await getBusiness(params.slug);
  if (!business) notFound();

  const cfg: WebsiteConfig =
    parseWebsiteConfig(business.websiteJson) ??
    defaultWebsiteConfig(business.name, business.businessType);

  const primary = business.primaryColor || "#0284c7";
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
    description: cfg.metaDescription || business.description || `Book appointments with ${business.name}.`,
    url: publicUrl,
    ...(business.phone ? { telephone: business.phone } : {}),
    ...(business.email ? { email: business.email } : {}),
    ...(business.address ? { address: { "@type": "PostalAddress", streetAddress: business.address } } : {}),
    ...(cfg.hero?.image ? { image: cfg.hero.image } : {}),
    ...(prices.length ? { priceRange: `${formatCurrencyAmount(Math.min(...prices), currency)} - ${formatCurrencyAmount(Math.max(...prices), currency)}` } : {}),
    potentialAction: {
      "@type": "ReserveAction",
      target: `${publicUrl}/book-now`,
      name: "Book an appointment",
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

  return (
    <div className="min-h-screen bg-white text-gray-900 antialiased">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      {/* ── NAVBAR ── */}
      <header className="fixed top-0 left-0 right-0 z-50">
        <div className="mx-auto max-w-7xl px-6 py-4">
          <div className="flex items-center justify-between bg-white/80 backdrop-blur-xl rounded-2xl px-6 py-3 shadow-lg shadow-black/5 border border-white/60">
            <span className="text-xl font-black tracking-tight text-gray-900">{business.name}</span>
            <nav className="hidden md:flex items-center gap-8">
              {cfg.about.enabled    && <a href="#about"    className="text-sm font-medium text-gray-500 hover:text-gray-900 transition-colors">{cfg.about.title}</a>}
              {cfg.services.enabled && <a href="#services" className="text-sm font-medium text-gray-500 hover:text-gray-900 transition-colors">{cfg.services.title}</a>}
              {cfg.team.enabled && business.staff.length > 0 && <a href="#team" className="text-sm font-medium text-gray-500 hover:text-gray-900 transition-colors">{cfg.team.title}</a>}
              {cfg.contact.enabled  && <a href="#contact"  className="text-sm font-medium text-gray-500 hover:text-gray-900 transition-colors">{cfg.contact.title}</a>}
            </nav>
            <Link
              href={bookingUrl}
              className="px-5 py-2.5 rounded-xl text-sm font-bold text-white transition-all hover:scale-105 hover:shadow-lg active:scale-100"
              style={{ background: primary, boxShadow: `0 4px 14px ${primary}55` }}
            >
              {cfg.hero.ctaText}
            </Link>
          </div>
        </div>
      </header>

      {/* ── HERO ── */}
      {cfg.hero.enabled && (
        <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
          <div className="absolute inset-0">
            {cfg.hero.image && (
              <Image src={cfg.hero.image} alt="hero" fill className="object-cover object-center" priority sizes="100vw" unoptimized />
            )}
            <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/55 to-black/80" />
          </div>

          <div className="relative z-10 text-center px-6 max-w-4xl mx-auto pt-24">
            {cfg.hero.badge && (
              <div
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold mb-6 backdrop-blur-sm"
                style={{ background: primary + "33", color: "#fff", border: `1px solid ${primary}55` }}
              >
                <Star size={12} fill="currentColor" />
                {cfg.hero.badge}
              </div>
            )}
            <h1 className="text-5xl md:text-7xl font-black text-white mb-6 leading-[1.05] tracking-tight">
              {cfg.hero.headline}
            </h1>
            <p className="text-lg md:text-xl text-white/75 mb-10 max-w-2xl mx-auto leading-relaxed">
              {cfg.hero.subheadline}
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                href={bookingUrl}
                className="inline-flex items-center justify-center gap-2.5 px-8 py-4 rounded-2xl text-base font-bold text-white transition-all hover:scale-105 hover:shadow-2xl active:scale-100"
                style={{ background: primary, boxShadow: `0 8px 30px ${primary}66` }}
              >
                {cfg.hero.ctaText} <ArrowRight size={18} />
              </Link>
              {cfg.services.enabled && cfg.hero.secondaryCtaText && (
                <a
                  href="#services"
                  className="inline-flex items-center justify-center gap-2.5 px-8 py-4 rounded-2xl text-base font-bold text-white border border-white/25 backdrop-blur-sm hover:bg-white/10 transition-all"
                >
                  {cfg.hero.secondaryCtaText}
                </a>
              )}
            </div>
          </div>

          <a href="#about" className="absolute bottom-10 left-1/2 -translate-x-1/2 text-white/50 hover:text-white transition-colors animate-bounce">
            <ChevronDown size={28} />
          </a>
        </section>
      )}

      {/* ── ABOUT ── */}
      {cfg.about.enabled && (
        <section id="about" className="py-28 px-6 bg-white">
          <div className="max-w-6xl mx-auto grid md:grid-cols-2 gap-16 items-center">
            <div className="relative">
              <div className="relative h-[480px] rounded-3xl overflow-hidden shadow-2xl">
                {cfg.about.image ? (
                  <Image src={cfg.about.image} alt="About" fill className="object-cover" sizes="(max-width: 768px) 100vw, 50vw" unoptimized />
                ) : (
                  <div className="w-full h-full bg-gray-100" />
                )}
              </div>
              {cfg.about.trustLabel && (
                <div className="absolute -bottom-6 -right-6 bg-white rounded-2xl shadow-xl px-6 py-4 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: primary + "20" }}>
                    <CheckCircle2 size={20} style={{ color: primary }} />
                  </div>
                  <div>
                    <div className="text-xs text-gray-400 font-medium">{cfg.about.trustLabel}</div>
                    <div className="text-sm font-bold text-gray-900">{business.services.length}+ Services</div>
                  </div>
                </div>
              )}
            </div>

            <div>
              {cfg.about.badge && (
                <div className="inline-block text-xs font-bold tracking-widest uppercase mb-4 px-3 py-1.5 rounded-full" style={{ background: primary + "15", color: primary }}>
                  {cfg.about.badge}
                </div>
              )}
              <h2 className="text-4xl font-black mb-6 leading-tight tracking-tight">{cfg.about.title}</h2>
              <p className="text-gray-500 text-lg leading-relaxed whitespace-pre-line mb-8">{cfg.about.body}</p>
              {cfg.about.ctaText && (
                <Link href={bookingUrl} className="inline-flex items-center gap-2 font-bold text-sm transition-all hover:gap-3" style={{ color: primary }}>
                  {cfg.about.ctaText} <ArrowRight size={16} />
                </Link>
              )}
            </div>
          </div>
        </section>
      )}

      {/* ── SERVICES ── */}
      {cfg.services.enabled && business.services.length > 0 && (
        <section id="services" className="py-28 px-6" style={{ background: "#f8f9fb" }}>
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-16">
              {cfg.services.badge && (
                <div className="inline-block text-xs font-bold tracking-widest uppercase mb-4 px-3 py-1.5 rounded-full" style={{ background: primary + "15", color: primary }}>
                  {cfg.services.badge}
                </div>
              )}
              <h2 className="text-4xl font-black mb-4 tracking-tight">{cfg.services.title}</h2>
              <p className="text-gray-500 text-lg max-w-xl mx-auto">{cfg.services.subtitle}</p>
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {business.services.map((svc, i) => (
                <Link
                  key={svc.id}
                  href={`${bookingUrl}?service=${svc.id}`}
                  className="group bg-white rounded-3xl p-7 shadow-sm hover:shadow-xl transition-all duration-300 hover:-translate-y-1.5 border border-gray-100/80 block"
                >
                  <div className="flex items-start justify-between mb-5">
                    <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-xl font-black" style={{ background: svc.color + "20", color: svc.color }}>
                      {String(i + 1).padStart(2, "0")}
                    </div>
                    <div className="text-lg font-black" style={{ color: primary }}>
                      {svc.price === 0 ? "Free" : formatCurrencyAmount(svc.price, business.currency)}
                    </div>
                  </div>
                  <h3 className="font-black text-lg mb-2 tracking-tight group-hover:text-gray-700 transition-colors">{svc.name}</h3>
                  {svc.description && <p className="text-gray-400 text-sm mb-5 leading-relaxed line-clamp-2">{svc.description}</p>}
                  <div className="flex items-center justify-between pt-4 border-t border-gray-100">
                    <div className="flex items-center gap-1.5 text-xs text-gray-400 font-medium">
                      <Clock size={13} /><span>{svc.duration} min</span>
                    </div>
                    <span className="text-xs font-bold flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: primary }}>
                      Book now <ArrowRight size={12} />
                    </span>
                  </div>
                </Link>
              ))}
            </div>

            {cfg.services.ctaText && (
              <div className="text-center mt-12">
                <Link
                  href={bookingUrl}
                  className="inline-flex items-center gap-2.5 px-8 py-4 rounded-2xl text-sm font-bold text-white transition-all hover:scale-105 hover:shadow-xl active:scale-100"
                  style={{ background: primary, boxShadow: `0 4px 20px ${primary}44` }}
                >
                  {cfg.services.ctaText} <ArrowRight size={16} />
                </Link>
              </div>
            )}
          </div>
        </section>
      )}

      {/* ── TEAM ── */}
      {cfg.team.enabled && business.staff.length > 0 && (
        <section id="team" className="py-28 px-6 bg-white">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-16">
              {cfg.team.badge && (
                <div className="inline-block text-xs font-bold tracking-widest uppercase mb-4 px-3 py-1.5 rounded-full" style={{ background: primary + "15", color: primary }}>
                  {cfg.team.badge}
                </div>
              )}
              <h2 className="text-4xl font-black mb-4 tracking-tight">{cfg.team.title}</h2>
              <p className="text-gray-500 text-lg max-w-xl mx-auto">{cfg.team.subtitle}</p>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {business.staff.map((member, i) => {
                const color = STAFF_COLORS[i % STAFF_COLORS.length];
                const initials = member.name.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase();
                return (
                  <div key={member.id} className="bg-gray-50 rounded-3xl p-6 text-center hover:shadow-lg transition-all duration-300 hover:-translate-y-1 border border-gray-100">
                    <div
                      className="w-20 h-20 rounded-2xl mx-auto mb-4 flex items-center justify-center text-white text-2xl font-black shadow-lg"
                      style={{ background: `linear-gradient(135deg, ${color}, ${color}cc)` }}
                    >
                      {initials}
                    </div>
                    <div className="font-black text-base mb-1 tracking-tight">{member.name}</div>
                    <div className="text-xs font-bold px-3 py-1 rounded-full inline-block" style={{ background: color + "18", color }}>
                      {member.role}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* ── CONTACT ── */}
      {cfg.contact.enabled && (
        <section id="contact" className="py-28 px-6 relative overflow-hidden">
          <div className="absolute inset-0">
            <div className="absolute inset-0" style={{ background: `linear-gradient(135deg, ${primary}ee 0%, ${primary}cc 100%)` }} />
            <div className="absolute inset-0 opacity-10" style={{
              backgroundImage: "radial-gradient(circle at 25% 50%, white 1px, transparent 1px), radial-gradient(circle at 75% 50%, white 1px, transparent 1px)",
              backgroundSize: "60px 60px",
            }} />
          </div>

          <div className="relative z-10 max-w-5xl mx-auto">
            <div className="bg-white rounded-3xl shadow-2xl overflow-hidden">
              <div className="grid md:grid-cols-2">
                {/* Info panel */}
                <div className="p-10 bg-gray-900 text-white">
                  {cfg.contact.badge && (
                    <div className="text-xs font-bold tracking-widest uppercase text-white/40 mb-4">{cfg.contact.badge}</div>
                  )}
                  <h2 className="text-3xl font-black mb-3 leading-tight">{cfg.contact.title}</h2>
                  {cfg.contact.subtext && (
                    <p className="text-white/50 text-sm mb-10 leading-relaxed">{cfg.contact.subtext}</p>
                  )}
                  <div className="space-y-5">
                    {cfg.contact.showPhone && business.phone && (
                      <a href={`tel:${business.phone}`} className="flex items-center gap-4 group">
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-white/10 group-hover:bg-white/20 transition-colors">
                          <Phone size={16} className="text-white/70" />
                        </div>
                        <div>
                          <div className="text-[10px] text-white/35 font-semibold uppercase tracking-wider">Phone</div>
                          <div className="text-sm font-semibold text-white">{business.phone}</div>
                        </div>
                      </a>
                    )}
                    {cfg.contact.showEmail && business.email && (
                      <a href={`mailto:${business.email}`} className="flex items-center gap-4 group">
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-white/10 group-hover:bg-white/20 transition-colors">
                          <Mail size={16} className="text-white/70" />
                        </div>
                        <div>
                          <div className="text-[10px] text-white/35 font-semibold uppercase tracking-wider">Email</div>
                          <div className="text-sm font-semibold text-white">{business.email}</div>
                        </div>
                      </a>
                    )}
                    {cfg.contact.showAddress && business.address && (
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-white/10">
                          <MapPin size={16} className="text-white/70" />
                        </div>
                        <div>
                          <div className="text-[10px] text-white/35 font-semibold uppercase tracking-wider">Address</div>
                          <div className="text-sm font-semibold text-white">{business.address}</div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* CTA panel */}
                <div className="p-10 flex flex-col items-center justify-center text-center">
                  <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-6 shadow-lg" style={{ background: primary + "18" }}>
                    <ArrowRight size={28} style={{ color: primary }} />
                  </div>
                  <h3 className="text-2xl font-black mb-3 tracking-tight">{cfg.contact.ctaHeading}</h3>
                  <p className="text-gray-400 text-sm mb-8 leading-relaxed max-w-xs">{cfg.contact.ctaSubtext}</p>
                  <Link
                    href={bookingUrl}
                    className="w-full flex items-center justify-center gap-2.5 py-4 rounded-2xl text-base font-bold text-white transition-all hover:scale-[1.02] hover:shadow-xl active:scale-100"
                    style={{ background: primary, boxShadow: `0 4px 20px ${primary}44` }}
                  >
                    {cfg.hero.ctaText} <ArrowRight size={18} />
                  </Link>
                  {cfg.contact.ctaNote && (
                    <p className="text-xs text-gray-400 mt-4">{cfg.contact.ctaNote}</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ── FOOTER ── */}
      <footer className="py-10 px-6 bg-gray-950 text-white">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div>
            <div className="font-black text-lg">{business.name}</div>
            {business.address && <div className="text-white/35 text-xs mt-0.5">{business.address}</div>}
          </div>
          <div className="flex items-center gap-6">
            {cfg.about.enabled    && <a href="#about"    className="text-white/40 hover:text-white text-xs transition-colors">{cfg.about.title}</a>}
            {cfg.services.enabled && <a href="#services" className="text-white/40 hover:text-white text-xs transition-colors">{cfg.services.title}</a>}
            {cfg.team.enabled && business.staff.length > 0 && <a href="#team" className="text-white/40 hover:text-white text-xs transition-colors">{cfg.team.title}</a>}
            {cfg.contact.enabled  && <a href="#contact"  className="text-white/40 hover:text-white text-xs transition-colors">{cfg.contact.title}</a>}
          </div>
          <Link
            href={bookingUrl}
            className="px-5 py-2.5 rounded-xl text-xs font-bold text-white transition-all hover:opacity-90"
            style={{ background: primary }}
          >
            {cfg.hero.ctaText}
          </Link>
        </div>
      </footer>

      {/* Chat booking widget — plan-gated */}
      {features.chatbotWidget && (
        <ChatWidget business={{
          slug: business.slug,
          name: business.name,
          primaryColor: business.primaryColor || "#0284c7",
          currency: business.currency ?? "USD",
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
