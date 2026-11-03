"use client";
import { useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, Plus, Trash2, ToggleLeft, ToggleRight } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { uploadSitePhoto } from "@/components/dashboard/PhotoField";
import { OfferBanner, GallerySection, FaqSection, TeamCards, ServiceCards, type TeamCardMember, type ServiceCardItem } from "@/components/site/SiteSections";
import { themeVars, safeThemeColor } from "@/lib/theme";
import { SITE_CAPS, defaultHeroLook, parseHeroLook, parseServiceLayout, moveItem, offerVisible, sanitizeGallery, sanitizeFaq, type HeroLook } from "@/lib/siteSections";
import type { WebsiteConfig } from "@/lib/website";
import { cn } from "@/lib/utils";
import "@/app/[slug]/site.css";

interface Props {
  config: WebsiteConfig;
  setConfig: (updater: (c: WebsiteConfig) => WebsiteConfig) => void;
  packId: string;
  themeColor: string;
  timezone: string;
  currency: string;
  imageUpload: boolean;
  staff: TeamCardMember[];
  services: ServiceCardItem[];
}

function Toggle({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={onClick} className="text-[#6b6b80] hover:text-brand-800 ml-3 flex-shrink-0 min-h-[40px] min-w-[40px] flex items-center justify-center">
      {on ? <ToggleRight size={24} className="text-accent" /> : <ToggleLeft size={24} />}
    </button>
  );
}

/** The real site components inside a scoped wrapper, so the preview matches what visitors see. */
function Preview({ children, themeColor, packId }: { children: ReactNode; themeColor: string; packId: string }) {
  return (
    <div className="mt-3">
      <p className="text-xs font-semibold text-[#6b6b80] uppercase tracking-wider mb-1.5">Live preview</p>
      <div className="st rounded-xl border border-[#e8e6e0] overflow-hidden" data-pack={packId} style={{ ...(themeVars(safeThemeColor(themeColor)) as React.CSSProperties), minHeight: 0, ["--sec" as string]: "24px" }}>
        {children}
      </div>
    </div>
  );
}

function Section({ title, enabled, onToggle, children }: { title: string; enabled?: boolean; onToggle?: () => void; children: ReactNode }) {
  return (
    <Card className={cn(enabled === false && "opacity-70")}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>{title}</CardTitle>
          {onToggle && <Toggle on={!!enabled} onClick={onToggle} label={`Show ${title} on your website`} />}
        </div>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">{children}</CardContent>
    </Card>
  );
}

const iconBtn = "min-h-[40px] min-w-[40px] inline-flex items-center justify-center rounded-lg border border-[#e8e6e0] hover:bg-[#f8f7f4] disabled:opacity-40";

