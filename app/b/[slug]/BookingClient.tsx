"use client";
import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, Check, Clock, Loader2, MapPin, Globe, Phone, Plus, Minus, Users, ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCurrencyAmount } from "@/lib/currency";
import { bookableServices, providerOptions } from "@/lib/staffMatch";
import { safeThemeColor, readableForeground, themeVars } from "@/lib/theme";
import { BrandMark, SocialIcons, ReviewButton, initialsOf } from "@/components/site/Brand";
import { parseSocialLinks, safeReviewLink, type SocialLinks } from "@/lib/brandLinks";
import { TokenPicker, type TokenOption } from "@/components/tokens/TokenPicker";
import { computeCharge, toMinor } from "@/lib/fees";
import { launchCheckout } from "@/lib/payments/launchCheckout";
import { HOLD_MINUTES } from "@/lib/holds";
import { addMyBooking, datesBookerHolds, loadBooker, loadMyBookings, saveBooker, sessionsBookerHolds, takeAgain, type MyBooking } from "@/lib/bookAgain";
import { AnotherBooking } from "@/components/booking/AnotherBooking";
import { PATIENT_GENDERS, PATIENT_RELATIONS, PATIENT_RELATION_LABELS, type PatientRelation } from "@/lib/patients";
import type { PayConfig } from "@/lib/onlinePayment";

type Step = "service" | "staff" | "datetime" | "details" | "confirm";
const SLOT_STEPS: Step[] = ["service", "staff", "datetime", "details", "confirm"];
// Token businesses: the session picker carries the doctor/staff queue, so there is no separate staff step.
const TOKEN_STEPS: Step[] = ["service", "datetime", "details", "confirm"];
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DAYS_SHORT = ["Su","Mo","Tu","We","Th","Fr","Sa"];

import { t, providerWord, type TermOpts } from "@/lib/terms";
import type { TermKey } from "@/lib/packs/types";

const BUSINESS_TYPE_LABELS: Record<string, string> = {
  salon: "Hair Salon", barbershop: "Barbershop", clinic: "Medical Clinic",
  spa: "Spa & Wellness", dental: "Dental Practice", physio: "Physiotherapy",
  coach: "Coaching / Consulting", tattoo: "Tattoo Studio", beauty: "Beauty & Nails",
  fitness: "Fitness / Personal Training", therapy: "Therapy / Counseling", general: "Service Business",
};

interface Service { id: string; name: string; description: string; duration: number; price: number; color: string; capacity: number; }
interface StaffMember { id: string; name: string; role: string; color: string; serviceIds: string[]; }
interface Business {
  slug: string; name: string; primaryColor: string; businessType: string;
  description: string; phone: string; address: string; website: string;
  currency: string; paymentMode: string;
  /** India needs a phone number as well as an email. */
  phoneRequired?: boolean;
  /** Cashfree online payments (null = no online charge; legacy paymentMode applies). */
  payConfig?: PayConfig | null;
  packId: string; termsOverride: unknown; bookingMode?: "SLOT" | "TOKEN";
  logoUrl?: string | null; socialLinks?: SocialLinks; googleReviewUrl?: string | null;
  services: Service[]; staff: StaffMember[];
}

