"use client";
import { useState, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { telemedicineNote } from "@/lib/online";
import { ChevronLeft, ChevronRight, Check, Clock, Loader2, MapPin, Globe, Phone, Minus, Users, ArrowLeft, Video } from "lucide-react";
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
import { CreateAccountOffer } from "@/components/booking/CreateAccountOffer";
import { PATIENT_GENDERS, PATIENT_RELATIONS, PATIENT_RELATION_LABELS, type PatientRelation } from "@/lib/patients";
import type { PayConfig } from "@/lib/onlinePayment";
import { parseBookingDeepLink } from "@/lib/deepLink";
import "@/app/[slug]/site.css";
import "@/app/[slug]/booking.css";

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

interface Service { id: string; name: string; description: string; duration: number; price: number; color: string; capacity: number; mode?: "IN_PERSON" | "ONLINE" | "BOTH"; }
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

/** `fontClasses` carries the pack fonts (see app/[slug]/fonts); without it the page falls back to system fonts. */
export function BookingClient({ business, fontClasses, homeHref = "/" }: { business: Business; fontClasses?: string; homeHref?: string }) {
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
  // A "next available" link from the website (?service=&date=&time=) opens straight on the date step with
  // those chosen. Queue (token) businesses and bad links just start at the first step.
  const [deep] = useState(() => {
    if (tokenMode) return null;
    const n = new Date();
    const today = `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
    const d = parseBookingDeepLink(searchParams, today);
    return d && d.date && services.some(s => s.id === d.serviceId) ? d : null;
  });
  const pendingTime = useRef<string | null>(deep?.time ?? null);
  const [step, setStep] = useState<Step>(deep ? "datetime" : "service");
  const [serviceSearch, setServiceSearch] = useState("");
  const [selectedServices, setSelectedServices] = useState<string[]>(() => {
    const preselect = searchParams?.get("service");
    return preselect && services.some(s => s.id === preselect) ? [preselect] : [];
  });
  const [selectedStaff, setSelectedStaff] = useState<string | null>(deep ? "any" : null);
  const [selectedDate, setSelectedDate] = useState<number | null>(deep?.date ? Number(deep.date.slice(8)) : null);
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
  // In person or online, chosen only for a service offered both ways (the first selected one decides, as on the server).
  const [bookingMode, setBookingMode] = useState<"in_person" | "online" | null>(null);
  // Online consultation result: shown to the booker on this page (and in their email), never before booking.
  const [onlineResult, setOnlineResult] = useState<{ meetingUrl: string | null } | null>(null);
  // The server did not email/WhatsApp the confirmation (a contact over its daily quota): say so, never silently.
  const [confirmationWithheld, setConfirmationWithheld] = useState(false);
  /** "created" / "verify": the booker's account waits for its emailed verify link. */
  const [accountNotice, setAccountNotice] = useState<string | null>(null);
  const [tokenDate, setTokenDate] = useState("");
  const [tokenPick, setTokenPick] = useState<TokenOption | null>(null);
  const [tokenResult, setTokenResult] = useState<{ number: number; estimatedTime: string; sessionName: string; dateLabel: string; staffName: string | null; trackUrl?: string | null } | null>(null);
  const [error, setError] = useState("");
  const isValidEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  const now = new Date();
  const [viewMonth, setViewMonth] = useState(deep?.date ? Number(deep.date.slice(5, 7)) - 1 : now.getMonth());
  const [viewYear, setViewYear] = useState(deep?.date ? Number(deep.date.slice(0, 4)) : now.getFullYear());

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
    setBookingMode(null);
  }

  // Derived totals from selected services
  const selectedServiceObjs = business.services.filter(s => selectedServices.includes(s.id));
  const firstSvc = business.services.find(s => s.id === selectedServices[0]);
  const offeredMode = firstSvc?.mode ?? "IN_PERSON";
  const needsModeChoice = offeredMode === "BOTH";
  const isOnline = offeredMode === "ONLINE" || (needsModeChoice && bookingMode === "online");
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
        // Apply the time from a deep link once, if that slot is still free.
        const wanted = pendingTime.current;
        pendingTime.current = null;
        if (wanted && (data.slots ?? []).includes(wanted)) setSelectedTime(wanted);
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
          ...(needsModeChoice && bookingMode ? { mode: bookingMode } : {}),
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
      const kept = { date: bookingDateIso, patient: patientLabel, label: data.token ? `Queue no. #${data.token.number}` : `${selectedTime}`, tokenSessionId: tokenMode ? tokenPick?.id : undefined, serviceIds: selectedServices, staffId: selectedStaff && selectedStaff !== "any" ? selectedStaff : null };
      if (data.checkout) {
        addMyBooking(business.slug, { ...kept, orderId: data.checkout.orderId, confirmed: false });
        await launchCheckout(data.checkout);
        return;
      }
      addMyBooking(business.slug, { ...kept, confirmed: true });
      if (data.url) { window.location.href = data.url; } else { if (data.token) setTokenResult(data.token); if (data.isOnline) setOnlineResult({ meetingUrl: data.meetingUrl ?? null }); setConfirmationWithheld(!!data.confirmationWithheld); setAccountNotice(typeof data.account === "string" ? data.account : null); setBooked(true); }
    } catch (e) { setError(e instanceof Error && e.message.startsWith("Could not load") ? e.message : "Network error. Please try again."); }
    finally { setLoading(false); }
  }

  const markRadius = business.packId === "SALON_SPA" || business.packId === "CONSULTANT" ? "rounded-full" : "rounded-[10px]";
  const rootCls = `st bk ${fontClasses ?? ""}`;
  const rootStyle = themeVars(color) as React.CSSProperties;
  const hasSocial = Object.keys(social).length > 0;
  const filteredServices = services.filter(svc => !serviceSearch || svc.name.toLowerCase().includes(serviceSearch.toLowerCase()) || svc.description.toLowerCase().includes(serviceSearch.toLowerCase()));
  const providerName = tokenMode ? tokenPick?.staffName : selectedStaff === "any" ? "No preference" : staff?.name;
  const whenLabel = tokenMode
    ? (tokenPick ? `${dateStr}, ${tokenPick.name}` : "")
    : (selectedDate && selectedTime ? `${dateStr}, ${selectedTime}` : "");

  const top = (
    <header className="bk-top">
      <div className="st-wrap">
        <span className="st-brand">
          <BrandMark name={business.name} logoUrl={business.logoUrl} color={color} fg={fg} size={40} rounded={markRadius} />
          <span className="min-w-0"><b>{business.name}</b><small>{typeLabel}</small></span>
        </span>
        <a href={homeHref} className="bk-back" aria-label="Back to website"><ArrowLeft size={16} aria-hidden /><span className="bk-back-text">Back to website</span></a>
      </div>
    </header>
  );

  if (booked) {
    return (
      <div className={rootCls} data-pack={business.packId} style={rootStyle}>
        {top}
        <main className="bk-done">
          <div className="bk-ok"><Check size={32} aria-hidden /></div>
          <h1>You&apos;re booked</h1>
          {confirmationWithheld ? (
            <p className="bk-note warn" style={{ marginTop: 14, textAlign: "left" }}>
              Your {appt1} is booked, but we could not send a confirmation message because of the number of bookings made with these contact details today. Please keep the details below, or contact {business.name} if you need a copy.
            </p>
          ) : (
            <p className="st-muted" style={{ marginTop: 10 }}>A confirmation has been sent to <strong>{form.email}</strong>.</p>
          )}
          {accountNotice && (
            <p className="bk-note" role="status" style={{ marginTop: 14, textAlign: "left" }}>
              Verify your email to create your account and track your {word("appointment", { plural: true })} and payments. We sent a link to set your password to <strong>{form.email}</strong>. Your booking is confirmed either way.
            </p>
          )}
          {tokenResult && (
            <div style={{ marginTop: 24 }}>
              <p className="st-muted">Your number in the queue</p>
              <div className="bk-token">#{tokenResult.number}</div>
              <p style={{ marginTop: 10, fontWeight: 600 }}>Estimated time: {tokenResult.estimatedTime}</p>
            </div>
          )}
          <div className="bk-ticket">
            <div className="bk-ticket-top">
              <b>{serviceNamesLabel}</b>
              <div className="st-muted" style={{ fontSize: "0.9375rem" }}>for {patientLabel}</div>
            </div>
            <div className="bk-ticket-body">
              <div className="bk-row"><span>Business</span><span>{business.name}</span></div>
              <div className="bk-row"><span>Date</span><span>{dateStr}</span></div>
              {tokenResult ? (
                <>
                  <div className="bk-row"><span>Session</span><span>{tokenResult.sessionName}</span></div>
                  {tokenResult.staffName && <div className="bk-row"><span>{Stf1}</span><span>{tokenResult.staffName}</span></div>}
                </>
              ) : (
                <>
                  <div className="bk-row"><span>Time</span><span>{selectedTime}</span></div>
                  <div className="bk-row"><span>Duration</span><span>{totalDuration} min</span></div>
                </>
              )}
              <div className="bk-row"><span>Total</span><span>{formatCurrencyAmount(totalPrice, business.currency)}</span></div>
              <div className="bk-row"><span>Payment</span><span>{payAtVenue ? `Pay at ${appt1}` : "Paid online"}</span></div>
            </div>
          </div>
          {onlineResult && (
            <div className="bk-card" style={{ textAlign: "left", marginBottom: 20 }}>
              <p style={{ fontWeight: 700, marginBottom: 4 }}><Video size={15} aria-hidden style={{ display: "inline", marginRight: 6 }} />Online consultation</p>
              {onlineResult.meetingUrl ? (
                <>
                  <p className="st-muted" style={{ fontSize: "0.9375rem", marginBottom: 14 }}>Join from this link at your {appt1} time. We have also emailed it to you.</p>
                  <a href={onlineResult.meetingUrl} target="_blank" rel="noopener noreferrer" className="st-btn st-btn-primary st-btn-block">Join link</a>
                </>
              ) : (
                <p className="st-muted" style={{ fontSize: "0.9375rem" }}>{business.name} will send you the joining link before your {appt1}.</p>
              )}
            </div>
          )}
          {tokenResult?.trackUrl && (
            <a href={tokenResult.trackUrl} className="st-btn st-btn-primary st-btn-block" style={{ marginBottom: 20 }}>Track your place in line</a>
          )}
          <AnotherBooking slug={business.slug} bookPath={typeof window !== "undefined" ? window.location.pathname : `/${business.slug}/book-now`}
            serviceIds={selectedServices} staffId={selectedStaff && selectedStaff !== "any" ? selectedStaff : null} date={bookingDateIso} appointmentWord={appt1} />
          <CreateAccountOffer email={form.email} />
          {(reviewUrl || hasSocial) && (
            <div className="bk-card" style={{ textAlign: "left", marginTop: 8 }}>
              {reviewUrl && (
                <>
                  <p style={{ fontWeight: 700, marginBottom: 4 }}>Enjoyed booking with us?</p>
                  <p className="st-muted" style={{ fontSize: "0.9375rem", marginBottom: 14 }}>A quick Google review helps others find us.</p>
                  <ReviewButton href={reviewUrl} color={color} fg={fg} />
                </>
              )}
              {hasSocial && <SocialIcons links={social} tone="dark" className={reviewUrl ? "mt-4" : ""} />}
            </div>
          )}
        </main>
      </div>
    );
  }

  const continueDisabled =
    (step === "service" && (selectedServices.length === 0 || (needsModeChoice && !bookingMode))) ||
    (step === "staff" && (provider.kind === "none" || (provider.kind === "choose" && !selectedStaff))) ||
    (step === "datetime" && (tokenMode ? !tokenPick : (!selectedDate || !selectedTime))) ||
    (step === "details" && (!form.name || !form.email || !isValidEmail(form.email) || (phoneNeeded && !form.phone.trim()) || (forSomeone && !patientName.trim())));
  const confirmDisabled = !!refusal || loading || !form.name || !form.email || !isValidEmail(form.email) || (phoneNeeded && !form.phone.trim()) || (forSomeone && !patientName.trim());

  return (
    <div className={rootCls} data-pack={business.packId} style={rootStyle}>
      {top}

      {/* Progress */}
      <div className="bk-progress">
        <div className="st-wrap">
          <div className="bk-progress-row"><span>Step {stepIndex + 1} of {STEPS.length}</span><b>{STEP_LABELS[stepIndex]}</b></div>
          <div className="bk-bar" role="progressbar" aria-label="Booking progress" aria-valuemin={1} aria-valuemax={STEPS.length} aria-valuenow={stepIndex + 1}>
            <i style={{ width: `${((stepIndex + 1) / STEPS.length) * 100}%` }} />
          </div>
        </div>
      </div>

      <div className="st-wrap bk-layout">
        <main className="bk-main">

          {/* Step: Service */}
          {step === "service" && (
            <section className="bk-step">
              <h2>Choose {svcN}</h2>
              <p className="bk-sub">Select one or more {svcN} you&apos;d like to book.</p>
              {services.length > 4 && (
                <input
                  type="text"
                  aria-label={`Search ${svcN}`}
                  placeholder={`Search ${svcN}...`}
                  value={serviceSearch}
                  onChange={e => setServiceSearch(e.target.value)}
                  className="bk-input bk-search"
                />
              )}
              <div role="group" aria-label={Svc1}>
                {filteredServices.map(svc => {
                  const isSelected = selectedServices.includes(svc.id);
                  return (
                    <button key={svc.id} type="button" role="checkbox" aria-checked={isSelected} onClick={() => toggleService(svc.id)}
                      className={cn("bk-opt", isSelected && "sel")}>
                      <span className="bk-tick" aria-hidden><Check size={14} strokeWidth={3} /></span>
                      <span className="bk-opt-title">
                        {svc.name}
                        {svc.capacity > 1 && <span className="st-tag"><Users size={11} aria-hidden /> Group · {svc.capacity} spots</span>}
                        {svc.mode && svc.mode !== "IN_PERSON" && <span className="st-tag"><Video size={11} aria-hidden /> {svc.mode === "ONLINE" ? "Online" : "Online or in person"}</span>}
                      </span>
                      <span className="bk-opt-right">{formatCurrencyAmount(svc.price, business.currency)}</span>
                      <span className="bk-opt-sub">
                        {svc.description && <span>{svc.description}</span>}
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><Clock aria-hidden /> {svc.duration} min</span>
                      </span>
                    </button>
                  );
                })}
                {filteredServices.length === 0 && <p className="bk-center">No {svcN} match your search.</p>}
              </div>

              {/* In person or online, for a service offered both ways */}
              {needsModeChoice && (
                <div role="radiogroup" aria-label="How would you like to attend?" className="bk-card" style={{ marginTop: 16 }}>
                  <p style={{ fontWeight: 700, marginBottom: 10 }}>How would you like to attend?</p>
                  {([["in_person", "In person", MapPin], ["online", "Online (video call)", Video]] as const).map(([value, label, Icon]) => (
                    <button key={value} type="button" role="radio" aria-checked={bookingMode === value} onClick={() => setBookingMode(value)}
                      className={cn("bk-opt", bookingMode === value && "sel")}>
                      <span className="bk-tick" aria-hidden><Check size={14} strokeWidth={3} /></span>
                      <span className="bk-opt-title"><Icon size={14} aria-hidden style={{ marginRight: 6 }} />{label}</span>
                    </button>
                  ))}
                </div>
              )}

              {/* Selection summary bar */}
              {selectedServices.length > 0 && (
                <div className="bk-selbar">
                  <span>
                    <strong>{selectedServices.length} {word("service", { plural: selectedServices.length > 1 })} selected</strong>
                    <span className="st-muted"> · {totalDuration} min · {formatCurrencyAmount(totalPrice, business.currency)}</span>
                  </span>
                  {selectedServices.length > 1 && (
                    <button type="button" onClick={() => { setSelectedServices([]); resetAfterServices(); }}>
                      <Minus size={11} aria-hidden /> Clear
                    </button>
                  )}
                </div>
              )}
            </section>
          )}

          {/* Step: Staff */}
          {step === "staff" && (
            <section className="bk-step">
              <h2>Choose your {stf1}</h2>
              <p className="bk-sub">Select who you&apos;d like your {appt1} with.</p>
              {provider.kind === "none" && (
                <div className="bk-card" style={{ textAlign: "center" }} role="alert">
                  <p style={{ fontWeight: 700, marginBottom: 4 }}>No single {stf1} offers all of these together.</p>
                  <p className="st-muted" style={{ fontSize: "0.9375rem", marginBottom: 16 }}>Please book them separately.</p>
                  <button type="button" onClick={() => setStep("service")} className="st-btn st-btn-ghost st-btn-sm">
                    <ChevronLeft size={16} aria-hidden /> Back to {svcN}
                  </button>
                </div>
              )}
              {provider.kind === "shared" && (
                <p className="st-muted">No {stf1} choice is needed. Continue to pick a time.</p>
              )}
              {provider.kind === "choose" && (
                <div role="radiogroup" aria-label={Stf1}>
                  {[
                    { id: "any", name: "No preference", role: `We'll assign the best available ${stf1}`, color: "#6b6b80" },
                    ...provider.staff,
                  ].map(member => (
                    <button key={member.id} type="button" role="radio" aria-checked={selectedStaff === member.id} onClick={() => setSelectedStaff(member.id)}
                      className={cn("bk-opt", selectedStaff === member.id && "sel")}>
                      <span className="bk-avatar" aria-hidden>{member.id === "any" ? "?" : initialsOf(member.name)}</span>
                      <span className="bk-opt-title">{member.name}</span>
                      <span className="bk-tick round" aria-hidden><Check size={14} strokeWidth={3} /></span>
                      <span className="bk-opt-sub">{member.role}</span>
                    </button>
                  ))}
                </div>
              )}
            </section>
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
            <section className="bk-step">
              <h2>Pick a date &amp; time</h2>
              <p className="bk-sub">Slots shown for your total booking duration ({totalDuration} min).</p>
              <div className="bk-card">
                <div className="bk-cal-head">
                  <button type="button" onClick={prevMonth} className="bk-cal-nav" aria-label="Previous month"><ChevronLeft size={18} /></button>
                  <span>{MONTHS[viewMonth]} {viewYear}</span>
                  <button type="button" onClick={nextMonth} className="bk-cal-nav" aria-label="Next month"><ChevronRight size={18} /></button>
                </div>
                <div className="bk-cal-grid" style={{ marginBottom: 4 }}>
                  {DAYS_SHORT.map(d => <div key={d} className="bk-dow">{d}</div>)}
                </div>
                <div className="bk-cal-grid" aria-busy={monthLoading}>
                  {calCells.map((day, i) => {
                    const past = day ? isPastDay(day) : false;
                    const heldLabel = day ? heldDates[`${monthKey}-${String(day).padStart(2, "0")}`] : undefined;
                    const held = !!heldLabel;
                    const full = !!day && !past && !held && !dayHasSlots(day);
                    const isSelected = day === selectedDate;
                    return (
                      <button key={i} type="button" disabled={!day || past || full || held} onClick={() => day && setSelectedDate(day)}
                        title={held ? `You already have ${heldLabel} on this day` : undefined}
                        aria-label={day && full ? `${MONTHS[viewMonth]} ${day}, no availability` : held ? `${MONTHS[viewMonth]} ${day}, you already have ${heldLabel} on this day` : undefined}
                        aria-pressed={day ? isSelected : undefined}
                        className={cn("bk-day", !day && "blank", full && "full", held && "held", isSelected && "sel")}>
                        {day}
                      </button>
                    );
                  })}
                </div>
              </div>
              {Object.keys(heldDates).some(d => d.startsWith(monthKey)) && (
                <p className="bk-note warn">
                  Highlighted days are ones where you already have a {appt1} ({Object.entries(heldDates).filter(([d]) => d.startsWith(monthKey)).map(([d, l]) => `${Number(d.slice(8))}: ${l}`).join(", ")}). Booking for someone else? Choose &quot;Someone else&quot; on the next step.
                </p>
              )}
              {monthHasNone && !monthLoading && (
                <div className="bk-card" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                  <span className="st-muted" style={{ fontSize: "0.9375rem" }}>
                    {nextAvailable
                      ? <>No availability in {MONTHS[viewMonth]}. <strong style={{ color: "var(--ink)" }}>Next available: {formatNextAvailable(nextAvailable)}</strong></>
                      : <>No availability in {MONTHS[viewMonth]} or the following months.</>}
                  </span>
                  {nextAvailable && (
                    <button type="button" onClick={() => jumpTo(nextAvailable)} className="st-btn st-btn-primary st-btn-sm">Go to date</button>
                  )}
                </div>
              )}
              {selectedDate && (
                <div className="bk-card">
                  <p className="bk-times-title">Available times — {MONTHS[viewMonth]} {selectedDate}</p>
                  {slotsLoading ? (
                    <div className="bk-center"><Loader2 size={20} className="animate-spin" style={{ display: "inline" }} aria-label="Loading times" /></div>
                  ) : availableSlots.length === 0 && bookedSlots.length === 0 ? (
                    <p className="bk-center">No availability on this day. Please pick another date.</p>
                  ) : (
                    <div className="bk-slots">
                      {[...availableSlots, ...bookedSlots].sort().map(slot => {
                        const isAvailable = availableSlots.includes(slot);
                        const isSelected = slot === selectedTime;
                        const spotsLeft = isGroupService ? (spotsMap[slot] ?? 0) : null;
                        return (
                          <button key={slot} type="button" disabled={!isAvailable} aria-pressed={isSelected} onClick={() => isAvailable && setSelectedTime(slot)}
                            className={cn("bk-slot", isSelected && "sel")}>
                            {slot}
                            {isGroupService && isAvailable && spotsLeft !== null && <small>{spotsLeft} left</small>}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </section>
          )}

          {/* Step: Details */}
          {step === "details" && (
            <section className="bk-step">
              <h2>{forSomeone ? "Who is this for, and who is booking?" : "Your details"}</h2>
              <p className="bk-sub">We&apos;ll send the confirmation and reminders to the person booking.</p>
              <div className="bk-form">
                <fieldset>
                  <legend>Who is this {appt1} for?</legend>
                  <div className="bk-pair" role="radiogroup" aria-label={`Who is this ${appt1} for?`}>
                    {[{ v: false, label: "Myself" }, { v: true, label: "Someone else" }].map(o => (
                      <button key={o.label} type="button" role="radio" aria-checked={forSomeone === o.v} onClick={() => setForSomeone(o.v)}
                        className={cn("bk-opt", forSomeone === o.v && "sel")}>
                        <span className="bk-tick round" aria-hidden><Check size={14} strokeWidth={3} /></span>
                        <span className="bk-opt-title">{o.label}</span>
                      </button>
                    ))}
                  </div>
                </fieldset>
                {forSomeone && (
                  <div className="bk-inset">
                    <div className="bk-field">
                      <label htmlFor="booking-patient-name">Patient&apos;s full name *</label>
                      <input id="booking-patient-name" className="bk-input" value={patientName} maxLength={120} onChange={e => setPatientName(e.target.value)} placeholder="Who is this for?" />
                    </div>
                    <div className="bk-field">
                      <label htmlFor="booking-relation">Relation to you (optional)</label>
                      <select id="booking-relation" className="bk-input" value={relation} onChange={e => setRelation(e.target.value as PatientRelation | "")}>
                        <option value="">Choose…</option>
                        {PATIENT_RELATIONS.map(r => <option key={r} value={r}>{PATIENT_RELATION_LABELS[r]}</option>)}
                      </select>
                    </div>
                    {business.packId === "CLINIC" && (
                      <div className="bk-cols">
                        <div className="bk-field">
                          <label htmlFor="booking-age">Age (optional)</label>
                          <input id="booking-age" className="bk-input" type="number" inputMode="numeric" min={0} max={120} value={patientAge} onChange={e => setPatientAge(e.target.value)} />
                        </div>
                        <div className="bk-field">
                          <label htmlFor="booking-gender">Gender (optional)</label>
                          <select id="booking-gender" className="bk-input" value={patientGender} onChange={e => setPatientGender(e.target.value)}>
                            <option value="">Choose…</option>
                            {PATIENT_GENDERS.map(g => <option key={g} value={g}>{g[0].toUpperCase() + g.slice(1)}</option>)}
                          </select>
                        </div>
                      </div>
                    )}
                    <p className="bk-note warn" style={{ margin: 0 }}>This is a separate {appt1} with its own payment, even if you already have one.</p>
                  </div>
                )}
                {forSomeone && <p className="bk-subhead">Your details (the person booking)</p>}
                <div className="bk-cols">
                  {[{ label: "Full name", key: "name", type: "text", placeholder: "Jane Smith" }, { label: phoneNeeded ? "Phone number *" : "Phone number (optional)", key: "phone", type: "tel", placeholder: "+91 98765 43210" }].map(f => (
                    <div key={f.key} className="bk-field">
                      <label htmlFor={`booking-${f.key}`}>{f.label}</label>
                      <input id={`booking-${f.key}`} className="bk-input" type={f.type} placeholder={f.placeholder} value={form[f.key as keyof typeof form]} onChange={e => setForm({ ...form, [f.key]: e.target.value })} />
                    </div>
                  ))}
                </div>
                <div className="bk-field">
                  <label htmlFor="booking-email-address">Email address</label>
                  <input id="booking-email-address" className="bk-input" type="email" required placeholder="jane@email.com" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
                </div>
                <div className="bk-field">
                  <label htmlFor="booking-notes-optional">Notes (optional)</label>
                  <textarea id="booking-notes-optional" className="bk-input" rows={3} placeholder="Anything we should know?" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
                </div>
              </div>
            </section>
          )}

          {/* Step: Confirm */}
          {step === "confirm" && (
            <section className="bk-step">
              <h2>Confirm booking</h2>
              <p className="bk-sub">Review your {appt1} details before confirming.</p>
              <div className="bk-card" data-testid="booking-summary">
                <p><span className="st-muted">Booking for:</span> <strong>{patientLabel}</strong>
                  <span className="st-muted"> · Booked by:</span> <strong>{form.name}</strong>
                  <span className="st-muted"> · </span><strong style={{ color: "var(--brand-ink)" }}>{payNowMinor > 0 ? payNowLabel : formatCurrencyAmount(totalPrice, business.currency)}</strong></p>
                {forSomeone && <p className="st-muted" style={{ fontSize: "0.8125rem", marginTop: 8 }}>This is a separate {appt1} with its own {payNowMinor > 0 ? "payment" : "fee"} of {payNowMinor > 0 ? payNowLabel : formatCurrencyAmount(totalPrice, business.currency)}.</p>}
              </div>
              <div className="bk-rows">
                <div className="bk-row"><span>Business</span><span>{business.name}</span></div>
                <div className="bk-lines">
                  <div className="bk-row" style={{ padding: 0, border: 0 }}>
                    <span>{word("service", { cap: true, plural: selectedServiceObjs.length > 1 })}</span>
                    <span>{selectedServiceObjs.length} selected</span>
                  </div>
                  {selectedServiceObjs.map(svc => (
                    <div key={svc.id} className="bk-line">
                      <span><strong>{svc.name}</strong><small>{svc.duration} min</small></span>
                      <strong>{formatCurrencyAmount(svc.price, business.currency)}</strong>
                    </div>
                  ))}
                </div>
                {[
                  { label: Stf1, value: providerName },
                  ...(isOnline ? [{ label: "Format", value: "Online consultation (you get the link once booked)" }] : []),
                  { label: "Date", value: dateStr },
                  ...(tokenMode
                    ? [{ label: "Session", value: tokenPick ? `${tokenPick.name} (${tokenPick.startTime} – ${tokenPick.endTime})` : "—" }, { label: "Queue number", value: "Shown once confirmed, with your estimated time" }]
                    : [{ label: "Time", value: selectedTime }, { label: "Total duration", value: `${totalDuration} min` }]),
                  { label: forSomeone ? "Booked by" : "Name", value: form.name },
                  ...(forSomeone && patientName.trim() ? [{ label: `${Svc1} for`, value: `${patientName.trim()}${relation ? ` (${PATIENT_RELATION_LABELS[relation]})` : ""}` }] : []),
                  { label: "Email", value: form.email },
                ].map(row => (
                  <div key={row.label} className="bk-row">
                    <span>{row.label}</span>
                    <span>{row.value || "—"}</span>
                  </div>
                ))}
                <div className="bk-total"><span>Total</span><span>{formatCurrencyAmount(totalPrice, business.currency)}</span></div>
                <div className="bk-row" style={{ borderBottom: 0, paddingBottom: 14 }}>
                  <span>Payment</span>
                  <span style={{ color: payAtVenue ? "#92400e" : "#166534" }}>{paymentLabel}</span>
                </div>
              </div>
              {payNowMinor > 0 && (
                <p className="bk-note ok">You&apos;ll pay {payNowLabel} securely online (UPI recommended). Your {appt1} is held for {HOLD_MINUTES} minutes while you pay.</p>
              )}
              {payAtVenue && payNowMinor === 0 && (
                <p className="bk-note warn">Payment will be collected at the time of your appointment.</p>
              )}
              <p className="bk-note">A confirmation will be sent to <strong>{form.email}</strong> along with a reminder 24h before.</p>
              {isOnline && telemedicineNote(business.packId) && <p className="bk-note warn">{telemedicineNote(business.packId)}</p>}
              {error && <p className="bk-note err" role="alert">{error}</p>}
              {refusal && (
                <div role="alert" className="bk-alert">
                  {refusal.code === "PEOPLE_CAP" ? (
                    <>
                      <p style={{ fontWeight: 700 }}>That is the most people we can book for you in one day.</p>
                      <p>{refusal.message}</p>
                    </>
                  ) : (
                    <>
                      <p style={{ fontWeight: 700 }}>That {appt1} is already booked.</p>
                      <p>{refusal.message.replace(/ To book for someone else, enter their name\.$/, "")}</p>
                      <p style={{ fontWeight: 600 }}>Book another {appt1}:</p>
                      <div className="bk-cols">
                        <button type="button" onClick={() => { setRefusal(null); setForSomeone(false); setSelectedDate(null); setSelectedTime(null); setTokenPick(null); setStep("datetime"); }}
                          style={{ border: "1px solid #f59e0b", background: "#fff" }}>For me, on another date</button>
                        <button type="button" onClick={() => { setRefusal(null); setForSomeone(true); setPatientName(""); setStep("details"); }}
                          style={{ border: 0, background: "#16181d", color: "#fff" }}>For someone else</button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </section>
          )}

          {/* Navigation */}
          <nav className="bk-nav" aria-label="Booking steps">
            {stepIndex > 0 ? (
              <button type="button" onClick={back} className="bk-link"><ChevronLeft size={16} aria-hidden /> Back</button>
            ) : <span className="bk-spacer" />}
            {selectedServiceObjs.length > 0 && (
              <span className="bk-nav-total"><b>{formatCurrencyAmount(totalPrice, business.currency)}</b>{totalDuration} min</span>
            )}
            {step === "confirm" ? (
              <button type="button" onClick={handleConfirm} disabled={confirmDisabled} className="st-btn st-btn-primary">
                {loading ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <Check size={16} aria-hidden />}
                {loading ? "Processing…" : payNowMinor > 0 ? `Pay ${payNowLabel} & book` : "Confirm booking"}
              </button>
            ) : (
              <button type="button" onClick={next} disabled={continueDisabled} className="st-btn st-btn-primary">
                Continue <ChevronRight size={16} aria-hidden />
              </button>
            )}
          </nav>
        </main>

        <aside className="bk-side">
          {selectedServiceObjs.length > 0 && (
            <div className="bk-summary" aria-label="Booking summary">
              <h3>Your booking</h3>
              <ul>
                {selectedServiceObjs.map(svc => (
                  <li key={svc.id}><span>{svc.name}</span><strong>{formatCurrencyAmount(svc.price, business.currency)}</strong></li>
                ))}
              </ul>
              <dl>
                <dt>Duration</dt><dd>{totalDuration} min</dd>
                {providerName && <><dt>{Stf1}</dt><dd>{providerName}</dd></>}
                {whenLabel && <><dt>When</dt><dd>{whenLabel}</dd></>}
              </dl>
              <div className="bk-total"><span>Total</span><span>{formatCurrencyAmount(totalPrice, business.currency)}</span></div>
            </div>
          )}
          <div className="bk-biz">
            <b>{business.name}</b>
            {business.description && <p>{business.description}</p>}
            {business.address && <span className="line"><MapPin aria-hidden />{business.address}</span>}
            {business.phone && <a href={`tel:${business.phone}`}><Phone aria-hidden />{business.phone}</a>}
            {business.website && /^https?:\/\//i.test(business.website) && <a href={business.website} target="_blank" rel="noreferrer"><Globe aria-hidden />{business.website.replace(/^https?:\/\//, "")}</a>}
            {hasSocial && <SocialIcons links={social} tone="dark" />}
          </div>
        </aside>
      </div>
    </div>
  );
}