export function SectionsEditor({ config, setConfig, packId, themeColor, timezone, currency, imageUpload, staff, services }: Props) {
  const [uploadError, setUploadError] = useState("");
  const [uploading, setUploading] = useState(false);

  const gallery = config.gallery ?? { enabled: false, title: "Gallery", images: [] };
  const offer = config.offer ?? { enabled: false, text: "", endsOn: "" };
  const faq = config.faq ?? { enabled: false, title: "Questions we get asked", items: [] };
  const look = parseHeroLook(config.heroLook) ?? defaultHeroLook(packId);
  const layout = parseServiceLayout(config.serviceLayout);

  const patch = <K extends "gallery" | "offer" | "faq">(key: K, value: Partial<NonNullable<WebsiteConfig[K]>>) =>
    setConfig((c) => ({ ...c, [key]: { ...((c[key] as object) ?? (key === "gallery" ? gallery : key === "offer" ? offer : faq)), ...value } }));

  async function addPhotos(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true); setUploadError("");
    const room = SITE_CAPS.galleryImages - gallery.images.length;
    const picked = Array.from(files).slice(0, Math.max(0, room));
    const added: { url: string; alt: string }[] = [];
    try {
      for (const f of picked) added.push({ url: await uploadSitePhoto(f, "gallery"), alt: "" });
      if (files.length > picked.length) setUploadError(`Only ${SITE_CAPS.galleryImages} photos fit in the gallery; the extra files were skipped.`);
    } catch (e) {
      setUploadError((e as Error).message);
    } finally {
      if (added.length) setConfig((c) => ({ ...c, gallery: { ...(c.gallery ?? gallery), images: [...(c.gallery?.images ?? []), ...added].slice(0, SITE_CAPS.galleryImages) } }));
      setUploading(false);
    }
  }

  const looks: { v: HeroLook; label: string; hint: string }[] = [
    { v: "split", label: "Split", hint: "Photo beside the text" },
    { v: "arch", label: "Arch", hint: "Arched photo with a seal" },
    { v: "dark", label: "Dark full-bleed", hint: "Full photo, white text" },
  ];

  return (
    <>
      <Section title="Hero look">
        <div role="radiogroup" aria-label="Hero look" className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {looks.map((o) => (
            <button key={o.v} type="button" role="radio" aria-checked={look === o.v} onClick={() => setConfig((c) => ({ ...c, heroLook: o.v }))}
              className={cn("text-left rounded-xl border-2 px-4 py-3 min-h-[56px]", look === o.v ? "border-accent bg-accent/5" : "border-[#e8e6e0] hover:bg-[#f8f7f4]")}>
              <b className="block text-sm">{o.label}{o.v === defaultHeroLook(packId) && <span className="ml-2 text-xs font-normal text-[#6b6b80]">(default for your business type)</span>}</b>
              <span className="text-xs text-[#6b6b80]">{o.hint}</span>
            </button>
          ))}
        </div>
        <p className="text-xs text-[#6b6b80]">Save to see it on your website. Your hero photo and text stay as they are.</p>
      </Section>

      <Section title="Offer banner" enabled={offer.enabled} onToggle={() => patch("offer", { enabled: !offer.enabled })}>
        <Input label="Banner text" maxLength={SITE_CAPS.offerText} placeholder="e.g. 20% off first visits this month" value={offer.text} onChange={(e) => patch("offer", { text: e.target.value })} />
        <div>
          <Input label="Last day to show (optional)" type="date" value={offer.endsOn} onChange={(e) => patch("offer", { endsOn: e.target.value })} />
          <p className="text-xs text-[#6b6b80] mt-1">The banner hides itself after this date ({timezone} time). Leave empty to show it until you switch it off.</p>
        </div>
        {offer.enabled && offer.text.trim() && !offerVisible(offer, new Date(), timezone) && <p role="status" className="text-xs text-amber-800 bg-amber-50 rounded-lg px-3 py-2">That date has passed, so the banner is hidden on your website.</p>}
        {offer.text.trim() && <Preview themeColor={themeColor} packId={packId}><OfferBanner text={offer.text.trim()} /></Preview>}
      </Section>

      <Section title="Photo gallery" enabled={gallery.enabled} onToggle={() => patch("gallery", { enabled: !gallery.enabled })}>
        <Input label="Section heading" maxLength={SITE_CAPS.title} value={gallery.title} onChange={(e) => patch("gallery", { title: e.target.value })} />
        <ul className="space-y-2">
          {gallery.images.map((img, i) => (
            <li key={img.url} className="flex items-start gap-3 rounded-xl border border-[#e8e6e0] p-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img.url} alt="" className="w-20 h-[60px] object-cover rounded-lg flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <Input aria-label={`Description of photo ${i + 1}`} placeholder="Describe the photo (for screen readers)" maxLength={SITE_CAPS.altText} value={img.alt}
                  onChange={(e) => patch("gallery", { images: gallery.images.map((x, j) => (j === i ? { ...x, alt: e.target.value } : x)) })} />
              </div>
              <div className="flex gap-1 flex-shrink-0">
                <button type="button" className={iconBtn} aria-label={`Move photo ${i + 1} up`} disabled={i === 0} onClick={() => patch("gallery", { images: moveItem(gallery.images, i, i - 1) })}><ArrowUp size={14} /></button>
                <button type="button" className={iconBtn} aria-label={`Move photo ${i + 1} down`} disabled={i === gallery.images.length - 1} onClick={() => patch("gallery", { images: moveItem(gallery.images, i, i + 1) })}><ArrowDown size={14} /></button>
                <button type="button" className={iconBtn} aria-label={`Remove photo ${i + 1}`} onClick={() => patch("gallery", { images: gallery.images.filter((_, j) => j !== i) })}><Trash2 size={14} /></button>
              </div>
            </li>
          ))}
        </ul>
        <div className="flex items-center gap-3 flex-wrap">
          {imageUpload ? (
            <label className={cn("px-3 py-2 min-h-[40px] inline-flex items-center gap-1.5 rounded-lg border border-[#e8e6e0] text-xs font-semibold cursor-pointer focus-within:ring-2 focus-within:ring-accent/30", (gallery.images.length >= SITE_CAPS.galleryImages || uploading) ? "opacity-50 cursor-not-allowed" : "hover:bg-[#f8f7f4]")}>
              <Plus size={14} /> {uploading ? "Uploading…" : "Add photos"}
              <input type="file" accept="image/*" multiple className="sr-only" disabled={gallery.images.length >= SITE_CAPS.galleryImages || uploading} onChange={(e) => { void addPhotos(e.target.files); e.target.value = ""; }} />
            </label>
          ) : (
            <p className="text-xs text-[#6b6b80]">Photo uploads are not part of your current plan.</p>
          )}
          <span className="text-xs text-[#6b6b80]">{gallery.images.length} of {SITE_CAPS.galleryImages} photos</span>
        </div>
        {uploadError && <p role="alert" className="text-xs text-red-500">{uploadError}</p>}
        {gallery.images.length > 0 && <Preview themeColor={themeColor} packId={packId}><GallerySection title={gallery.title || "Gallery"} images={sanitizeGallery(gallery.images)} /></Preview>}
      </Section>

      <Section title="Team cards">
        <p className="text-xs text-[#6b6b80] bg-[#f8f7f4] rounded-xl px-3 py-2">Add each person&apos;s photo, short bio and specialisation on the <Link className="underline font-semibold" href="/dashboard/staff">Staff page</Link>. Turn the whole section on or off in Team Section below.</p>
        {staff.length > 0 && <Preview themeColor={themeColor} packId={packId}><div className="st-wrap" style={{ padding: "16px 12px" }}><TeamCards staff={staff} /></div></Preview>}
      </Section>

      <Section title="Services layout">
        <div role="radiogroup" aria-label="Services layout" className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {([["list", "Price list", "Compact rows, no images"], ["cards", "Image cards", "Uses each service's optional image"]] as const).map(([v, label, hint]) => (
            <button key={v} type="button" role="radio" aria-checked={layout === v} onClick={() => setConfig((c) => ({ ...c, serviceLayout: v }))}
              className={cn("text-left rounded-xl border-2 px-4 py-3 min-h-[56px]", layout === v ? "border-accent bg-accent/5" : "border-[#e8e6e0] hover:bg-[#f8f7f4]")}>
              <b className="block text-sm">{label}</b><span className="text-xs text-[#6b6b80]">{hint}</span>
            </button>
          ))}
        </div>
        <p className="text-xs text-[#6b6b80]">Add a service image on the <Link className="underline font-semibold" href="/dashboard/services">Services page</Link>. Cards without an image show text only.</p>
        {layout === "cards" && services.length > 0 && <Preview themeColor={themeColor} packId={packId}><div className="st-wrap" style={{ padding: "16px 12px" }}><ServiceCards services={services.slice(0, 3)} bookingUrl="#" currency={currency} /></div></Preview>}
      </Section>

      <Section title="FAQ" enabled={faq.enabled} onToggle={() => patch("faq", { enabled: !faq.enabled })}>
        <Input label="Section heading" maxLength={SITE_CAPS.title} value={faq.title} onChange={(e) => patch("faq", { title: e.target.value })} />
        <ul className="space-y-3">
          {faq.items.map((f, i) => (
            <li key={i} className="rounded-xl border border-[#e8e6e0] p-3 space-y-2">
              <Input aria-label={`Question ${i + 1}`} placeholder="Question" maxLength={SITE_CAPS.faqQuestion} value={f.q} onChange={(e) => patch("faq", { items: faq.items.map((x, j) => (j === i ? { ...x, q: e.target.value } : x)) })} />
              <textarea aria-label={`Answer ${i + 1}`} placeholder="Answer" rows={3} maxLength={SITE_CAPS.faqAnswer} value={f.a} onChange={(e) => patch("faq", { items: faq.items.map((x, j) => (j === i ? { ...x, a: e.target.value } : x)) })}
                className="w-full rounded-xl border border-[#e8e6e0] px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent" />
              <div className="flex gap-1">
                <button type="button" className={iconBtn} aria-label={`Move question ${i + 1} up`} disabled={i === 0} onClick={() => patch("faq", { items: moveItem(faq.items, i, i - 1) })}><ArrowUp size={14} /></button>
                <button type="button" className={iconBtn} aria-label={`Move question ${i + 1} down`} disabled={i === faq.items.length - 1} onClick={() => patch("faq", { items: moveItem(faq.items, i, i + 1) })}><ArrowDown size={14} /></button>
                <button type="button" className={iconBtn} aria-label={`Remove question ${i + 1}`} onClick={() => patch("faq", { items: faq.items.filter((_, j) => j !== i) })}><Trash2 size={14} /></button>
              </div>
            </li>
          ))}
        </ul>
        <div className="flex items-center gap-3">
          <button type="button" disabled={faq.items.length >= SITE_CAPS.faqItems} onClick={() => patch("faq", { items: [...faq.items, { q: "", a: "" }] })}
            className="px-3 py-2 min-h-[40px] inline-flex items-center gap-1.5 rounded-lg border border-[#e8e6e0] text-xs font-semibold hover:bg-[#f8f7f4] disabled:opacity-50"><Plus size={14} /> Add question</button>
          <span className="text-xs text-[#6b6b80]">{faq.items.length} of {SITE_CAPS.faqItems} questions</span>
        </div>
        <p className="text-xs text-[#6b6b80]">Write your own answers. Search engines can show them in results.</p>
        {sanitizeFaq(faq.items).length > 0 && <Preview themeColor={themeColor} packId={packId}><FaqSection title={faq.title || "Questions we get asked"} items={sanitizeFaq(faq.items)} /></Preview>}
      </Section>
    </>
  );
}
