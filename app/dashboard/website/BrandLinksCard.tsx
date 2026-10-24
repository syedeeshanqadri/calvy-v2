"use client";
import { useRef, useState } from "react";
import { Check, Trash2, Upload } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { BrandMark, ReviewButton, SocialIcons } from "@/components/site/Brand";
import {
  SOCIAL_LABELS, SOCIAL_PLATFORMS, normalizeReviewLink, normalizeSocial,
  type SocialLinks, type SocialPlatform,
} from "@/lib/brandLinks";
import { readableForeground, safeThemeColor } from "@/lib/theme";

interface Props {
  businessName: string;
  themeColor: string;
  logoUrl: string | null;
  socialLinks: SocialLinks;
  googleReviewUrl: string | null;
}

const PLACEHOLDERS: Record<SocialPlatform, string> = {
  instagram: "@yourbusiness or full link",
  facebook: "Page name or full link",
  whatsapp: "919876543210 (with country code)",
  x: "@yourbusiness or full link",
  linkedin: "Company link",
  youtube: "@channel or full link",
  website: "https://yourbusiness.com",
};

/** "Brand & links": logo, social links and the Google review link, with a live preview of the header and footer. */
export function BrandLinksCard({ businessName, themeColor, logoUrl: initialLogo, socialLinks, googleReviewUrl }: Props) {
  const color = safeThemeColor(themeColor);
  const fg = readableForeground(color);
  const fileRef = useRef<HTMLInputElement>(null);

  const [logoUrl, setLogoUrl] = useState(initialLogo);
  const [logoBusy, setLogoBusy] = useState(false);
  const [logoError, setLogoError] = useState("");

  const [values, setValues] = useState<Record<SocialPlatform, string>>(
    () => Object.fromEntries(SOCIAL_PLATFORMS.map((p) => [p, socialLinks[p] ?? ""])) as Record<SocialPlatform, string>,
  );
  const [review, setReview] = useState(googleReviewUrl ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  // Per-field validation drives both the inline hints and the live preview.
  const fieldErrors = Object.fromEntries(
    SOCIAL_PLATFORMS.map((p) => {
      const v = values[p].trim();
      if (!v) return [p, ""];
      const r = normalizeSocial(p, v);
      return [p, r.ok ? "" : r.error];
    }),
  ) as Record<SocialPlatform, string>;
  const reviewResult = review.trim() ? normalizeReviewLink(review) : null;
  const reviewError = reviewResult && !reviewResult.ok ? reviewResult.error : "";
  const hasErrors = SOCIAL_PLATFORMS.some((p) => fieldErrors[p]) || !!reviewError;

  const previewLinks: SocialLinks = {};
  for (const p of SOCIAL_PLATFORMS) {
    const v = values[p].trim();
    if (!v) continue;
    const r = normalizeSocial(p, v);
    if (r.ok) previewLinks[p] = r.value;
  }

  const uploadLogo = async (file: File) => {
    setLogoBusy(true); setLogoError("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/brand", { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Upload failed");
      setLogoUrl(data.logoUrl);
    } catch (e) { setLogoError((e as Error).message); }
    finally { setLogoBusy(false); if (fileRef.current) fileRef.current.value = ""; }
  };

  const removeLogo = async () => {
    setLogoBusy(true); setLogoError("");
    try {
      const res = await fetch("/api/brand", { method: "DELETE" });
      if (!res.ok) throw new Error("Could not remove the logo");
      setLogoUrl(null);
    } catch (e) { setLogoError((e as Error).message); }
    finally { setLogoBusy(false); }
  };

  const save = async () => {
    setSaving(true); setError("");
    try {
      const res = await fetch("/api/brand", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ socialLinks: values, googleReviewUrl: review }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to save");
      setSaved(true); setTimeout(() => setSaved(false), 2500);
    } catch (e) { setError((e as Error).message); }
    finally { setSaving(false); }
  };

  return (
    <Card>
      <CardHeader><CardTitle>Brand &amp; links</CardTitle></CardHeader>
      <CardContent className="space-y-5 pt-0">
        {/* Logo */}
        <div>
          <p className="text-sm font-medium text-brand-800 mb-1.5">Logo</p>
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl border border-[#e8e6e0] bg-[#f8f7f4] flex items-center justify-center">
              <BrandMark name={businessName} logoUrl={logoUrl} color={color} fg={fg} size={52} />
            </div>
            <div className="space-y-1.5">
              <div className="flex gap-2">
                <Button size="sm" variant="outline" className="gap-1.5" disabled={logoBusy} onClick={() => fileRef.current?.click()}>
                  <Upload size={13} /> {logoBusy ? "Working…" : logoUrl ? "Replace" : "Upload logo"}
                </Button>
                {logoUrl && (
                  <Button size="sm" variant="outline" className="gap-1.5" disabled={logoBusy} onClick={removeLogo}>
                    <Trash2 size={13} /> Remove
                  </Button>
                )}
              </div>
              <p className="text-xs text-[#6b6b80]">PNG, JPG, SVG or WebP, up to 2 MB. Without a logo we show your initials.</p>
            </div>
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="sr-only"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadLogo(f); }} />
          </div>
          {logoError && <p role="alert" className="text-xs text-red-500 mt-2">{logoError}</p>}
        </div>

        {/* Social links */}
        <div className="border-t border-[#f0ede8] pt-4 space-y-3">
          <p className="text-xs font-semibold text-[#6b6b80] uppercase tracking-wider">Social links</p>
          <div className="grid sm:grid-cols-2 gap-3">
            {SOCIAL_PLATFORMS.map((p) => (
              <div key={p}>
                <Input label={SOCIAL_LABELS[p]} placeholder={PLACEHOLDERS[p]} value={values[p]}
                  onChange={(e) => setValues({ ...values, [p]: e.target.value })} />
                {fieldErrors[p] && <p className="text-xs text-red-500 mt-1">{fieldErrors[p]}</p>}
              </div>
            ))}
          </div>
        </div>

        {/* Google review */}
        <div className="border-t border-[#f0ede8] pt-4 space-y-2">
          <Input label="Google review link" placeholder="https://g.page/r/…/review" value={review} onChange={(e) => setReview(e.target.value)} />
          {reviewError && <p className="text-xs text-red-500">{reviewError}</p>}
          <details className="text-xs text-[#6b6b80]">
            <summary className="cursor-pointer font-medium text-[#3d3d4d]">How do I get this link?</summary>
            <ol className="list-decimal pl-5 mt-2 space-y-1">
              <li>Open your Google Business Profile (search for your business name on Google while signed in).</li>
              <li>Click <strong>Ask for reviews</strong> (or <strong>Get more reviews</strong>).</li>
              <li>Click <strong>Copy link</strong> and paste it here.</li>
            </ol>
          </details>
        </div>

        {/* Live preview */}
        <div className="border-t border-[#f0ede8] pt-4">
          <p className="text-xs font-semibold text-[#6b6b80] uppercase tracking-wider mb-2">Preview</p>
          <div className="rounded-2xl overflow-hidden border border-[#e8e6e0]">
            <div className="flex items-center gap-3 bg-white px-4 py-3">
              <BrandMark name={businessName} logoUrl={logoUrl} color={color} fg={fg} size={32} />
              <span className="font-black tracking-tight text-gray-900 truncate">{businessName}</span>
            </div>
            <div className="bg-gray-950 text-white px-4 py-4 space-y-3">
              <div className="font-black">{businessName}</div>
              <SocialIcons links={previewLinks} />
              {reviewResult?.ok && <ReviewButton href={reviewResult.value} color={color} fg={fg} className="!py-2 !text-xs" />}
              {Object.keys(previewLinks).length === 0 && !reviewResult?.ok && <p className="text-xs text-white/40">Links you add appear here.</p>}
            </div>
          </div>
        </div>

        {error && <p role="alert" className="text-sm text-red-500">{error}</p>}
        <Button size="sm" onClick={save} disabled={saving || hasErrors} className="gap-1.5 min-w-[110px] justify-center">
          {saving ? "Saving..." : saved ? <><Check size={14} /> Saved!</> : "Save links"}
        </Button>
      </CardContent>
    </Card>
  );
}
