"use client";
import { useState } from "react";
import Image from "next/image";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import type { TermsSource } from "@/lib/terms";
import { parseWebsiteConfig, defaultWebsiteConfig, WebsiteConfig, PHOTO_LIBRARY, photoUrl } from "@/lib/website";
import { Globe, Eye, ToggleLeft, ToggleRight, Check, Copy, ImageIcon, Link2, ChevronDown, Upload } from "lucide-react";
import { cn } from "@/lib/utils";
import { BrandLinksCard } from "./BrandLinksCard";
import type { SocialLinks } from "@/lib/brandLinks";

interface Props {
  terms?: TermsSource;
  slug: string; businessName: string; businessType: string; websiteJson: string; imageUpload?: boolean; seoControls?: boolean;
  themeColor: string; logoUrl: string | null; socialLinks: SocialLinks; googleReviewUrl: string | null;
}

// ── Textarea ─────────────────────────────────────────────────────────────────
function Textarea({ label, value, onChange, rows = 3, placeholder }: { label: string; value: string; onChange: (v: string) => void; rows?: number; placeholder?: string }) {
  return (
    <div>
      <label className="text-sm font-medium text-brand-800 block mb-1.5">{label}</label>
      <textarea
        className="w-full rounded-xl border border-[#e8e6e0] px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent transition-all"
        rows={rows}
        value={value}
        placeholder={placeholder}
        onChange={e => onChange(e.target.value)}
      />
    </div>
  );
}

