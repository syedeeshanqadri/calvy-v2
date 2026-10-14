"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Link2, Copy, ExternalLink, Check, Smartphone, Globe, MessageSquare } from "lucide-react";
import { formatCurrencyAmount } from "@/lib/currency";

const PRESET_COLORS = ["#0284c7","#3b82f6","#8b5cf6","#22c55e","#f59e0b","#ec4899","#14b8a6","#f97316","#0f0f1a"];

interface ServicePreview { name: string; duration: number; price: number; }

interface Props {
  bookingUrl: string;
  initialBusinessName: string;
  initialColor: string;
  initialDescription: string;
  currency: string;
  services: ServicePreview[];
}

export function BookingPageClient({ bookingUrl, initialBusinessName, initialColor, initialDescription, currency, services }: Props) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const [businessName, setBusinessName] = useState(initialBusinessName);
  const [description, setDescription] = useState(initialDescription);
  const [accentColor, setAccentColor] = useState(initialColor);

  const initials = businessName.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();

  const copyLink = () => {
    navigator.clipboard.writeText(bookingUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const shareWhatsApp = () => {
    window.open(`https://wa.me/?text=${encodeURIComponent(`Book an appointment: ${bookingUrl}`)}`, "_blank");
  };

  const saveChanges = async () => {
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: businessName, primaryColor: accentColor, description }),
      });
      if (!res.ok) throw new Error("Failed to save");
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <DashboardLayout title="Booking Page" subtitle="Your public booking link">
      <div className="grid xl:grid-cols-5 gap-6">
        {/* Settings panel */}
        <div className="xl:col-span-2 space-y-5">
          <Card>
            <CardHeader><CardTitle>Your booking link</CardTitle></CardHeader>
            <CardContent>
              <div className="flex items-center gap-2 bg-[#f8f7f4] rounded-xl px-4 py-3 mb-3">
                <Link2 size={14} className="text-[#6b6b80] flex-shrink-0" />
                <span className="text-sm text-brand-800 flex-1 truncate font-mono">{bookingUrl}</span>
              </div>
              <div className="flex gap-2">
                <Button onClick={copyLink} variant="outline" size="sm" className="flex-1 justify-center gap-2">
                  {copied ? <><Check size={14} /> Copied!</> : <><Copy size={14} /> Copy link</>}
                </Button>
                <Button size="sm" className="gap-2 flex-1 justify-center" onClick={() => window.open(bookingUrl, "_blank")}>
                  <ExternalLink size={14} /> Open page
                </Button>
              </div>
              <div className="mt-4 pt-4 border-t border-[#f0ede8]">
                <p className="text-xs font-semibold text-[#6b6b80] mb-3 uppercase tracking-wider">Share via</p>
                <div className="grid grid-cols-3 gap-2">
                  <button onClick={shareWhatsApp} className="flex flex-col items-center gap-1.5 p-3 rounded-xl bg-[#f8f7f4] hover:bg-[#f0ede8] transition-colors">
                    <MessageSquare size={16} className="text-[#6b6b80]" />
                    <span className="text-[11px] text-[#6b6b80]">WhatsApp</span>
                  </button>
                  <button onClick={() => navigator.clipboard.writeText(`<a href="${bookingUrl}">Book Now</a>`)} className="flex flex-col items-center gap-1.5 p-3 rounded-xl bg-[#f8f7f4] hover:bg-[#f0ede8] transition-colors">
                    <Globe size={16} className="text-[#6b6b80]" />
                    <span className="text-[11px] text-[#6b6b80]">Copy embed</span>
                  </button>
                  <button onClick={copyLink} className="flex flex-col items-center gap-1.5 p-3 rounded-xl bg-[#f8f7f4] hover:bg-[#f0ede8] transition-colors">
                    <Smartphone size={16} className="text-[#6b6b80]" />
                    <span className="text-[11px] text-[#6b6b80]">Copy URL</span>
                  </button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Appearance</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <Input label="Business name" value={businessName} onChange={(e) => setBusinessName(e.target.value)} />
              <div>
                <label className="text-sm font-medium text-brand-800 block mb-1.5">Description</label>
                <textarea
                  className="w-full rounded-xl border border-[#e8e6e0] px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent transition-all"
                  rows={2}
                  placeholder="Brief description shown on your booking page..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>
              <div>
                <label className="text-sm font-medium text-brand-800 block mb-2">Brand color</label>
                <div className="flex items-center gap-2 flex-wrap mb-2">
                  {PRESET_COLORS.map(c => (
                    <button
                      key={c}
                      onClick={() => setAccentColor(c)}
                      className={`w-8 h-8 rounded-full border-2 transition-all ${accentColor === c ? "border-brand-900 scale-110" : "border-transparent"}`}
                      style={{ background: c }}
                    />
                  ))}
                </div>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={accentColor}
                    onChange={(e) => setAccentColor(e.target.value)}
                    className="w-10 h-10 rounded-xl border border-[#e8e6e0] cursor-pointer p-1 bg-white"
                  />
                  <span className="text-sm font-mono text-[#6b6b80]">{accentColor}</span>
                </div>
              </div>
              {error && <p className="text-sm text-red-500">{error}</p>}
              <Button onClick={saveChanges} disabled={saving} className="w-full justify-center gap-2">
                {saved ? <><Check size={14} /> Saved!</> : saving ? "Saving…" : "Save & publish"}
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Live preview */}
        <div className="xl:col-span-3">
          <Card className="overflow-hidden">
            <CardHeader>
              <CardTitle>Live preview</CardTitle>
              <span className="text-xs text-green-600 font-semibold bg-green-50 px-2.5 py-1 rounded-full">● Live</span>
            </CardHeader>
            <CardContent className="p-0">
              <div className="bg-[#f8f7f4] p-4 min-h-[500px]">
                <div className="bg-white rounded-2xl overflow-hidden shadow-sm border border-[#e8e6e0] max-w-sm mx-auto">
                  {/* Header */}
                  <div className="p-6 text-center" style={{ background: accentColor }}>
                    <div className="w-14 h-14 rounded-2xl bg-white/20 flex items-center justify-center text-white font-syne font-bold text-xl mx-auto mb-3">
                      {initials}
                    </div>
                    <h2 className="text-white font-syne font-bold text-lg leading-tight">{businessName}</h2>
                    {description && <p className="text-white/70 text-sm mt-1 line-clamp-2">{description}</p>}
                  </div>
                  {/* Services preview */}
                  <div className="p-4">
                    <p className="text-xs font-semibold text-[#6b6b80] uppercase tracking-wider mb-3">Select a service</p>
                    {services.length === 0 ? (
                      <p className="text-xs text-[#6b6b80] text-center py-4">No active services yet.</p>
                    ) : services.map((svc, i) => (
                      <div
                        key={svc.name}
                        className={`flex items-center justify-between p-3 rounded-xl mb-2 border transition-all cursor-pointer ${i === 0 ? "border-2 bg-[#fafaf8]" : "border-[#f0ede8]"}`}
                        style={i === 0 ? { borderColor: accentColor } : {}}
                      >
                        <div>
                          <div className="text-sm font-medium">{svc.name}</div>
                          <div className="text-xs text-[#6b6b80]">{svc.duration}min</div>
                        </div>
                        <span className="text-sm font-bold" style={{ color: accentColor }}>{formatCurrencyAmount(svc.price, currency)}</span>
                      </div>
                    ))}
                    <button
                      className="w-full mt-2 py-3 rounded-xl text-white text-sm font-semibold hover:opacity-90 transition-opacity"
                      style={{ background: accentColor }}
                    >
                      Continue →
                    </button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
