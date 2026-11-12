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
import { PaymentsSettings, type PaymentsSettingsProps } from "@/components/settings/PaymentsSettings";
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
  bankAccountName?: string; bankAccountNumber?: string; bankRoutingNumber?: string; bankIban?: string;
  legalBusinessName?: string; rzpBusinessType?: string; rzpCategory?: string; rzpSubcategory?: string;
  panNumber?: string; gstNumber?: string;
  addressStreet?: string; addressCity?: string; addressState?: string; addressPostalCode?: string;
  routeStatus?: string; razorpayConnectAccountId?: string;
  bookingMode?: "SLOT" | "TOKEN"; termsOverride?: unknown;
}

type Tab = "profile" | "availability" | "booking" | "payments" | "payout";

export function SettingsClient({ business, customSlotInterval = false, stripePayments = false, tokenSessions = [], staff = [], payments }: { business: BusinessData; customSlotInterval?: boolean; stripePayments?: boolean; tokenSessions?: TokenSessionRow[]; staff?: { id: string; name: string }[]; payments?: PaymentsSettingsProps }) {
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

  const [payout, setPayout] = useState({
    paymentMode: business.paymentMode ?? "postpaid",
    bankAccountName: business.bankAccountName ?? "",
    bankAccountNumber: business.bankAccountNumber ?? "",
    bankRoutingNumber: business.bankRoutingNumber ?? "",
    bankIban: business.bankIban ?? "",
    legalBusinessName: business.legalBusinessName ?? "",
    rzpBusinessType: business.rzpBusinessType ?? "",
    rzpCategory: business.rzpCategory ?? "",
    rzpSubcategory: business.rzpSubcategory ?? "",
    panNumber: business.panNumber ?? "",
    gstNumber: business.gstNumber ?? "",
    addressStreet: business.addressStreet ?? "",
    addressCity: business.addressCity ?? "",
    addressState: business.addressState ?? "",
    addressPostalCode: business.addressPostalCode ?? "",
  });

  const [routeStatus, setRouteStatus] = useState(business.routeStatus ?? "not_started");
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState("");

  const RZP_BUSINESS_TYPES = [
    "individual", "proprietorship", "partnership", "private_limited",
    "public_limited", "llp", "trust", "society", "ngo", "not_yet_registered",
  ];

  const connectRoute = async () => {
    setConnecting(true);
    setConnectError("");
    try {
      // Persist the latest payout/KYC fields first so the server has them.
      const saveRes = await fetch("/api/settings/payout", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payout),
      });
      if (!saveRes.ok) throw new Error("Failed to save details before connecting");

      const res = await fetch("/api/razorpay/connect", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to connect with Razorpay");
      setRouteStatus(data.routeStatus ?? "needs_clarification");
      router.refresh();
    } catch (e) {
      setConnectError((e as Error).message);
    } finally {
      setConnecting(false);
    }
  };

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
      if (tab === "payout") {
        const res = await fetch("/api/settings/payout", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payout),
        });
        if (!res.ok) throw new Error("Failed to save payout settings");
      } else {
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

  const hasBankDetails = !!(payout.bankAccountName.trim() && (payout.bankAccountNumber.trim() || payout.bankIban.trim()));

  const initials = profile.name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();

  const TABS: { key: Tab; label: string; icon: React.ElementType }[] = [
    { key: "profile", label: "Business Profile", icon: Globe },
    { key: "availability", label: "Availability", icon: Phone },
    { key: "booking", label: "Booking", icon: Check },
    ...(payments ? [{ key: "payments" as Tab, label: "Online payments", icon: Wallet }] : []),
    ...(paymentsEnabled ? [{ key: "payout" as Tab, label: "Payout Settings", icon: Wallet }] : []),
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

        {/* Payments are switched off: keep postpaid as the only choice; show an existing prepaid mode read-only. */}
        {tab === "profile" && !paymentsEnabled && business.paymentMode === "prepaid" && (
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><CreditCard size={16} /> Booking Payment Mode</CardTitle></CardHeader>
            <CardContent>
              <p className="text-sm text-[#3d3d4d]">Online payment (currently unavailable)</p>
            </CardContent>
          </Card>
        )}

        {tab === "booking" && (
          <div className="space-y-6">
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

        {tab === "payments" && payments && <PaymentsSettings {...payments} />}

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

        {/* Payout tab */}
        {paymentsEnabled && tab === "payout" && (
          <div className="space-y-5">
            {/* Payment Mode */}
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><CreditCard size={16} /> Booking Payment Mode</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-[#6b6b80]">Choose how clients pay for their bookings.</p>
                <div className="grid sm:grid-cols-2 gap-3">
                  {/* Postpaid — always available */}
                  <button
                    onClick={() => setPayout(p => ({ ...p, paymentMode: "postpaid" }))}
                    className={`text-left p-4 rounded-xl border-2 transition-all ${payout.paymentMode === "postpaid" ? "border-accent bg-accent/5" : "border-[#e8e6e0] hover:border-accent/40"}`}
                  >
                    <div className="flex items-center gap-2 mb-1.5">
                      <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${payout.paymentMode === "postpaid" ? "border-accent" : "border-[#d1d1d8]"}`}>
                        {payout.paymentMode === "postpaid" && <div className="w-2 h-2 rounded-full bg-accent" />}
                      </div>
                      <span className="text-sm font-semibold">Postpaid</span>
                    </div>
                    <p className="text-xs text-[#6b6b80] ml-6">Clients pay at the time of appointment. You collect and mark as paid.</p>
                  </button>

                  {/* Prepaid — locked until bank details are saved, or if plan doesn't support Stripe */}
                  <button
                    onClick={() => stripePayments && hasBankDetails && setPayout(p => ({ ...p, paymentMode: "prepaid" }))}
                    disabled={!stripePayments || !hasBankDetails}
                    className={`text-left p-4 rounded-xl border-2 transition-all relative ${
                      !stripePayments || !hasBankDetails
                        ? "border-[#e8e6e0] opacity-60 cursor-not-allowed"
                        : payout.paymentMode === "prepaid"
                          ? "border-accent bg-accent/5"
                          : "border-[#e8e6e0] hover:border-accent/40"
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1.5">
                      <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${payout.paymentMode === "prepaid" && stripePayments && hasBankDetails ? "border-accent" : "border-[#d1d1d8]"}`}>
                        {payout.paymentMode === "prepaid" && stripePayments && hasBankDetails && <div className="w-2 h-2 rounded-full bg-accent" />}
                      </div>
                      <span className="text-sm font-semibold">Prepaid</span>
                      <Lock size={12} className="text-[#9ca3af] ml-auto" />
                    </div>
                    <p className="text-xs text-[#6b6b80] ml-6">
                      {!stripePayments
                        ? "Online payments require a higher plan."
                        : hasBankDetails
                          ? "Clients pay online when booking. Amount is added to your wallet."
                          : "Add bank account details below to enable prepaid."}
                    </p>
                  </button>
                </div>
              </CardContent>
            </Card>

            {/* Bank Account Details */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Wallet size={16} /> Bank Account Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-[#6b6b80]">Add your bank account details so the admin can process your withdrawal requests.</p>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="sm:col-span-2">
                    <Input
                      label="Account holder name"
                      placeholder="Jane Smith / Acme LLC"
                      value={payout.bankAccountName}
                      onChange={e => setPayout(p => ({ ...p, bankAccountName: e.target.value }))}
                    />
                  </div>
                  <Input
                    label="Account number"
                    placeholder="••••••••1234"
                    value={payout.bankAccountNumber}
                    onChange={e => setPayout(p => ({ ...p, bankAccountNumber: e.target.value }))}
                  />
                  <Input
                    label="IFSC code (India)"
                    placeholder="HDFC0001234"
                    value={payout.bankRoutingNumber}
                    onChange={e => setPayout(p => ({ ...p, bankRoutingNumber: e.target.value.toUpperCase() }))}
                  />
                  <div className="sm:col-span-2">
                    <Input
                      label="IBAN (international)"
                      placeholder="GB29 NWBK 6016 1331 9268 19"
                      value={payout.bankIban}
                      onChange={e => setPayout(p => ({ ...p, bankIban: e.target.value }))}
                    />
                  </div>
                </div>
                <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-700">
                  Your bank details are stored securely and used to settle automatic payouts to your account.
                </div>
              </CardContent>
            </Card>

            {/* Business KYC — required for Razorpay Route automatic payouts */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><CreditCard size={16} /> Business KYC</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-[#6b6b80]">
                  Required by Razorpay to pay you automatically. Booking payments are split to your account at checkout once verified.
                </p>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="sm:col-span-2">
                    <Input
                      label="Legal business name"
                      placeholder="As registered with the government"
                      value={payout.legalBusinessName}
                      onChange={e => setPayout(p => ({ ...p, legalBusinessName: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label htmlFor="settings-business-type-2" className="block text-sm font-medium text-[#374151] mb-1.5">Business type</label>
                    <select id="settings-business-type-2"
                      className="w-full h-11 rounded-xl border border-[#e8e6e0] bg-white px-4 text-sm focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent"
                      value={payout.rzpBusinessType}
                      onChange={e => setPayout(p => ({ ...p, rzpBusinessType: e.target.value }))}
                    >
                      <option value="">Select type…</option>
                      {RZP_BUSINESS_TYPES.map(t => (
                        <option key={t} value={t}>{t.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}</option>
                      ))}
                    </select>
                  </div>
                  <Input
                    label="PAN number"
                    placeholder="ABCDE1234F"
                    value={payout.panNumber}
                    onChange={e => setPayout(p => ({ ...p, panNumber: e.target.value.toUpperCase() }))}
                  />
                  <Input
                    label="Razorpay category"
                    placeholder="e.g. healthcare"
                    value={payout.rzpCategory}
                    onChange={e => setPayout(p => ({ ...p, rzpCategory: e.target.value }))}
                  />
                  <Input
                    label="Razorpay subcategory"
                    placeholder="e.g. clinic"
                    value={payout.rzpSubcategory}
                    onChange={e => setPayout(p => ({ ...p, rzpSubcategory: e.target.value }))}
                  />
                  <div className="sm:col-span-2">
                    <Input
                      label="GST number (optional)"
                      placeholder="22AAAAA0000A1Z5"
                      value={payout.gstNumber}
                      onChange={e => setPayout(p => ({ ...p, gstNumber: e.target.value.toUpperCase() }))}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <Input
                      label="Registered address"
                      placeholder="Street address"
                      value={payout.addressStreet}
                      onChange={e => setPayout(p => ({ ...p, addressStreet: e.target.value }))}
                    />
                  </div>
                  <Input
                    label="City"
                    placeholder="Mumbai"
                    value={payout.addressCity}
                    onChange={e => setPayout(p => ({ ...p, addressCity: e.target.value }))}
                  />
                  <Input
                    label="State"
                    placeholder="Maharashtra"
                    value={payout.addressState}
                    onChange={e => setPayout(p => ({ ...p, addressState: e.target.value }))}
                  />
                  <Input
                    label="Postal code"
                    placeholder="400001"
                    value={payout.addressPostalCode}
                    onChange={e => setPayout(p => ({ ...p, addressPostalCode: e.target.value }))}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Automatic payouts — Razorpay Route connection */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Wallet size={16} /> Automatic Payouts</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-[#6b6b80]">Status:</span>
                  {routeStatus === "activated" ? (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-green-50 text-green-700 text-xs font-medium">
                      <Check size={12} /> Active — payouts are automatic
                    </span>
                  ) : routeStatus === "needs_clarification" || routeStatus === "created" ? (
                    <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 text-xs font-medium">
                      Submitted — pending Razorpay verification
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-gray-100 text-gray-600 text-xs font-medium">
                      Not connected
                    </span>
                  )}
                </div>
                <p className="text-sm text-[#6b6b80]">
                  Connect your account with Razorpay so booking payments are transferred to your bank automatically. Make sure your bank details and KYC above are saved first.
                </p>
                {connectError && <p className="text-sm text-red-500">{connectError}</p>}
                {routeStatus !== "activated" && (
                  <Button onClick={connectRoute} disabled={connecting} variant="outline" className="gap-2">
                    {connecting ? "Connecting…" : routeStatus === "not_started" ? "Connect for automatic payouts" : "Resubmit / refresh status"}
                  </Button>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {error && <p className="text-sm text-red-500">{error}</p>}
        <div className="flex justify-end">
          <Button onClick={save} disabled={saving} className="gap-2 px-8">
            {saved ? <><Check size={16} /> Saved!</> : saving ? "Saving..." : "Save settings"}
          </Button>
        </div>
      </div>
    </DashboardLayout>
  );
}
