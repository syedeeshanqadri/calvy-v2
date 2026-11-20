"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Bell, Users, Check, Globe, Phone, Mail, MapPin, DollarSign, Wallet, CreditCard, Lock, ScrollText, MessageCircle } from "lucide-react";
import { CURRENCIES } from "@/lib/currency";
import { useFlags } from "@/components/providers/FlagsProvider";
import { ThemeColorPicker } from "@/components/theme/ThemeColorPicker";
import { PackSettings } from "@/components/packs/PackSettings";
import type { PackId } from "@/lib/packs/types";
import { BookingModeSettings, type TokenSessionRow } from "@/components/tokens/BookingModeSettings";
import { LinkGoogle } from "@/components/settings/LinkGoogle";
import { CalendarFeeds } from "@/components/settings/CalendarFeeds";
import { VerifyGateNotice } from "@/components/auth/VerifyEmail";
import { GatewaySettings, type GatewaySettingsProps } from "@/components/settings/GatewaySettings";
import { t as term } from "@/lib/terms";
import { DEFAULT_MAX_PEOPLE_PER_BOOKER, MAX_PEOPLE_PER_BOOKER_LIMIT } from "@/lib/patients";

const BUSINESS_TYPES = [
  { value: "salon", label: "Hair Salon" },
  { value: "barbershop", label: "Barbershop" },
  { value: "clinic", label: "Medical Clinic" },
  { value: "spa", label: "Spa & Wellness" },
  { value: "dental", label: "Dental Practice" },
  { value: "physio", label: "Physiotherapy" },
  { value: "coach", label: "Coaching / Consulting" },
  { value: "tattoo", label: "Tattoo Studio" },
  { value: "beauty", label: "Beauty & Nails" },
  { value: "fitness", label: "Fitness / Personal Training" },
  { value: "therapy", label: "Therapy / Counseling" },
  { value: "general", label: "Other / General" },
];

const DAYS = [
  { key: "0", label: "Sunday" },
  { key: "1", label: "Monday" },
  { key: "2", label: "Tuesday" },
  { key: "3", label: "Wednesday" },
  { key: "4", label: "Thursday" },
  { key: "5", label: "Friday" },
  { key: "6", label: "Saturday" },
];

const DEFAULT_AVAILABILITY: Record<string, { enabled: boolean; start: string; end: string }> = {
  "0": { enabled: false, start: "09:00", end: "17:00" },
  "1": { enabled: true, start: "09:00", end: "18:00" },
  "2": { enabled: true, start: "09:00", end: "18:00" },
  "3": { enabled: true, start: "09:00", end: "18:00" },
  "4": { enabled: true, start: "09:00", end: "18:00" },
  "5": { enabled: true, start: "09:00", end: "18:00" },
  "6": { enabled: false, start: "09:00", end: "17:00" },
};


interface BusinessData {
  id: string; name: string; slug: string; businessType: string; packId: PackId;
  phone: string; email: string; address: string; website: string;
  description: string; primaryColor: string; availabilityJson: string; currency: string;
  slotInterval?: number;
  maxPeoplePerBooker?: number;
  followUpDays?: number;
  paymentMode?: string;
  bookingMode?: "SLOT" | "TOKEN"; termsOverride?: unknown;
}

type Tab = "profile" | "availability" | "booking" | "payments";

