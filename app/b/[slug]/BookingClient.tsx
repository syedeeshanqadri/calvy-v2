"use client";
import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, Check, Clock, Loader2, MapPin, Globe, Phone, Plus, Minus, Users, ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCurrencyAmount } from "@/lib/currency";
import { bookableServices, providerOptions } from "@/lib/staffMatch";
import { safeThemeColor, readableForeground, themeVars } from "@/lib/theme";

type Step = "service" | "staff" | "datetime" | "details" | "confirm";
const STEPS: Step[] = ["service", "staff", "datetime", "details", "confirm"];
const STEP_LABELS = ["Service", "Staff", "Date & Time", "Your Details", "Confirm"];
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DAYS_SHORT = ["Su","Mo","Tu","We","Th","Fr","Sa"];

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
  services: Service[]; staff: StaffMember[];
}

export function BookingClient({ business }: { business: Business }) {
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
  const [loading, setLoading] = useState(false);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [availableSlots, setAvailableSlots] = useState<string[]>([]);
  const [bookedSlots, setBookedSlots] = useState<string[]>([]);
  const [spotsMap, setSpotsMap] = useState<Record<string, number>>({});
  const [isGroupService, setIsGroupService] = useState(false);
  // Month availability, tagged with the request it answers so stale answers are ignored.
  const [monthData, setMonthData] = useState<{ key: string; days: Record<string, boolean> | null; next: string | null } | null>(null);
  const [booked, setBooked] = useState(false);
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
    if (step !== "datetime" || selectedServices.length === 0 || totalDuration === 0) return;
    let cancelled = false;
    fetch(`/api/availability/month?slug=${business.slug}&month=${monthKey}&duration=${totalDuration}&serviceIds=${selectedServices.join(",")}${staffParam}`)
      .then(r => (r.ok ? r.json() : null))
      .then(data => { if (!cancelled) setMonthData({ key: monthRequest, days: data?.days ?? null, next: data?.nextAvailable ?? null }); })
      .catch(() => { if (!cancelled) setMonthData({ key: monthRequest, days: null, next: null }); });
    return () => { cancelled = true; };
  }, [step, selectedServices, staffParam, monthKey, monthRequest, totalDuration, business.slug]);

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

  const initials = business.name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
  const typeLabel = BUSINESS_TYPE_LABELS[business.businessType] ?? "Service Business";

  function next() { if (stepIndex < STEPS.length - 1) setStep(STEPS[stepIndex + 1]); }
  function back() { if (stepIndex > 0) setStep(STEPS[stepIndex - 1]); }

  const dateStr = selectedDate ? `${MONTHS[viewMonth]} ${selectedDate}, ${viewYear}` : "—";
  const serviceNamesLabel = selectedServiceObjs.map(s => s.name).join(" & ") || "—";

  async function handleConfirm() {
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessSlug: business.slug,
          serviceIds: selectedServices,
          staffId: selectedStaff === "any" ? null : selectedStaff,
          date: `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(selectedDate).padStart(2, "0")}`,
          time: selectedTime,
          clientName: form.name,
          clientEmail: form.email,
          clientPhone: form.phone || null,
          notes: form.notes || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Something went wrong."); return; }
      if (data.url) { window.location.href = data.url; } else { setBooked(true); }
    } catch { setError("Network error. Please try again."); }
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
          <p className="text-[#6b6b80] mb-6">A confirmation has been sent to <strong>{form.email}</strong>.</p>
          <div className="bg-[#f8f7f4] rounded-2xl p-5 text-left mb-6 space-y-2.5">
            <div className="flex justify-between text-sm"><span className="text-[#6b6b80]">Business</span><span className="font-medium">{business.name}</span></div>
            <div className="flex justify-between text-sm">
              <span className="text-[#6b6b80]">Service{selectedServiceObjs.length > 1 ? "s" : ""}</span>
              <span className="font-medium text-right max-w-[60%]">{serviceNamesLabel}</span>
            </div>
            <div className="flex justify-between text-sm"><span className="text-[#6b6b80]">Date</span><span className="font-medium">{dateStr}</span></div>
            <div className="flex justify-between text-sm"><span className="text-[#6b6b80]">Time</span><span className="font-medium">{selectedTime}</span></div>
            <div className="flex justify-between text-sm"><span className="text-[#6b6b80]">Duration</span><span className="font-medium">{totalDuration} min</span></div>
            <div className="flex justify-between text-sm border-t border-[#f0ede8] pt-2 mt-2">
              <span className="font-semibold">Total</span>
              <span className="font-bold" style={{ color }}>{formatCurrencyAmount(totalPrice, business.currency)}</span>
            </div>
            <div className="flex justify-between text-sm pt-1">
              <span className="text-[#6b6b80]">Payment</span>
              <span className="font-medium">{business.paymentMode === "postpaid" ? "Pay at appointment" : "Paid online"}</span>
            </div>
          </div>
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
          <div style={{ background: fg + "26" }} className="w-16 h-16 rounded-2xl flex items-center justify-center font-syne font-bold text-2xl mx-auto mb-4">
            {initials}
          </div>
          <h1 className="font-syne font-bold text-2xl mb-1">{business.name}</h1>
          <p className="opacity-80 text-sm mb-2">{typeLabel}</p>
          {business.description && <p className="opacity-70 text-sm max-w-md mx-auto">{business.description}</p>}
          <div className="flex items-center justify-center gap-4 mt-3 flex-wrap">
            {business.address && <span className="flex items-center gap-1 opacity-70 text-xs"><MapPin size={11} />{business.address}</span>}
            {business.phone && <span className="flex items-center gap-1 opacity-70 text-xs"><Phone size={11} />{business.phone}</span>}
            {business.website && <a href={business.website} target="_blank" rel="noreferrer" className="flex items-center gap-1 opacity-70 text-xs hover:opacity-100 transition-colors"><Globe size={11} />{business.website.replace(/^https?:\/\//, "")}</a>}
          </div>
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
            <h2 className="font-syne font-bold text-2xl mb-1">Choose services</h2>
            <p className="text-[#6b6b80] mb-4 text-sm">Select one or more services you&apos;d like to book.</p>
            {services.length > 4 && (
              <div className="relative mb-4">
                <input
                  type="text"
                  aria-label="Search services"
                  placeholder="Search services..."
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
                <p className="text-sm text-[#6b6b80] text-center py-6">No services match your search.</p>
              )}
            </div>

            {/* Selection summary bar */}
            {selectedServices.length > 0 && (
              <div className="mt-5 bg-white border border-[#e8e6e0] rounded-2xl p-4 flex items-center justify-between gap-4">
                <div className="text-sm">
                  <span className="font-semibold">{selectedServices.length} service{selectedServices.length > 1 ? "s" : ""} selected</span>
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
            <h2 className="font-syne font-bold text-2xl mb-2">Choose your provider</h2>
            <p className="text-[#6b6b80] mb-6">Select who you&apos;d like your appointment with.</p>
            {provider.kind === "none" && (
              <div className="bg-white rounded-2xl border border-[#e8e6e0] p-6 text-center" role="alert">
                <p className="font-semibold mb-1">No single stylist offers all of these together.</p>
                <p className="text-sm text-[#6b6b80] mb-4">Please book them separately.</p>
                <button onClick={() => setStep("service")}
                  className="inline-flex items-center gap-2 text-sm font-semibold px-5 py-2.5 rounded-xl border border-[#e8e6e0] hover:bg-[#f8f7f4] transition-colors">
                  <ChevronLeft size={16} /> Back to services
                </button>
              </div>
            )}
            {provider.kind === "shared" && (
              <p className="text-sm text-[#6b6b80]">No provider choice is needed. Continue to pick a time.</p>
            )}
            {provider.kind === "choose" && [
              { id: "any", name: "No preference", role: "We'll assign the best available provider", color: "#6b6b80" },
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
        {step === "datetime" && (
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
                  const full = !!day && !past && !dayHasSlots(day);
                  const isSelected = day === selectedDate;
                  return (
                    <button key={i} disabled={!day || past || full} onClick={() => day && setSelectedDate(day)}
                      aria-label={day && full ? `${MONTHS[viewMonth]} ${day}, no availability` : undefined}
                      className={cn("aspect-square rounded-xl text-sm transition-all font-medium",
                        !day && "invisible",
                        past && "text-[#d0cec8] cursor-not-allowed",
                        full && "text-[#d0cec8] cursor-not-allowed line-through",
                        !past && !full && day && !isSelected && "hover:bg-[#f8f7f4] cursor-pointer",
                        isSelected && "text-white")}
                      style={isSelected ? { background: color, color: fg } : {}}>
                      {day}
                    </button>
                  );
                })}
              </div>
            </div>
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
            <h2 className="font-syne font-bold text-2xl mb-2">Your details</h2>
            <p className="text-[#6b6b80] mb-6">We&apos;ll send your confirmation and reminders here.</p>
            <div className="bg-white rounded-2xl border border-[#e8e6e0] p-6 space-y-4">
              <div className="grid sm:grid-cols-2 gap-4">
                {[{ label: "Full name", key: "name", type: "text", placeholder: "Jane Smith" }, { label: "Phone number", key: "phone", type: "tel", placeholder: "+1 555-0000" }].map(f => (
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
            <p className="text-[#6b6b80] mb-6">Review your appointment details before confirming.</p>
            <div className="bg-white rounded-2xl border border-[#e8e6e0] p-6 mb-4">
              <div className="flex justify-between text-sm py-2.5 border-b border-[#f5f3ef]">
                <span className="text-[#6b6b80]">Business</span>
                <span className="font-medium">{business.name}</span>
              </div>

              {/* Services list */}
              <div className="py-2.5 border-b border-[#f5f3ef]">
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-[#6b6b80]">Service{selectedServiceObjs.length > 1 ? "s" : ""}</span>
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
                { label: "Provider", value: selectedStaff === "any" ? "No preference" : staff?.name },
                { label: "Date", value: dateStr },
                { label: "Time", value: selectedTime },
                { label: "Total duration", value: `${totalDuration} min` },
                { label: "Name", value: form.name },
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
                <span className={`font-semibold ${business.paymentMode === "postpaid" ? "text-amber-600" : "text-green-600"}`}>
                  {business.paymentMode === "postpaid" ? "Pay at appointment" : "Pay now via card"}
                </span>
              </div>
            </div>
            {business.paymentMode === "postpaid" && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-700 mb-4">
                💵 Payment will be collected at the time of your appointment.
              </div>
            )}
            <div className="bg-blue-50 rounded-xl px-4 py-3 text-sm text-blue-700 mb-4">
              📧 A confirmation will be sent to <strong>{form.email}</strong> along with a reminder 24h before.
            </div>
            {error && <p className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-3 mb-4">{error}</p>}
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
            <button onClick={handleConfirm} disabled={loading || !form.name || !form.email || !isValidEmail(form.email)}
              className="flex items-center gap-2 text-white font-semibold px-6 py-3 rounded-xl text-sm transition-colors disabled:opacity-60 disabled:cursor-not-allowed hover:opacity-90"
              style={{ background: color, color: fg }}>
              {loading ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
              {loading ? "Processing…" : "Confirm booking"}
            </button>
          ) : (
            <button onClick={next} disabled={
              (step === "service" && selectedServices.length === 0) ||
              (step === "staff" && (provider.kind === "none" || (provider.kind === "choose" && !selectedStaff))) ||
              (step === "datetime" && (!selectedDate || !selectedTime)) ||
              (step === "details" && (!form.name || !form.email || !isValidEmail(form.email)))
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