export function BookingClient({ business }: { business: Business }) {
  const word = (key: TermKey, opts?: TermOpts) => t(business, key, opts);
  const svc1 = word("service"), svcN = word("service", { plural: true });
  const Svc1 = word("service", { cap: true });
  const appt1 = word("appointment");
  // "doctor" / "advocate" when the whole team shares that role, else the pack word.
  const stf1 = providerWord(business.staff.filter(m => m.serviceIds.length > 0).map(m => m.role), word("staff"));
  const Stf1 = stf1.charAt(0).toUpperCase() + stf1.slice(1);
  const tokenMode = business.bookingMode === "TOKEN";
  const STEPS = tokenMode ? TOKEN_STEPS : SLOT_STEPS;
  const STEP_LABEL: Record<Step, string> = { service: Svc1, staff: Stf1, datetime: tokenMode ? "Date & Session" : "Date & Time", details: "Your Details", confirm: "Confirm" };
  const STEP_LABELS = STEPS.map(s => STEP_LABEL[s]);
  const searchParams = useSearchParams();
  // Hide services nobody on the team is linked to (they could never be booked).
  const services = bookableServices(business.services, business.staff);
  const [step, setStep] = useState<Step>("service");
  const [serviceSearch, setServiceSearch] = useState("");
  const [selectedServices, setSelectedServices] = useState<string[]>(() => {
    const preselect = searchParams?.get("service");
    return preselect && services.some(s => s.id === preselect) ? [preselect] : [];
  });
  const [selectedStaff, setSelectedStaff] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<number | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", email: "", phone: "", notes: "" });
  // "Who is this appointment for?" Someone else: the booker's email/phone stay, the patient is who it is for.
  const [forSomeone, setForSomeone] = useState(false);
  const [patientName, setPatientName] = useState("");
  const [relation, setRelation] = useState<PatientRelation | "">("");
  const [patientAge, setPatientAge] = useState("");
  const [patientGender, setPatientGender] = useState("");
  // The server refused: this person already has a booking that day, or the booker passed the fair-use cap.
  const [refusal, setRefusal] = useState<{ message: string; code: string } | null>(null);
  // Bookings made in this tab, to grey out dates the booker already holds (the server still decides).
  const [mine, setMine] = useState<MyBooking[]>([]);
  const [savedName, setSavedName] = useState("");
  const [loading, setLoading] = useState(false);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [availableSlots, setAvailableSlots] = useState<string[]>([]);
  const [bookedSlots, setBookedSlots] = useState<string[]>([]);
  const [spotsMap, setSpotsMap] = useState<Record<string, number>>({});
  const [isGroupService, setIsGroupService] = useState(false);
  // Month availability, tagged with the request it answers so stale answers are ignored.
  const [monthData, setMonthData] = useState<{ key: string; days: Record<string, boolean> | null; next: string | null } | null>(null);
  const [booked, setBooked] = useState(false);
  // The server did not email/WhatsApp the confirmation (a contact over its daily quota): say so, never silently.
  const [confirmationWithheld, setConfirmationWithheld] = useState(false);
  const [tokenDate, setTokenDate] = useState("");
  const [tokenPick, setTokenPick] = useState<TokenOption | null>(null);
  const [tokenResult, setTokenResult] = useState<{ number: number; estimatedTime: string; sessionName: string; dateLabel: string; staffName: string | null; trackUrl?: string | null } | null>(null);
  const [error, setError] = useState("");
  const isValidEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  const now = new Date();
  const [viewMonth, setViewMonth] = useState(now.getMonth());
  const [viewYear, setViewYear] = useState(now.getFullYear());

  const firstDay = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const calCells: (number | null)[] = [...Array(firstDay).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];

  const todayDay = now.getDate();
  const todayMonth = now.getMonth();
  const todayYear = now.getFullYear();

  function isPastDay(day: number) {
    if (viewYear < todayYear) return true;
    if (viewYear === todayYear && viewMonth < todayMonth) return true;
    if (viewYear === todayYear && viewMonth === todayMonth && day < todayDay) return true;
    return false;
  }

  function prevMonth() {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
    setSelectedDate(null); setSelectedTime(null);
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
    setSelectedDate(null); setSelectedTime(null);
  }

  useEffect(() => {
    const saved = loadBooker(business.slug);
    const again = takeAgain(business.slug);
    // After the first paint, so the server HTML and the first client render match.
    void Promise.resolve().then(() => {
      setMine(loadMyBookings(business.slug));
      setSavedName(saved?.name ?? "");
      if (!saved || !again) return;
      setForm((f) => ({ ...f, name: saved.name, email: saved.email, phone: saved.phone }));
      const ids = again.serviceIds.filter((id) => services.some((x) => x.id === id));
      if (ids.length === 0) return;
      setSelectedServices(ids);
      setSelectedStaff(again.staffId ?? "any");
      setForSomeone(again.mode === "other");
      if (again.mode === "other" && again.date) {
        const [y, m, d] = again.date.split("-").map(Number);
        if (tokenMode) setTokenDate(again.date);
        else { setViewYear(y); setViewMonth(m - 1); setSelectedDate(d); }
      }
      setStep("datetime");
    });
    // Runs once per page load; `services` and `tokenMode` come from props that do not change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [business.slug]);

  function toggleService(id: string) {
    setSelectedServices(prev =>
      prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]
    );
    // A different service mix can change who qualifies, so start the later steps over.
    resetAfterServices();
  }

  function resetAfterServices() {
    setSelectedStaff(null);
    setSelectedDate(null);
    setSelectedTime(null);
    setMonthData(null);
    setTokenPick(null);
  }

  // Derived totals from selected services
  const selectedServiceObjs = business.services.filter(s => selectedServices.includes(s.id));
  const totalDuration = selectedServiceObjs.reduce((s, svc) => s + svc.duration, 0);
  const totalPrice = selectedServiceObjs.reduce((s, svc) => s + svc.price, 0);

  const staffParam = selectedStaff && selectedStaff !== "any" ? `&staffId=${selectedStaff}` : "";
  const monthKey = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}`;

  const monthRequest = `${business.slug}|${monthKey}|${selectedServices.join(",")}|${staffParam}`;

  // Which days of the month have a free slot for these services + provider.
  useEffect(() => {
    if (tokenMode || step !== "datetime" || selectedServices.length === 0 || totalDuration === 0) return;
    let cancelled = false;
    fetch(`/api/availability/month?slug=${business.slug}&month=${monthKey}&duration=${totalDuration}&serviceIds=${selectedServices.join(",")}${staffParam}`)
      .then(r => (r.ok ? r.json() : null))
      .then(data => { if (!cancelled) setMonthData({ key: monthRequest, days: data?.days ?? null, next: data?.nextAvailable ?? null }); })
      .catch(() => { if (!cancelled) setMonthData({ key: monthRequest, days: null, next: null }); });
    return () => { cancelled = true; };
  }, [tokenMode, step, selectedServices, staffParam, monthKey, monthRequest, totalDuration, business.slug]);

  const monthReady = monthData?.key === monthRequest;
  const monthDays = monthReady ? monthData.days : null;
  const nextAvailable = monthReady ? monthData.next : null;
  const monthLoading = !monthReady;

  function dayHasSlots(day: number) {
    if (!monthDays) return true; // unknown yet: do not grey out
    return monthDays[`${monthKey}-${String(day).padStart(2, "0")}`] !== false;
  }

  function jumpTo(dateIso: string) {
    const [y, m, d] = dateIso.split("-").map(Number);
    setViewYear(y); setViewMonth(m - 1); setSelectedDate(d); setSelectedTime(null);
  }

  function formatNextAvailable(dateIso: string) {
    const [y, m, d] = dateIso.split("-").map(Number);
    return `${MONTHS[m - 1]} ${d}, ${y}`;
  }

  const monthHasNone = !!monthDays && !Object.values(monthDays).some(Boolean);

  // Fetch available slots when date or selected services change
  useEffect(() => {
    if (!selectedDate || selectedServices.length === 0) return;
    if (totalDuration === 0) return;

    const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(selectedDate).padStart(2, "0")}`;
    const firstServiceId = selectedServices[0];
    setSlotsLoading(true);
    setSelectedTime(null);
    fetch(`/api/availability?slug=${business.slug}&date=${dateStr}&duration=${totalDuration}&serviceId=${firstServiceId}&serviceIds=${selectedServices.join(",")}${staffParam}`)
      .then(r => r.json())
      .then(data => {
        setAvailableSlots(data.slots ?? []);
        setBookedSlots(data.bookedSlots ?? []);
        setSpotsMap(data.spotsMap ?? {});
        setIsGroupService(!!data.isGroup);
      })
      .finally(() => setSlotsLoading(false));
  }, [selectedDate, selectedServices, staffParam, viewMonth, viewYear, business.slug, totalDuration]);

  const staff = business.staff.find(s => s.id === selectedStaff);
  const provider = providerOptions(business.staff, selectedServices);
  const stepIndex = STEPS.indexOf(step);
  const color = safeThemeColor(business.primaryColor);
  const fg = readableForeground(color);
  const social = parseSocialLinks(business.socialLinks);
  const reviewUrl = safeReviewLink(business.googleReviewUrl);

  const typeLabel = BUSINESS_TYPE_LABELS[business.businessType] ?? "Service Business";

  function next() { if (stepIndex < STEPS.length - 1) setStep(STEPS[stepIndex + 1]); }
  function back() { if (stepIndex > 0) setStep(STEPS[stepIndex - 1]); }

  const tokenDateLabel = tokenDate ? (() => { const [y, m, d] = tokenDate.split("-").map(Number); return `${MONTHS[m - 1]} ${d}, ${y}`; })() : "—";
  const dateStr = tokenMode ? tokenDateLabel : selectedDate ? `${MONTHS[viewMonth]} ${selectedDate}, ${viewYear}` : "—";
  const bookingDateIso = tokenMode ? tokenDate : selectedDate ? `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(selectedDate).padStart(2, "0")}` : "";
  const bookerName = form.name || savedName;
  // Booking for myself: dates (or, for tokens, sessions) I already hold are greyed out. Someone else is allowed the same day.
  const heldDates = forSomeone ? {} : datesBookerHolds(mine, bookerName);
  const heldSessions = forSomeone ? {} : sessionsBookerHolds(mine, bookerName, tokenDate);
  const patientLabel = forSomeone && patientName.trim() ? patientName.trim() : form.name;
  const serviceNamesLabel = selectedServiceObjs.map(s => s.name).join(" & ") || "—";
  // Online charge for this booking (same calculator as the server, which stays authoritative).
  const payConfig = business.payConfig ?? null;
  const onlineCharge = payConfig ? computeCharge({ ...payConfig, priceMinor: toMinor(totalPrice) }) : null;
  const payNowMinor = onlineCharge?.chargeMinor ?? 0;
  const payNowLabel = formatCurrencyAmount(payNowMinor / 100, business.currency);
  // Phone is required in India, and whenever an online payment is due.
  const phoneNeeded = !!business.phoneRequired || payNowMinor > 0;
  const paymentLabel = payConfig
    ? payNowMinor === 0
      ? `Pay at ${appt1}`
      : payConfig.mode === "BOOKING_FEE_ONLY" ? `${payNowLabel} booking fee now, rest at ${appt1}` : `${payNowLabel} now, online`
    : business.paymentMode === "postpaid" ? `Pay at ${appt1}` : "Pay now via card";
  const payAtVenue = payConfig ? payNowMinor === 0 || payConfig.mode === "BOOKING_FEE_ONLY" : business.paymentMode === "postpaid";

  async function handleConfirm() {
    setLoading(true); setError("");
    saveBooker(business.slug, { name: form.name, email: form.email, phone: form.phone });
    try {
      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessSlug: business.slug,
          serviceIds: selectedServices,
          staffId: tokenMode ? null : selectedStaff === "any" ? null : selectedStaff,
          ...(tokenMode
            ? { date: tokenDate, tokenSessionId: tokenPick?.id }
            : { date: `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(selectedDate).padStart(2, "0")}`, time: selectedTime }),
          clientName: form.name,
          ...(forSomeone && patientName.trim() ? {
            patientName: patientName.trim(),
            patientRelation: relation || undefined,
            ...(business.packId === "CLINIC" ? { patientAge: patientAge || undefined, patientGender: patientGender || undefined } : {}),
          } : {}),
          clientEmail: form.email,
          clientPhone: form.phone || null,
          notes: form.notes || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        // Same person already booked that day, or too many people for this booker: a friendly answer, not an error.
        if (data.code === "DUPLICATE_PATIENT" || data.code === "PEOPLE_CAP") { setRefusal({ message: data.error, code: data.code }); return; }
        setError(data.error ?? "Something went wrong.");
        return;
      }
      // Remember this booking in the tab, so the next one can grey out the date. A paid one counts once paid.
      const kept = { date: bookingDateIso, patient: patientLabel, label: data.token ? `Token #${data.token.number}` : `${selectedTime}`, tokenSessionId: tokenMode ? tokenPick?.id : undefined, serviceIds: selectedServices, staffId: selectedStaff && selectedStaff !== "any" ? selectedStaff : null };
      if (data.checkout) {
        addMyBooking(business.slug, { ...kept, orderId: data.checkout.orderId, confirmed: false });
        await launchCheckout(data.checkout);
        return;
      }
      addMyBooking(business.slug, { ...kept, confirmed: true });
      if (data.url) { window.location.href = data.url; } else { if (data.token) setTokenResult(data.token); setConfirmationWithheld(!!data.confirmationWithheld); setBooked(true); }
    } catch (e) { setError(e instanceof Error && e.message.startsWith("Could not load") ? e.message : "Network error. Please try again."); }
    finally { setLoading(false); }
  }

  if (booked) {
    return (
      <div className="min-h-screen bg-[#f8f7f4] flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl p-10 max-w-md w-full text-center shadow-xl border border-[#e8e6e0]">
          <div className="w-16 h-16 rounded-full bg-green-50 flex items-center justify-center mx-auto mb-6">
            <Check size={28} className="text-green-600" />
          </div>
          <h1 className="font-syne font-bold text-2xl mb-2">You&apos;re booked! 🎉</h1>
          {confirmationWithheld ? (
            <p className="text-amber-900 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm mb-6">
              Your {appt1} is booked, but we could not send a confirmation message because of the number of bookings made with these contact details today. Please keep the details below, or contact {business.name} if you need a copy.
            </p>
          ) : (
            <p className="text-[#6b6b80] mb-6">A confirmation has been sent to <strong>{form.email}</strong>.</p>
          )}
          <div className="bg-[#f8f7f4] rounded-2xl p-5 text-left mb-6 space-y-2.5">
            <div className="flex justify-between text-sm"><span className="text-[#6b6b80]">Business</span><span className="font-medium">{business.name}</span></div>
            <div className="flex justify-between text-sm"><span className="text-[#6b6b80]">For</span><span className="font-medium text-right max-w-[60%]">{patientLabel}</span></div>
            <div className="flex justify-between text-sm">
              <span className="text-[#6b6b80]">{word("service", { cap: true, plural: selectedServiceObjs.length > 1 })}</span>
              <span className="font-medium text-right max-w-[60%]">{serviceNamesLabel}</span>
            </div>
            <div className="flex justify-between text-sm"><span className="text-[#6b6b80]">Date</span><span className="font-medium">{dateStr}</span></div>
            {tokenResult ? (
              <>
                <div className="flex justify-between text-sm"><span className="text-[#6b6b80]">Token</span><span className="font-bold text-lg" style={{ color }}>#{tokenResult.number}</span></div>
                <div className="flex justify-between text-sm"><span className="text-[#6b6b80]">Estimated time</span><span className="font-medium">{tokenResult.estimatedTime}</span></div>
                <div className="flex justify-between text-sm"><span className="text-[#6b6b80]">Session</span><span className="font-medium">{tokenResult.sessionName}</span></div>
                {tokenResult.staffName && <div className="flex justify-between text-sm"><span className="text-[#6b6b80]">{Stf1}</span><span className="font-medium">{tokenResult.staffName}</span></div>}
                {tokenResult.trackUrl && (
                  <a href={tokenResult.trackUrl} className="block text-center font-semibold rounded-xl px-4 py-3 mt-2" style={{ background: color, color: fg }}>Track your place in line</a>
                )}
              </>
            ) : (
              <>
                <div className="flex justify-between text-sm"><span className="text-[#6b6b80]">Time</span><span className="font-medium">{selectedTime}</span></div>
                <div className="flex justify-between text-sm"><span className="text-[#6b6b80]">Duration</span><span className="font-medium">{totalDuration} min</span></div>
              </>
            )}
            <div className="flex justify-between text-sm border-t border-[#f0ede8] pt-2 mt-2">
              <span className="font-semibold">Total</span>
              <span className="font-bold" style={{ color }}>{formatCurrencyAmount(totalPrice, business.currency)}</span>
            </div>
            <div className="flex justify-between text-sm pt-1">
              <span className="text-[#6b6b80]">Payment</span>
              <span className="font-medium">{payAtVenue ? `Pay at ${appt1}` : "Paid online"}</span>
            </div>
          </div>
          <AnotherBooking slug={business.slug} bookPath={typeof window !== "undefined" ? window.location.pathname : `/${business.slug}/book-now`}
            serviceIds={selectedServices} staffId={selectedStaff && selectedStaff !== "any" ? selectedStaff : null} date={bookingDateIso} appointmentWord={appt1} />
          {reviewUrl && (
            <div className="mb-2">
              <p className="text-xs text-[#6b6b80] mb-3">Enjoyed booking with us? We&apos;d love a quick review.</p>
              <ReviewButton href={reviewUrl} color={color} fg={fg} />
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f8f7f4]" style={themeVars(color) as React.CSSProperties}>
      {/* Tenant branding header */}
      <div style={{ background: color, color: fg }}>
        <div className="max-w-2xl mx-auto px-4 pt-4 pb-8">
          <a href="/" className="inline-flex items-center gap-1.5 opacity-70 hover:opacity-100 text-xs font-medium transition-colors mb-6">
            <ArrowLeft size={13} /> Back to website
          </a>
          <div className="text-center">
          <div className="flex justify-center mb-4">
            {business.logoUrl ? (
              <span className="w-16 h-16 rounded-2xl bg-white/90 p-1.5 inline-flex"><BrandMark name={business.name} logoUrl={business.logoUrl} color={color} fg={fg} size={52} /></span>
            ) : (
              <span style={{ background: fg + "26" }} className="w-16 h-16 rounded-2xl flex items-center justify-center font-syne font-bold text-2xl">{initialsOf(business.name)}</span>
            )}
          </div>
          <h1 className="font-syne font-bold text-2xl mb-1">{business.name}</h1>
          <p className="opacity-80 text-sm mb-2">{typeLabel}</p>
          {business.description && <p className="opacity-70 text-sm max-w-md mx-auto">{business.description}</p>}
          <div className="flex items-center justify-center gap-4 mt-3 flex-wrap">
            {business.address && <span className="flex items-center gap-1 opacity-70 text-xs"><MapPin size={11} />{business.address}</span>}
            {business.phone && <span className="flex items-center gap-1 opacity-70 text-xs"><Phone size={11} />{business.phone}</span>}
            {business.website && <a href={business.website} target="_blank" rel="noreferrer" className="flex items-center gap-1 opacity-70 text-xs hover:opacity-100 transition-colors"><Globe size={11} />{business.website.replace(/^https?:\/\//, "")}</a>}
          </div>
          {Object.keys(social).length > 0 && <SocialIcons links={social} tone="light" className="justify-center mt-3" />}
          </div>
        </div>
      </div>

      {/* Progress bar */}
      <div className="bg-white border-b border-[#e8e6e0]">
        <div className="max-w-2xl mx-auto px-4 py-4">
          <div className="flex items-center gap-2">
            {STEPS.map((s, i) => (
              <div key={s} className="flex items-center gap-2 flex-1 last:flex-none">
                <div className={cn("w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 transition-all",
                  i < stepIndex ? "text-white" : i === stepIndex ? "bg-[#0f0f1a] text-white" : "bg-[#f0ede8] text-[#6b6b80]")}
                  style={i < stepIndex ? { background: color, color: fg } : {}}>
                  {i < stepIndex ? <Check size={12} /> : i + 1}
                </div>
                <span className={cn("text-xs font-medium hidden sm:block", i === stepIndex ? "text-[#0f0f1a]" : "text-[#6b6b80]")}>{STEP_LABELS[i]}</span>
                {i < STEPS.length - 1 && <div className={cn("flex-1 h-px hidden sm:block", i < stepIndex ? "" : "bg-[#e8e6e0]")} style={i < stepIndex ? { background: color, color: fg } : {}} />}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-8">

        {/* Step: Service */}
        {step === "service" && (
          <div>
            <h2 className="font-syne font-bold text-2xl mb-1">Choose {svcN}</h2>
            <p className="text-[#6b6b80] mb-4 text-sm">Select one or more {svcN} you&apos;d like to book.</p>
            {services.length > 4 && (
              <div className="relative mb-4">
                <input
                  type="text"
                  aria-label={`Search ${svcN}`}
                  placeholder={`Search ${svcN}...`}
                  value={serviceSearch}
                  onChange={e => setServiceSearch(e.target.value)}
                  className="w-full rounded-xl border border-[#e8e6e0] px-4 py-3 pl-10 text-sm focus:outline-none focus:ring-2 focus:border-accent transition-all bg-white"
                />
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6b6b80]" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
              </div>
            )}
            <div className="space-y-3">
              {services
                .filter(svc => !serviceSearch || svc.name.toLowerCase().includes(serviceSearch.toLowerCase()) || svc.description.toLowerCase().includes(serviceSearch.toLowerCase()))
                .map(svc => {
                  const isSelected = selectedServices.includes(svc.id);
                  return (
                    <button key={svc.id} onClick={() => toggleService(svc.id)}
                      className={cn("w-full bg-white rounded-2xl p-5 border-2 text-left transition-all hover:shadow-md flex items-center gap-4",
                        isSelected ? "shadow-md" : "border-[#e8e6e0]")}
                      style={isSelected ? { borderColor: color } : {}}>
                      <div className="w-10 h-10 rounded-xl flex-shrink-0 flex items-center justify-center" style={{ background: svc.color + "20" }}>
                        <div className="w-4 h-4 rounded-full" style={{ background: svc.color }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold">{svc.name}</span>
                          {svc.capacity > 1 && (
                            <span className="text-[10px] font-semibold text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded-full flex items-center gap-1">
                              <Users size={9} /> Group · {svc.capacity} spots
                            </span>
                          )}
                        </div>
                        {svc.description && <div className="text-sm text-[#6b6b80] mt-0.5 line-clamp-1">{svc.description}</div>}
                        <div className="flex items-center gap-1 mt-1.5 text-xs text-[#6b6b80]"><Clock size={11} /> {svc.duration} min</div>
                      </div>
                      <div className="font-syne font-bold text-lg" style={{ color }}>{formatCurrencyAmount(svc.price, business.currency)}</div>
                      <div className={cn("w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 border-2 transition-all",
                        isSelected ? "border-transparent" : "border-[#d1d1d8]")}
                        style={isSelected ? { background: color, color: fg } : {}}>
                        {isSelected ? <Check size={12} className="text-white" /> : <Plus size={12} className="text-[#d1d1d8]" />}
                      </div>
                    </button>
                  );
                })}
              {services.filter(svc => !serviceSearch || svc.name.toLowerCase().includes(serviceSearch.toLowerCase()) || svc.description.toLowerCase().includes(serviceSearch.toLowerCase())).length === 0 && (
                <p className="text-sm text-[#6b6b80] text-center py-6">No {svcN} match your search.</p>
              )}
            </div>

            {/* Selection summary bar */}
            {selectedServices.length > 0 && (
              <div className="mt-5 bg-white border border-[#e8e6e0] rounded-2xl p-4 flex items-center justify-between gap-4">
                <div className="text-sm">
                  <span className="font-semibold">{selectedServices.length} {word("service", { plural: selectedServices.length > 1 })} selected</span>
                  <span className="text-[#6b6b80] ml-2">· {totalDuration} min · {formatCurrencyAmount(totalPrice, business.currency)}</span>
                </div>
                {selectedServices.length > 1 && (
                  <button onClick={() => { setSelectedServices([]); resetAfterServices(); }}
                    className="text-xs text-[#6b6b80] hover:text-red-500 transition-colors flex items-center gap-1">
                    <Minus size={11} /> Clear
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* Step: Staff */}
        {step === "staff" && (
          <div>
            <h2 className="font-syne font-bold text-2xl mb-2">Choose your {stf1}</h2>
            <p className="text-[#6b6b80] mb-6">Select who you&apos;d like your {appt1} with.</p>
            {provider.kind === "none" && (
              <div className="bg-white rounded-2xl border border-[#e8e6e0] p-6 text-center" role="alert">
                <p className="font-semibold mb-1">No single {stf1} offers all of these together.</p>
                <p className="text-sm text-[#6b6b80] mb-4">Please book them separately.</p>
                <button onClick={() => setStep("service")}
                  className="inline-flex items-center gap-2 text-sm font-semibold px-5 py-2.5 rounded-xl border border-[#e8e6e0] hover:bg-[#f8f7f4] transition-colors">
                  <ChevronLeft size={16} /> Back to {svcN}
                </button>
              </div>
            )}
            {provider.kind === "shared" && (
              <p className="text-sm text-[#6b6b80]">No {stf1} choice is needed. Continue to pick a time.</p>
            )}
            {provider.kind === "choose" && [
              { id: "any", name: "No preference", role: `We'll assign the best available ${stf1}`, color: "#6b6b80" },
              ...provider.staff,
            ].map(member => (
              <button key={member.id} onClick={() => setSelectedStaff(member.id)}
                className={cn("w-full bg-white rounded-2xl p-5 border-2 text-left transition-all mb-3 flex items-center gap-4 hover:shadow-md",
                  selectedStaff === member.id ? "shadow-md" : "border-[#e8e6e0]")}
                style={selectedStaff === member.id ? { borderColor: color } : {}}>
                <div className="w-11 h-11 rounded-full flex items-center justify-center text-white font-syne font-bold flex-shrink-0"
                  style={{ background: member.id === "any" ? "#f0ede8" : member.color }}>
                  <span style={{ color: member.id === "any" ? "#6b6b80" : "white" }}>
                    {member.id === "any" ? "?" : member.name.split(" ").map(n => n[0]).join("")}
                  </span>
                </div>
                <div className="flex-1">
                  <div className="font-semibold">{member.name}</div>
                  <div className="text-sm text-[#6b6b80]">{member.role}</div>
                </div>
                {selectedStaff === member.id && <div className="w-5 h-5 rounded-full flex items-center justify-center" style={{ background: color, color: fg }}><Check size={11} className="text-white" /></div>}
              </button>
            ))}
          </div>
        )}

        {/* Step: Date & Time */}
        {step === "datetime" && tokenMode && (
          <TokenPicker
            slug={business.slug} serviceIds={selectedServices} date={tokenDate} selectedId={tokenPick?.id ?? null}
            onPick={(d, option) => { setTokenDate(d); setTokenPick(option); }}
            heldSessions={heldSessions}
            staffWord={stf1} appointmentWord={appt1} color={color} fg={fg}
          />
        )}
        {step === "datetime" && !tokenMode && (
          <div>
            <h2 className="font-syne font-bold text-2xl mb-2">Pick a date & time</h2>
            <p className="text-[#6b6b80] mb-6">Slots shown for your total booking duration ({totalDuration} min).</p>
            <div className="bg-white rounded-2xl border border-[#e8e6e0] p-5 mb-4">
              <div className="flex items-center justify-between mb-4">
                <button onClick={prevMonth} className="w-8 h-8 rounded-lg border border-[#e8e6e0] flex items-center justify-center text-[#6b6b80] hover:bg-[#f8f7f4] transition-colors"><ChevronLeft size={16} /></button>
                <span className="font-syne font-bold">{MONTHS[viewMonth]} {viewYear}</span>
                <button onClick={nextMonth} className="w-8 h-8 rounded-lg border border-[#e8e6e0] flex items-center justify-center text-[#6b6b80] hover:bg-[#f8f7f4] transition-colors"><ChevronRight size={16} /></button>
              </div>
              <div className="grid grid-cols-7 gap-1 mb-2">
                {DAYS_SHORT.map(d => <div key={d} className="text-center text-[11px] font-bold text-[#6b6b80] py-1">{d}</div>)}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {calCells.map((day, i) => {
                  const past = day ? isPastDay(day) : false;
                  const heldLabel = day ? heldDates[`${monthKey}-${String(day).padStart(2, "0")}`] : undefined;
                  const held = !!heldLabel;
                  const full = !!day && !past && !held && !dayHasSlots(day);
                  const isSelected = day === selectedDate;
                  return (
                    <button key={i} disabled={!day || past || full || held} onClick={() => day && setSelectedDate(day)}
                      title={held ? `You already have ${heldLabel} on this day` : undefined}
                      aria-label={day && full ? `${MONTHS[viewMonth]} ${day}, no availability` : held ? `${MONTHS[viewMonth]} ${day}, you already have ${heldLabel} on this day` : undefined}
                      className={cn("aspect-square rounded-xl text-sm transition-all font-medium",
                        !day && "invisible",
                        past && "text-[#d0cec8] cursor-not-allowed",
                        full && "text-[#d0cec8] cursor-not-allowed line-through",
                        held && "bg-amber-50 text-amber-800 cursor-not-allowed ring-1 ring-amber-200",
                        !past && !full && day && !isSelected && "hover:bg-[#f8f7f4] cursor-pointer",
                        isSelected && "text-white")}
                      style={isSelected ? { background: color, color: fg } : {}}>
                      {day}
                    </button>
                  );
                })}
              </div>
            </div>
            {Object.keys(heldDates).some(d => d.startsWith(monthKey)) && (
              <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 mb-4">
                Highlighted days are ones where you already have a {appt1} ({Object.entries(heldDates).filter(([d]) => d.startsWith(monthKey)).map(([d, l]) => `${Number(d.slice(8))}: ${l}`).join(", ")}). Booking for someone else? Choose &quot;Someone else&quot; on the next step.
              </p>
            )}
            {monthHasNone && !monthLoading && (
              <div className="bg-white rounded-2xl border border-[#e8e6e0] p-4 mb-4 text-sm flex items-center justify-between gap-3">
                <span className="text-[#6b6b80]">
                  {nextAvailable
                    ? <>No availability in {MONTHS[viewMonth]}. <strong className="text-[#0f0f1a]">Next available: {formatNextAvailable(nextAvailable)}</strong></>
                    : <>No availability in {MONTHS[viewMonth]} or the following months.</>}
                </span>
                {nextAvailable && (
                  <button onClick={() => jumpTo(nextAvailable)} className="font-semibold text-xs px-3 py-2 rounded-lg text-white flex-shrink-0" style={{ background: color, color: fg }}>
                    Go to date
                  </button>
                )}
              </div>
            )}
            {selectedDate && (
              <div className="bg-white rounded-2xl border border-[#e8e6e0] p-5">
                <p className="font-semibold text-sm mb-3">Available times — {MONTHS[viewMonth]} {selectedDate}</p>
                {slotsLoading ? (
                  <div className="flex items-center justify-center py-8"><Loader2 size={20} className="animate-spin text-[#6b6b80]" /></div>
                ) : availableSlots.length === 0 && bookedSlots.length === 0 ? (
                  <p className="text-sm text-[#6b6b80] text-center py-6">No availability on this day. Please pick another date.</p>
                ) : (
                  <div className="grid grid-cols-4 gap-2">
                    {[...availableSlots, ...bookedSlots].sort().map(slot => {
                      const isAvailable = availableSlots.includes(slot);
                      const isSelected = slot === selectedTime;
                      const spotsLeft = isGroupService ? (spotsMap[slot] ?? 0) : null;
                      return (
                        <button key={slot} disabled={!isAvailable} onClick={() => isAvailable && setSelectedTime(slot)}
                          className={cn("py-2 rounded-xl text-sm border transition-all font-medium relative flex flex-col items-center justify-center gap-0.5",
                            !isAvailable && "opacity-40 cursor-not-allowed bg-[#f8f7f4] border-[#f0ede8] text-[#6b6b80] line-through",
                            isAvailable && !isSelected && "border-[#e8e6e0] hover:bg-[#f8f7f4] hover:text-[#0f0f1a] transition-all",
                            isSelected && "text-white border-transparent")}
                          style={isSelected ? { background: color, color: fg } : isAvailable ? { borderColor: "#e8e6e0" } : {}}>
                          {slot}
                          {isGroupService && isAvailable && spotsLeft !== null && (
                            <span className={cn("text-[9px] font-semibold", isSelected ? "text-white/80" : "text-purple-600")}>
                              {spotsLeft} left
                            </span>
                          )}
                          {!isAvailable && !isGroupService && <span className="absolute -top-1 -right-1 text-[8px] bg-red-400 text-white px-1 rounded-full">Taken</span>}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Step: Details */}
        {step === "details" && (
          <div>
            <h2 className="font-syne font-bold text-2xl mb-2">{forSomeone ? "Who is this for, and who is booking?" : "Your details"}</h2>
            <p className="text-[#6b6b80] mb-6">We&apos;ll send the confirmation and reminders to the person booking.</p>
            <div className="bg-white rounded-2xl border border-[#e8e6e0] p-6 space-y-4">
              <fieldset className="space-y-2">
                <legend className="text-sm font-semibold text-[#0f0f1a] mb-2">Who is this {appt1} for?</legend>
                <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label={`Who is this ${appt1} for?`}>
                  {[{ v: false, label: "Myself" }, { v: true, label: "Someone else" }].map(o => (
                    <button key={o.label} type="button" role="radio" aria-checked={forSomeone === o.v} onClick={() => setForSomeone(o.v)}
                      className={cn("min-h-11 rounded-xl border px-4 text-sm font-semibold transition-colors", forSomeone === o.v ? "border-transparent" : "border-[#e8e6e0] hover:bg-[#f8f7f4]")}
                      style={forSomeone === o.v ? { background: color, color: fg } : undefined}>{o.label}</button>
                  ))}
                </div>
              </fieldset>
              {forSomeone && (
                <div className="rounded-xl bg-[#f8f7f4] p-4 space-y-3">
                  <div>
                    <label htmlFor="booking-patient-name" className="text-sm font-medium text-[#0f0f1a] block mb-1.5">Patient&apos;s full name *</label>
                    <input id="booking-patient-name" value={patientName} maxLength={120} onChange={e => setPatientName(e.target.value)} placeholder="Who is this for?"
                      className="w-full rounded-xl border border-[#e8e6e0] px-4 py-3 text-sm bg-white focus:outline-none focus:ring-2 focus:border-accent/40" />
                  </div>
                  <div>
                    <label htmlFor="booking-relation" className="text-sm font-medium text-[#0f0f1a] block mb-1.5">Relation to you (optional)</label>
                    <select id="booking-relation" value={relation} onChange={e => setRelation(e.target.value as PatientRelation | "")}
                      className="w-full rounded-xl border border-[#e8e6e0] px-4 py-3 text-sm bg-white">
                      <option value="">Choose…</option>
                      {PATIENT_RELATIONS.map(r => <option key={r} value={r}>{PATIENT_RELATION_LABELS[r]}</option>)}
                    </select>
                  </div>
                  {business.packId === "CLINIC" && (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label htmlFor="booking-age" className="text-sm font-medium text-[#0f0f1a] block mb-1.5">Age (optional)</label>
                        <input id="booking-age" type="number" inputMode="numeric" min={0} max={120} value={patientAge} onChange={e => setPatientAge(e.target.value)}
                          className="w-full rounded-xl border border-[#e8e6e0] px-4 py-3 text-sm bg-white" />
                      </div>
                      <div>
                        <label htmlFor="booking-gender" className="text-sm font-medium text-[#0f0f1a] block mb-1.5">Gender (optional)</label>
                        <select id="booking-gender" value={patientGender} onChange={e => setPatientGender(e.target.value)} className="w-full rounded-xl border border-[#e8e6e0] px-4 py-3 text-sm bg-white">
                          <option value="">Choose…</option>
                          {PATIENT_GENDERS.map(g => <option key={g} value={g}>{g[0].toUpperCase() + g.slice(1)}</option>)}
                        </select>
                      </div>
                    </div>
                  )}
                  <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">This is a separate {appt1} with its own payment, even if you already have one.</p>
                </div>
              )}
              {forSomeone && <p className="text-sm font-semibold text-[#0f0f1a] pt-1">Your details (the person booking)</p>}
              <div className="grid sm:grid-cols-2 gap-4">
                {[{ label: "Full name", key: "name", type: "text", placeholder: "Jane Smith" }, { label: phoneNeeded ? "Phone number *" : "Phone number (optional)", key: "phone", type: "tel", placeholder: "+91 98765 43210" }].map(f => (
                  <div key={f.key}>
                    <label htmlFor={`booking-${f.key}`} className="text-sm font-medium text-[#0f0f1a] block mb-1.5">{f.label}</label>
                    <input id={`booking-${f.key}`} type={f.type} placeholder={f.placeholder} value={form[f.key as keyof typeof form]} onChange={e => setForm({ ...form, [f.key]: e.target.value })}
                      className="w-full rounded-xl border border-[#e8e6e0] px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:border-accent transition-all" style={{"--tw-ring-color": color + "33"} as React.CSSProperties} />
                  </div>
                ))}
              </div>
              <div>
                <label htmlFor="booking-email-address" className="text-sm font-medium text-[#0f0f1a] block mb-1.5">Email address</label>
                <input id="booking-email-address" type="email" required placeholder="jane@email.com" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })}
                  className="w-full rounded-xl border border-[#e8e6e0] px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:border-accent transition-all" />
              </div>
              <div>
                <label htmlFor="booking-notes-optional" className="text-sm font-medium text-[#0f0f1a] block mb-1.5">Notes (optional)</label>
                <textarea id="booking-notes-optional" rows={3} placeholder="Anything we should know?" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })}
                  className="w-full rounded-xl border border-[#e8e6e0] px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:border-accent transition-all" />
              </div>
            </div>
          </div>
        )}

        {/* Step: Confirm */}
        {step === "confirm" && (
          <div>
            <h2 className="font-syne font-bold text-2xl mb-2">Confirm booking</h2>
            <p className="text-[#6b6b80] mb-6">Review your {appt1} details before confirming.</p>
            <div className="rounded-2xl border border-[#e8e6e0] bg-white p-5 mb-4" data-testid="booking-summary">
              <p className="text-sm"><span className="text-[#6b6b80]">Booking for:</span> <strong>{patientLabel}</strong>
                <span className="text-[#6b6b80]"> · Booked by:</span> <strong>{form.name}</strong>
                <span className="text-[#6b6b80]"> · </span><strong style={{ color }}>{payNowMinor > 0 ? payNowLabel : formatCurrencyAmount(totalPrice, business.currency)}</strong></p>
              {forSomeone && <p className="text-xs text-[#6b6b80] mt-2">This is a separate {appt1} with its own {payNowMinor > 0 ? "payment" : "fee"} of {payNowMinor > 0 ? payNowLabel : formatCurrencyAmount(totalPrice, business.currency)}.</p>}
            </div>
            <div className="bg-white rounded-2xl border border-[#e8e6e0] p-6 mb-4">
              <div className="flex justify-between text-sm py-2.5 border-b border-[#f5f3ef]">
                <span className="text-[#6b6b80]">Business</span>
                <span className="font-medium">{business.name}</span>
              </div>

              {/* Services list */}
              <div className="py-2.5 border-b border-[#f5f3ef]">
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-[#6b6b80]">{word("service", { cap: true, plural: selectedServiceObjs.length > 1 })}</span>
                  <span className="font-medium">{selectedServiceObjs.length} selected</span>
                </div>
                <div className="space-y-1.5 mt-1">
                  {selectedServiceObjs.map(svc => (
                    <div key={svc.id} className="flex items-center justify-between text-sm bg-[#f8f7f4] rounded-lg px-3 py-2">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: svc.color }} />
                        <span className="font-medium">{svc.name}</span>
                        <span className="text-[#6b6b80] text-xs">{svc.duration} min</span>
                      </div>
                      <span className="font-semibold text-xs" style={{ color }}>{formatCurrencyAmount(svc.price, business.currency)}</span>
                    </div>
                  ))}
                </div>
              </div>

              {[
                { label: Stf1, value: tokenMode ? tokenPick?.staffName : selectedStaff === "any" ? "No preference" : staff?.name },
                { label: "Date", value: dateStr },
                ...(tokenMode
                  ? [{ label: "Session", value: tokenPick ? `${tokenPick.name} (${tokenPick.startTime} – ${tokenPick.endTime})` : "—" }, { label: "Token", value: "Number and estimated time are shown once confirmed" }]
                  : [{ label: "Time", value: selectedTime }, { label: "Total duration", value: `${totalDuration} min` }]),
                { label: forSomeone ? "Booked by" : "Name", value: form.name },
                ...(forSomeone && patientName.trim() ? [{ label: `${Svc1} for`, value: `${patientName.trim()}${relation ? ` (${PATIENT_RELATION_LABELS[relation]})` : ""}` }] : []),
                { label: "Email", value: form.email },
              ].map(row => (
                <div key={row.label} className="flex justify-between text-sm py-2.5 border-b border-[#f5f3ef] last:border-0">
                  <span className="text-[#6b6b80]">{row.label}</span>
                  <span className="font-medium">{row.value || "—"}</span>
                </div>
              ))}
              <div className="flex justify-between pt-3 mt-1 border-t border-[#f5f3ef]">
                <span className="font-bold">Total</span>
                <span className="font-bold text-lg" style={{ color }}>{formatCurrencyAmount(totalPrice, business.currency)}</span>
              </div>
              <div className="flex justify-between text-sm pt-2">
                <span className="text-[#6b6b80]">Payment</span>
                <span className={`font-semibold text-right ${payAtVenue ? "text-amber-600" : "text-green-600"}`}>{paymentLabel}</span>
              </div>
            </div>
            {payNowMinor > 0 && (
              <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm text-green-800 mb-4">
                You&apos;ll pay {payNowLabel} securely online (UPI recommended). Your {appt1} is held for {HOLD_MINUTES} minutes while you pay.
              </div>
            )}
            {payAtVenue && payNowMinor === 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-700 mb-4">
                💵 Payment will be collected at the time of your appointment.
              </div>
            )}
            <div className="bg-blue-50 rounded-xl px-4 py-3 text-sm text-blue-700 mb-4">
              📧 A confirmation will be sent to <strong>{form.email}</strong> along with a reminder 24h before.
            </div>
            {error && <p className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-3 mb-4">{error}</p>}
            {refusal && (
              <div role="alert" className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-4 mb-4 text-sm text-amber-900 space-y-3">
                {refusal.code === "PEOPLE_CAP" ? (
                  <>
                    <p className="font-semibold">That is the most people we can book for you in one day.</p>
                    <p>{refusal.message}</p>
                  </>
                ) : (
                  <>
                    <p className="font-semibold">That {appt1} is already booked.</p>
                    <p>{refusal.message.replace(/ To book for someone else, enter their name\.$/, "")}</p>
                    <p className="font-medium">Book another {appt1}:</p>
                    <div className="grid sm:grid-cols-2 gap-2">
                      <button type="button" onClick={() => { setRefusal(null); setForSomeone(false); setSelectedDate(null); setSelectedTime(null); setTokenPick(null); setStep("datetime"); }}
                        className="min-h-14 rounded-xl border border-amber-400 bg-white px-4 font-semibold">For me, on another date</button>
                      <button type="button" onClick={() => { setRefusal(null); setForSomeone(true); setPatientName(""); setStep("details"); }}
                        className="min-h-14 rounded-xl bg-[#0f0f1a] px-4 text-white font-semibold">For someone else</button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {/* Navigation */}
        <div className="flex items-center justify-between mt-8">
          {stepIndex > 0 ? (
            <button onClick={back} className="flex items-center gap-2 text-[#6b6b80] hover:text-[#0f0f1a] transition-colors text-sm font-medium">
              <ChevronLeft size={16} /> Back
            </button>
          ) : <div />}

          {step === "confirm" ? (
            <button onClick={handleConfirm} disabled={!!refusal || loading || !form.name || !form.email || !isValidEmail(form.email) || (phoneNeeded && !form.phone.trim()) || (forSomeone && !patientName.trim())}
              className="flex items-center gap-2 text-white font-semibold px-6 py-3 rounded-xl text-sm transition-colors disabled:opacity-60 disabled:cursor-not-allowed hover:opacity-90"
              style={{ background: color, color: fg }}>
              {loading ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
              {loading ? "Processing…" : payNowMinor > 0 ? `Pay ${payNowLabel} & book` : "Confirm booking"}
            </button>
          ) : (
            <button onClick={next} disabled={
              (step === "service" && selectedServices.length === 0) ||
              (step === "staff" && (provider.kind === "none" || (provider.kind === "choose" && !selectedStaff))) ||
              (step === "datetime" && (tokenMode ? !tokenPick : (!selectedDate || !selectedTime))) ||
              (step === "details" && (!form.name || !form.email || !isValidEmail(form.email) || (phoneNeeded && !form.phone.trim()) || (forSomeone && !patientName.trim())))
            }
              className="flex items-center gap-2 bg-[#0f0f1a] text-white font-semibold px-6 py-3 rounded-xl text-sm hover:bg-[#1a1a2e] transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
              Continue <ChevronRight size={16} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