export function SettingsClient({ business, customSlotInterval = false, stripePayments = false, tokenSessions = [], staff = [], payments }: { business: BusinessData; customSlotInterval?: boolean; stripePayments?: boolean; tokenSessions?: TokenSessionRow[]; staff?: { id: string; name: string }[]; payments?: GatewaySettingsProps }) {
  const router = useRouter();
  const { payments: paymentsEnabled } = useFlags();
  const [tab, setTab] = useState<Tab>("profile");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const [profile, setProfile] = useState({
    name: business.name,
    businessType: business.businessType,
    phone: business.phone,
    email: business.email,
    address: business.address,
    website: business.website,
    description: business.description,
    primaryColor: business.primaryColor,
    currency: business.currency ?? "USD",
  });

  const parsedAvail = business.availabilityJson && business.availabilityJson !== "{}"
    ? JSON.parse(business.availabilityJson)
    : DEFAULT_AVAILABILITY;

  const [availability, setAvailability] = useState<Record<string, { enabled: boolean; start: string; end: string }>>(
    { ...DEFAULT_AVAILABILITY, ...parsedAvail }
  );

  const [slotInterval, setSlotInterval] = useState(business.slotInterval ?? 30);
  const [followUpDays, setFollowUpDays] = useState(String(business.followUpDays ?? 0));
  const [maxPeople, setMaxPeople] = useState(String(business.maxPeoplePerBooker ?? DEFAULT_MAX_PEOPLE_PER_BOOKER));

  const toggleDay = (key: string) => {
    setAvailability(prev => ({ ...prev, [key]: { ...prev[key], enabled: !prev[key].enabled } }));
  };

  const updateTime = (key: string, field: "start" | "end", value: string) => {
    setAvailability(prev => ({ ...prev, [key]: { ...prev[key], [field]: value } }));
  };

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      {
        const res = await fetch("/api/settings", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...profile, availabilityJson: JSON.stringify(availability), slotInterval, maxPeoplePerBooker: Number(maxPeople), followUpDays: Math.max(0, Math.min(365, Math.trunc(Number(followUpDays) || 0))) }),
        });
        if (!res.ok) throw new Error("Failed to save settings");
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const initials = profile.name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();

  const TABS: { key: Tab; label: string; icon: React.ElementType }[] = [
    { key: "profile", label: "Business Profile", icon: Globe },
    { key: "availability", label: "Availability", icon: Phone },
    { key: "booking", label: "Booking", icon: Check },
    ...(payments ? [{ key: "payments" as Tab, label: "Payments", icon: Wallet }] : []),
  ];

  return (
    <DashboardLayout title="Settings" subtitle="Manage your business profile and availability">
      <div className="max-w-3xl space-y-6">
        {/* Tab bar */}
        <div className="flex flex-wrap gap-1 bg-[#f0ede8] p-1 rounded-xl w-fit max-w-full">
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => { setTab(t.key); setSaved(false); setError(""); }}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${tab === t.key ? "bg-white text-[#0f0f1a] shadow-sm" : "text-[#6b6b80] hover:text-[#0f0f1a]"}`}
            >
              <t.icon size={14} />
              {t.label}
            </button>
          ))}
          <Link href="/dashboard/settings/notifications" className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all text-[#6b6b80] hover:text-[#0f0f1a]">
            <Bell size={14} />
            Notifications
          </Link>
          <Link href="/dashboard/settings/team" className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all text-[#6b6b80] hover:text-[#0f0f1a]">
            <Users size={14} />
            Team
          </Link>
          <Link href="/dashboard/settings/whatsapp" className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all text-[#6b6b80] hover:text-[#0f0f1a]">
            <MessageCircle size={14} />
            WhatsApp
          </Link>
          <Link href="/dashboard/settings/activity" className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all text-[#6b6b80] hover:text-[#0f0f1a]">
            <ScrollText size={14} />
            Activity
          </Link>
        </div>

        {/* Business Profile tab */}
        {tab === "profile" && <LinkGoogle />}
        {tab === "profile" && (
          <Card>
            <CardHeader><CardTitle>Business Profile</CardTitle></CardHeader>
            <CardContent className="space-y-5">
              <div className="flex items-center gap-4 pb-4 border-b border-[#f0ede8]">
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-white font-syne font-bold text-xl flex-shrink-0" style={{ background: profile.primaryColor }}>
                  {initials}
                </div>
                <div>
                  <div className="font-semibold">{profile.name || "Your Business"}</div>
                  <div className="text-xs text-[#6b6b80] mt-0.5">{BUSINESS_TYPES.find(t => t.value === profile.businessType)?.label ?? "General"}</div>
                  <div className="text-xs text-[#6b6b80] font-mono mt-1">/{business.slug}</div>
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <Input label="Business name" value={profile.name} onChange={e => setProfile({ ...profile, name: e.target.value })} />
              </div>

              <PackSettings initialPackId={business.packId} />

              <div>
                <label htmlFor="settings-description" className="text-sm font-medium text-brand-800 block mb-1.5">Description</label>
                <textarea id="settings-description" className="w-full rounded-xl border border-[#e8e6e0] px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent transition-all" rows={2}
                  placeholder="Brief description of your business..." value={profile.description} onChange={e => setProfile({ ...profile, description: e.target.value })} />
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <div className="relative">
                  <Phone size={15} className="absolute left-3 top-9 text-[#6b6b80]" />
                  <Input label="Phone" type="tel" placeholder="+1 555-0000" value={profile.phone} onChange={e => setProfile({ ...profile, phone: e.target.value })} className="pl-9" />
                </div>
                <div className="relative">
                  <Mail size={15} className="absolute left-3 top-9 text-[#6b6b80]" />
                  <Input label="Business email" type="email" placeholder="hello@yourbusiness.com" value={profile.email} onChange={e => setProfile({ ...profile, email: e.target.value })} className="pl-9" />
                </div>
                <div className="relative">
                  <MapPin size={15} className="absolute left-3 top-9 text-[#6b6b80]" />
                  <Input label="Address" placeholder="123 Main St, City" value={profile.address} onChange={e => setProfile({ ...profile, address: e.target.value })} className="pl-9" />
                </div>
                <div className="relative">
                  <Globe size={15} className="absolute left-3 top-9 text-[#6b6b80]" />
                  <Input label="Website" type="url" placeholder="https://yourbusiness.com" value={profile.website} onChange={e => setProfile({ ...profile, website: e.target.value })} className="pl-9" />
                </div>
              </div>

              <div>
                <label htmlFor="settings-currency" className="text-sm font-medium text-brand-800 block mb-1.5 flex items-center gap-1.5">
                  <DollarSign size={14} /> Currency
                </label>
                <select
                  id="settings-currency"
                  className="w-full sm:w-64 h-11 rounded-xl border border-[#e8e6e0] bg-white px-4 text-sm focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent"
                  value={profile.currency}
                  onChange={e => setProfile({ ...profile, currency: e.target.value })}
                >
                  {CURRENCIES.map(c => (
                    <option key={c.code} value={c.code}>{c.symbol} {c.name} ({c.code})</option>
                  ))}
                </select>
                <p className="text-xs text-[#6b6b80] mt-1.5">All prices in your dashboard will be displayed in this currency using estimated exchange rates.</p>
              </div>

              <ThemeColorPicker id="settings-brand-color" value={profile.primaryColor} packId={business.packId} onChange={(hex) => setProfile({ ...profile, primaryColor: hex })} />
            </CardContent>
          </Card>
        )}

        {tab === "booking" && (
          <div className="space-y-6">
            <Card>
              <CardHeader><CardTitle>Calendar</CardTitle></CardHeader>
              <CardContent><CalendarFeeds /></CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Booking mode</CardTitle></CardHeader>
              <CardContent>
                <BookingModeSettings
                  initialMode={business.bookingMode ?? "SLOT"}
                  initialSessions={tokenSessions}
                  staff={staff}
                  appointmentWord={term(business, "appointment")}
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Free follow-up</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                <label htmlFor="follow-up-days" className="text-sm font-medium block">Days after a completed {term(business, "appointment")} for one free follow-up</label>
                <input id="follow-up-days" type="number" min={0} max={365} value={followUpDays} onChange={e => setFollowUpDays(e.target.value)}
                  className="w-24 rounded-xl border border-[#e8e6e0] px-4 py-3 text-sm" />
                <p className="text-xs text-[#6b6b80]">0 turns it off. When a customer&apos;s {term(business, "appointment")} is marked completed, they can sign in to My bookings and book one free follow-up with the same {term(business, "staff")} for the same service, up to this many days after that {term(business, "appointment")}. A different {term(business, "staff")}, a later date or another person is booked and charged as a normal {term(business, "appointment")}. Press Save settings to apply.</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>People per booker</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                <label htmlFor="max-people" className="text-sm font-medium block">Most different people one customer can book for in a day</label>
                <input id="max-people" type="number" min={1} max={MAX_PEOPLE_PER_BOOKER_LIMIT} value={maxPeople} onChange={e => setMaxPeople(e.target.value)}
                  className="w-24 rounded-xl border border-[#e8e6e0] px-4 py-3 text-sm" />
                <p className="text-xs text-[#6b6b80]">A fair-use limit per email or phone number (per session for token {term(business, "appointment")}s). Each person is still a separate booking with its own payment. Press Save settings to apply.</p>
              </CardContent>
            </Card>
          </div>
        )}

        {tab === "payments" && payments && <><VerifyGateNotice what="Connecting or changing a payment gateway" /><GatewaySettings {...payments} /></>}

        {/* Availability tab */}
        {tab === "availability" && (
          <>
          <Card>
            <CardHeader>
              <CardTitle>Appointment Slot Duration</CardTitle>
              <span className="text-xs text-[#6b6b80]">How far apart booking slots appear on the booking page</span>
            </CardHeader>
            <CardContent>
              {customSlotInterval ? (
                <div className="flex flex-wrap gap-2">
                  {[10, 15, 20, 30, 45, 60].map(min => (
                    <button
                      key={min}
                      onClick={() => setSlotInterval(min)}
                      className={`px-4 py-2 rounded-xl text-sm font-medium border-2 transition-all ${slotInterval === min ? "border-accent bg-accent/10 text-accent" : "border-[#e8e6e0] text-[#6b6b80] hover:border-accent/40"}`}
                    >
                      {min} min
                    </button>
                  ))}
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <div className="flex flex-wrap gap-2">
                    {[10, 15, 20, 30, 45, 60].map(min => (
                      <button
                        key={min}
                        disabled
                        className={`px-4 py-2 rounded-xl text-sm font-medium border-2 transition-all ${min === 30 ? "border-accent bg-accent/10 text-accent" : "border-[#e8e6e0] text-[#6b6b80] opacity-40 cursor-not-allowed"}`}
                      >
                        {min} min
                      </button>
                    ))}
                  </div>
                  <span className="text-xs text-[#6b6b80] flex items-center gap-1"><Lock size={11} /> Custom intervals available on higher plans</span>
                </div>
              )}
              <p className="text-xs text-[#6b6b80] mt-3">e.g. &quot;30 min&quot; shows slots at 9:00, 9:30, 10:00 · &quot;15 min&quot; shows 9:00, 9:15, 9:30…</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Weekly Availability</CardTitle>
              <span className="text-xs text-[#6b6b80]">Set your working hours for each day</span>
            </CardHeader>
            <CardContent className="space-y-2">
              {DAYS.map(({ key, label }) => {
                const day = availability[key] ?? { enabled: false, start: "09:00", end: "18:00" };
                return (
                  <div key={key} className={`flex items-center gap-4 p-3 rounded-xl transition-colors ${day.enabled ? "bg-[#f8f7f4]" : "opacity-50"}`}>
                    <button onClick={() => toggleDay(key)} className="flex-shrink-0">
                      <div className={`w-10 h-5 rounded-full transition-colors relative ${day.enabled ? "bg-accent" : "bg-[#d1d1d8]"}`}>
                        <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${day.enabled ? "translate-x-5" : "translate-x-0.5"}`} />
                      </div>
                    </button>
                    <span className="text-sm font-medium w-24 flex-shrink-0">{label}</span>
                    {day.enabled ? (
                      <div className="flex items-center gap-2 flex-1">
                        <input type="time" aria-label={`${key} opening time`} value={day.start} onChange={e => updateTime(key, "start", e.target.value)}
                          className="h-9 rounded-xl border border-[#e8e6e0] px-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent bg-white" />
                        <span className="text-[#6b6b80] text-sm">to</span>
                        <input type="time" aria-label={`${key} closing time`} value={day.end} onChange={e => updateTime(key, "end", e.target.value)}
                          className="h-9 rounded-xl border border-[#e8e6e0] px-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent bg-white" />
                      </div>
                    ) : (
                      <span className="text-sm text-[#6b6b80]">Closed</span>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>
          </>
        )}

        {error && <p className="text-sm text-red-500">{error}</p>}
        <div className={tab === "payments" ? "hidden" : "flex justify-end"}>
          <Button onClick={save} disabled={saving} className="gap-2 px-8">
            {saved ? <><Check size={16} /> Saved!</> : saving ? "Saving..." : "Save settings"}
          </Button>
        </div>
      </div>
    </DashboardLayout>
  );
}