// ── Toggle field ──────────────────────────────────────────────────────────────
function ToggleField({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-sm text-[#3d3d4d]">{label}</span>
      <button onClick={() => onChange(!value)} className="text-[#6b6b80] hover:text-brand-800 transition-colors">
        {value ? <ToggleRight size={20} className="text-accent" /> : <ToggleLeft size={20} />}
      </button>
    </div>
  );
}

// ── Image preview + change button ────────────────────────────────────────────
function ImagePreview({ label, url, onChangePic }: { label: string; url: string; onChangePic: () => void }) {
  return (
    <div>
      <label className="text-sm font-medium text-brand-800 block mb-1.5">{label}</label>
      <div className="relative w-full h-36 rounded-2xl overflow-hidden border border-[#e8e6e0] group cursor-pointer" onClick={onChangePic}>
        {url ? (
          <Image src={url} alt={label} fill className="object-cover group-hover:scale-105 transition-transform duration-300" sizes="600px" unoptimized />
        ) : (
          <div className="w-full h-full bg-[#f8f7f4] flex flex-col items-center justify-center gap-2">
            <ImageIcon size={24} className="text-[#c5c3bf]" />
            <span className="text-xs text-[#6b6b80]">Click to choose image</span>
          </div>
        )}
        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <span className="px-4 py-2 rounded-xl bg-white text-xs font-bold text-brand-900 shadow-lg">Change Photo</span>
        </div>
      </div>
    </div>
  );
}

// ── Image Picker Modal ────────────────────────────────────────────────────────
function ImagePickerModal({ isOpen, current, onSelect, onClose, showUpload = true, purpose = "about" }: { isOpen: boolean; current: string; onSelect: (url: string) => void; onClose: () => void; showUpload?: boolean; purpose?: "hero" | "about" }) {
  const [tab, setTab] = useState<"library" | "url" | "upload">("library");
  const [customUrl, setCustomUrl] = useState(current.startsWith("http") && !current.includes("unsplash") ? current : "");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");

  const applyUrl = () => { if (customUrl.trim()) { onSelect(customUrl.trim()); onClose(); } };

  const handleFile = async (file: File) => {
    setUploading(true);
    setUploadError("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("purpose", purpose);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const text = await res.text();
      let data: { url?: string; error?: string } = {};
      try { data = JSON.parse(text); } catch { throw new Error(text || "Upload failed"); }
      if (!res.ok) throw new Error(data.error || "Upload failed");
      if (!data.url) throw new Error("No URL returned from upload");
      onSelect(data.url);
      onClose();
    } catch (e) {
      setUploadError((e as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const tabs = [
    { id: "library" as const, label: "Photo Library", icon: <ImageIcon size={13} /> },
    ...(showUpload ? [{ id: "upload" as const, label: "Upload", icon: <Upload size={13} /> }] : []),
    { id: "url" as const, label: "Custom URL", icon: <Link2 size={13} /> },
  ];

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Choose Image" size="lg">
      <div className="flex gap-1 bg-[#f8f7f4] rounded-xl p-1 mb-5">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={cn("flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium transition-all", tab === t.id ? "bg-white shadow-sm text-brand-900" : "text-[#6b6b80]")}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {tab === "library" && (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 max-h-[380px] overflow-y-auto pr-1">
          {PHOTO_LIBRARY.map(photo => {
            const full = photoUrl(photo.id, "full");
            const thumb = photoUrl(photo.id, "thumb");
            const selected = current === full;
            return (
              <button key={photo.id} onClick={() => { onSelect(full); onClose(); }}
                className={cn("group relative rounded-xl overflow-hidden aspect-[3/2] border-2 transition-all hover:shadow-md", selected ? "border-accent ring-2 ring-accent/20" : "border-transparent hover:border-accent/40")}>
                <Image src={thumb} alt={photo.label} fill className="object-cover group-hover:scale-105 transition-transform duration-300" sizes="200px" />
                {selected && (
                  <div className="absolute inset-0 bg-accent/20 flex items-center justify-center">
                    <div className="w-7 h-7 rounded-full bg-accent flex items-center justify-center"><Check size={14} className="text-white" /></div>
                  </div>
                )}
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <p className="text-white text-[10px] font-medium truncate">{photo.label}</p>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {tab === "upload" && (
        <div className="space-y-4">
          <label className={cn("flex flex-col items-center justify-center w-full h-48 rounded-2xl border-2 border-dashed transition-colors cursor-pointer", uploading ? "border-accent/40 bg-accent/5" : "border-[#e8e6e0] hover:border-accent/40 hover:bg-[#f8f7f4]")}>
            {uploading ? (
              <>
                <svg className="animate-spin w-8 h-8 text-accent mb-3" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                <span className="text-sm text-[#6b6b80]">Uploading…</span>
              </>
            ) : (
              <>
                <Upload size={28} className="text-[#c5c3bf] mb-3" />
                <span className="text-sm font-medium text-[#3d3d4d]">Click to upload an image</span>
                <span className="text-xs text-[#6b6b80] mt-1">JPG, PNG, WebP — max 5 MB. We crop it to fit automatically.</span>
              </>
            )}
            <input type="file" accept="image/*" className="sr-only" disabled={uploading} onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
          </label>
          {uploadError && <p className="text-xs text-red-500">{uploadError}</p>}
        </div>
      )}

      {tab === "url" && (
        <div className="space-y-4">
          {customUrl && (
            <div className="relative w-full h-44 rounded-2xl overflow-hidden border border-[#e8e6e0]">
              <Image src={customUrl} alt="preview" fill className="object-cover" sizes="600px" unoptimized />
            </div>
          )}
          <div className="flex gap-2">
            <input className="flex-1 h-10 px-4 rounded-xl border border-[#e8e6e0] text-sm outline-none focus:border-accent/40 bg-white" placeholder="https://..." value={customUrl} onChange={e => setCustomUrl(e.target.value)} onKeyDown={e => e.key === "Enter" && applyUrl()} />
            <Button size="sm" onClick={applyUrl} disabled={!customUrl.trim()}>Apply</Button>
          </div>
          <p className="text-xs text-[#6b6b80]">Paste any public image URL</p>
        </div>
      )}
    </Modal>
  );
}

// ── Collapsible section card ──────────────────────────────────────────────────
function SectionCard({ title, enabled, onToggle, children, defaultOpen = true }: { title: string; enabled: boolean; onToggle: () => void; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Card className={cn(!enabled && "opacity-60")}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <button onClick={() => setOpen(v => !v)} className="flex items-center gap-2 flex-1 text-left">
            <CardTitle>{title}</CardTitle>
            <ChevronDown size={15} className={cn("text-[#6b6b80] transition-transform mt-0.5", open && "rotate-180")} />
          </button>
          <button onClick={onToggle} className="text-[#6b6b80] hover:text-brand-800 transition-colors ml-3 flex-shrink-0">
            {enabled ? <ToggleRight size={24} className="text-accent" /> : <ToggleLeft size={24} />}
          </button>
        </div>
      </CardHeader>
      {open && (
        <CardContent className={cn("space-y-3 pt-0", !enabled && "pointer-events-none")}>
          {children}
        </CardContent>
      )}
    </Card>
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────
export function WebsiteEditorClient({ terms, slug, businessName, businessType, websiteJson, imageUpload = false, seoControls = false, themeColor, logoUrl, socialLinks, googleReviewUrl }: Props) {
  const initial = parseWebsiteConfig(websiteJson) ?? defaultWebsiteConfig(businessName, businessType, terms);
  const [config, setConfig] = useState<WebsiteConfig>(initial);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [pickerTarget, setPickerTarget] = useState<"hero" | "about" | null>(null);

  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || "calvy.io";
  const siteUrl = `https://${slug}.${rootDomain}`;

  const save = async () => {
    setSaving(true); setError("");
    try {
      const res = await fetch("/api/website", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ websiteJson: JSON.stringify(config) }) });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || "Failed to save"); }
      setSaved(true); setTimeout(() => setSaved(false), 2500);
    } catch (e) { setError((e as Error).message); }
    finally { setSaving(false); }
  };

  const copyLink = () => { navigator.clipboard.writeText(siteUrl); setCopied(true); setTimeout(() => setCopied(false), 2000); };

  const toggle = (section: keyof WebsiteConfig) => {
    const s = config[section] as { enabled: boolean };
    setConfig({ ...config, [section]: { ...s, enabled: !s.enabled } });
  };

  const set = <K extends keyof WebsiteConfig>(section: K, field: string, value: string | boolean) =>
    setConfig({ ...config, [section]: { ...(config[section] as object), [field]: value } });

  const pickerImage = pickerTarget === "hero" ? config.hero.image : config.about.image;

  return (
    <DashboardLayout title="Website" subtitle="Customize your public single-page website">
      {/* Top bar */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between mb-6">
        <div className="flex items-center gap-2 px-4 py-2 bg-white border border-[#e8e6e0] rounded-xl text-sm text-[#6b6b80]">
          <Globe size={14} />
          <span className="truncate max-w-[220px] sm:max-w-[300px]">{siteUrl}</span>
          <button onClick={copyLink} className="ml-1 text-accent hover:opacity-70 transition-opacity">
            {copied ? <Check size={14} /> : <Copy size={14} />}
          </button>
        </div>
        <div className="flex gap-2">
          <a href={siteUrl} target="_blank" rel="noopener noreferrer">
            <Button variant="outline" size="sm" className="gap-1.5"><Eye size={14} /> Preview</Button>
          </a>
          <Button size="sm" onClick={save} disabled={saving} className="gap-1.5 min-w-[110px] justify-center">
            {saving ? "Saving..." : saved ? <><Check size={14} /> Saved!</> : "Save Changes"}
          </Button>
        </div>
      </div>

      {error && <p className="mb-4 text-sm text-red-500">{error}</p>}

      <div className="space-y-4">

        {/* ── SEO ── */}
        {seoControls && (
          <Card>
            <CardHeader><CardTitle>SEO & Meta Tags</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <Input label="Page title (browser tab & Google)" placeholder={businessName} value={config.metaTitle} onChange={e => setConfig({ ...config, metaTitle: e.target.value })} />
              <Input label="Meta description (search engine snippet)" placeholder="Brief description..." value={config.metaDescription} onChange={e => setConfig({ ...config, metaDescription: e.target.value })} />
            </CardContent>
          </Card>
        )}

        {/* ── BRAND & LINKS ── */}
        <BrandLinksCard businessName={businessName} themeColor={themeColor} logoUrl={logoUrl} socialLinks={socialLinks} googleReviewUrl={googleReviewUrl} />

        {/* ── HERO ── */}
        <SectionCard title="Hero Section" enabled={config.hero.enabled} onToggle={() => toggle("hero")}>
          <ImagePreview label="Background Image" url={config.hero.image} onChangePic={() => setPickerTarget("hero")} />
          <Input label="Badge text (small pill above headline)" placeholder="e.g. Professional Clinic Services" value={config.hero.badge} onChange={e => set("hero", "badge", e.target.value)} />
          <Input label="Main headline" placeholder="Welcome to..." value={config.hero.headline} onChange={e => set("hero", "headline", e.target.value)} />
          <Textarea label="Subheadline" value={config.hero.subheadline} onChange={v => set("hero", "subheadline", v)} rows={2} placeholder="Describe what you offer in one line..." />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Primary CTA button" placeholder="Book Now" value={config.hero.ctaText} onChange={e => set("hero", "ctaText", e.target.value)} />
            <Input label="Secondary button" placeholder="View Services" value={config.hero.secondaryCtaText} onChange={e => set("hero", "secondaryCtaText", e.target.value)} />
          </div>
        </SectionCard>

        {/* ── ABOUT ── */}
        <SectionCard title="About Section" enabled={config.about.enabled} onToggle={() => toggle("about")}>
          <ImagePreview label="Section Image" url={config.about.image} onChangePic={() => setPickerTarget("about")} />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Pill badge text" placeholder="About Us" value={config.about.badge} onChange={e => set("about", "badge", e.target.value)} />
            <Input label="Section heading" placeholder="About Us" value={config.about.title} onChange={e => set("about", "title", e.target.value)} />
          </div>
          <Textarea label="Body text" value={config.about.body} onChange={v => set("about", "body", v)} rows={4} placeholder="Tell visitors who you are and what you do..." />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Floating badge label" placeholder="Trusted by clients" value={config.about.trustLabel} onChange={e => set("about", "trustLabel", e.target.value)} />
            <Input label="CTA link text" placeholder="Book an appointment" value={config.about.ctaText} onChange={e => set("about", "ctaText", e.target.value)} />
          </div>
        </SectionCard>

        {/* ── SERVICES ── */}
        <SectionCard title="Services Section" enabled={config.services.enabled} onToggle={() => toggle("services")}>
          <p className="text-xs text-[#6b6b80] bg-[#f8f7f4] rounded-xl px-3 py-2">Services are pulled automatically from your <strong>Services</strong> page.</p>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Pill badge text" placeholder="What We Offer" value={config.services.badge} onChange={e => set("services", "badge", e.target.value)} />
            <Input label="Section heading" placeholder="Our Services" value={config.services.title} onChange={e => set("services", "title", e.target.value)} />
          </div>
          <Input label="Subtitle" placeholder="Choose from our range..." value={config.services.subtitle} onChange={e => set("services", "subtitle", e.target.value)} />
          <Input label="Bottom CTA button text" placeholder="Book an Appointment" value={config.services.ctaText} onChange={e => set("services", "ctaText", e.target.value)} />
        </SectionCard>

        {/* ── TEAM ── */}
        <SectionCard title="Team Section" enabled={config.team.enabled} onToggle={() => toggle("team")}>
          <p className="text-xs text-[#6b6b80] bg-[#f8f7f4] rounded-xl px-3 py-2">Team members are pulled automatically from your <strong>Staff</strong> page.</p>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Pill badge text" placeholder="The Team" value={config.team.badge} onChange={e => set("team", "badge", e.target.value)} />
            <Input label="Section heading" placeholder="Our Team" value={config.team.title} onChange={e => set("team", "title", e.target.value)} />
          </div>
          <Input label="Subtitle" placeholder="Meet the professionals..." value={config.team.subtitle} onChange={e => set("team", "subtitle", e.target.value)} />
        </SectionCard>

        {/* ── CONTACT ── */}
        <SectionCard title="Contact Section" enabled={config.contact.enabled} onToggle={() => toggle("contact")}>
          <p className="text-xs text-[#6b6b80] bg-[#f8f7f4] rounded-xl px-3 py-2">Phone, email, and address are pulled from your <strong>Settings</strong> page.</p>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Pill badge text" placeholder="Get In Touch" value={config.contact.badge} onChange={e => set("contact", "badge", e.target.value)} />
            <Input label="Section heading" placeholder="Contact Us" value={config.contact.title} onChange={e => set("contact", "title", e.target.value)} />
          </div>
          <Input label="Subtext (below heading)" placeholder="Reach out or book online..." value={config.contact.subtext} onChange={e => set("contact", "subtext", e.target.value)} />
          <div className="grid grid-cols-2 gap-3">
            <Input label="CTA card heading" placeholder="Ready to book?" value={config.contact.ctaHeading} onChange={e => set("contact", "ctaHeading", e.target.value)} />
            <Input label="CTA note (below button)" placeholder="Free to book · No account needed" value={config.contact.ctaNote} onChange={e => set("contact", "ctaNote", e.target.value)} />
          </div>
          <Textarea label="CTA card subtext" value={config.contact.ctaSubtext} onChange={v => set("contact", "ctaSubtext", v)} rows={2} placeholder="Short persuasive line..." />
          <div className="border-t border-[#f0ede8] pt-3 space-y-1">
            <p className="text-xs font-semibold text-[#6b6b80] uppercase tracking-wider mb-2">Show / hide contact details</p>
            <ToggleField label="Show phone number" value={config.contact.showPhone} onChange={v => set("contact", "showPhone", v)} />
            <ToggleField label="Show email address" value={config.contact.showEmail} onChange={v => set("contact", "showEmail", v)} />
            <ToggleField label="Show address" value={config.contact.showAddress} onChange={v => set("contact", "showAddress", v)} />
            <ToggleField label="Show Google map (needs an address)" value={config.contact.showMap !== false} onChange={v => set("contact", "showMap", v)} />
            <ToggleField label="Show opening hours (from your business hours)" value={config.contact.showHours !== false} onChange={v => set("contact", "showHours", v)} />
          </div>
        </SectionCard>

      </div>

      {/* Image Picker */}
      <ImagePickerModal
        isOpen={pickerTarget !== null}
        current={pickerImage ?? ""}
        onSelect={url => { if (pickerTarget === "hero") setConfig({ ...config, hero: { ...config.hero, image: url } }); else if (pickerTarget === "about") setConfig({ ...config, about: { ...config.about, image: url } }); }}
        onClose={() => setPickerTarget(null)}
        showUpload={imageUpload}
        purpose={pickerTarget === "hero" ? "hero" : "about"}
      />
    </DashboardLayout>
  );
}
