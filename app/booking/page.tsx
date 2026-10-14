"use client";
import { useState } from "react";
import Link from "next/link";
import { generateTimeSlots, formatCurrency } from "@/lib/utils";
import { cn } from "@/lib/utils";

// Demo-only static data — real booking pages live at /b/[slug]
const SERVICES = [
  { id: "s1", name: "Consultation", description: "Initial consultation session", duration: 30, price: 50, color: "#0284c7", isActive: true },
  { id: "s2", name: "Full Session", description: "Complete service session", duration: 60, price: 120, color: "#3b82f6", isActive: true },
  { id: "s3", name: "Follow-up", description: "Follow-up and review", duration: 45, price: 80, color: "#22c55e", isActive: true },
];
const STAFF = [
  { id: "st1", name: "Alex Johnson", role: "Senior Specialist", color: "#0284c7", services: ["s1","s2","s3"], appointmentsToday: 4 },
  { id: "st2", name: "Jordan Lee", role: "Specialist", color: "#3b82f6", services: ["s1","s3"], appointmentsToday: 3 },
];
import { ChevronLeft, ChevronRight, Check, Clock, Star } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

type Step = "service" | "staff" | "datetime" | "details" | "confirm";

const STEPS: Step[] = ["service", "staff", "datetime", "details", "confirm"];
const STEP_LABELS = ["Service", "Staff", "Date & Time", "Your Details", "Confirm"];

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DAYS_SHORT = ["Su","Mo","Tu","We","Th","Fr","Sa"];

export default function BookingPage() {
  const [step, setStep] = useState<Step>("service");
  const [selectedService, setSelectedService] = useState<string | null>(null);
  const [selectedStaff, setSelectedStaff] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<number | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", email: "", phone: "", notes: "" });
  const [booked, setBooked] = useState(false);

  const today = new Date();
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const firstDay = new Date(currentYear, currentMonth, 1).getDay();
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const calCells: (number | null)[] = [...Array(firstDay).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  const timeSlots = generateTimeSlots(9, 18, 30);
  const todayDay = today.getDate();
  const todayMonth = today.getMonth();
  const todayYear = today.getFullYear();
  function isPastDay(day: number) {
    if (currentYear < todayYear) return true;
    if (currentYear === todayYear && currentMonth < todayMonth) return true;
    if (currentYear === todayYear && currentMonth === todayMonth && day < todayDay) return true;
    return false;
  }
  function prevMonth() {
    if (currentMonth === 0) { setCurrentMonth(11); setCurrentYear(y => y - 1); }
    else setCurrentMonth(m => m - 1);
    setSelectedDate(null); setSelectedTime(null);
  }
  function nextMonth() {
    if (currentMonth === 11) { setCurrentMonth(0); setCurrentYear(y => y + 1); }
    else setCurrentMonth(m => m + 1);
    setSelectedDate(null); setSelectedTime(null);
  }

  const service = SERVICES.find(s => s.id === selectedService);
  const staff = STAFF.find(s => s.id === selectedStaff);
  const stepIndex = STEPS.indexOf(step);

  const next = () => { if (stepIndex < STEPS.length - 1) setStep(STEPS[stepIndex + 1]); };
  const back = () => { if (stepIndex > 0) setStep(STEPS[stepIndex - 1]); };

  if (booked) {
    return (
      <div className="min-h-screen bg-[#f8f7f4] flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl p-10 max-w-md w-full text-center shadow-xl border border-[#e8e6e0]">
          <div className="w-16 h-16 rounded-full bg-green-50 flex items-center justify-center mx-auto mb-6">
            <Check size={28} className="text-green-600" />
          </div>
          <h1 className="font-syne font-bold text-2xl mb-2">You&apos;re booked! 🎉</h1>
          <p className="text-[#6b6b80] mb-6">A confirmation has been sent to <strong>{form.email}</strong>. We can&apos;t wait to see you!</p>
          <div className="bg-[#f8f7f4] rounded-2xl p-5 text-left mb-6 space-y-2">
            <div className="flex justify-between text-sm"><span className="text-[#6b6b80]">Service</span><span className="font-medium">{service?.name}</span></div>
            <div className="flex justify-between text-sm"><span className="text-[#6b6b80]">Staff</span><span className="font-medium">{staff?.name}</span></div>
            <div className="flex justify-between text-sm"><span className="text-[#6b6b80]">Date</span><span className="font-medium">{MONTHS[currentMonth]} {selectedDate}, {currentYear}</span></div>
            <div className="flex justify-between text-sm"><span className="text-[#6b6b80]">Time</span><span className="font-medium">{selectedTime}</span></div>
            <div className="flex justify-between text-sm border-t border-[#f0ede8] pt-2 mt-2"><span className="font-semibold">Total</span><span className="font-bold text-accent">{formatCurrency(service?.price || 0)}</span></div>
          </div>
          <Link href="/"><Button className="w-full justify-center">Back to home</Button></Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f8f7f4]">
      {/* Top bar */}
      <div className="bg-[#0f0f1a] px-6 py-4 flex items-center gap-3">
        <div className="w-2.5 h-2.5 rounded-full bg-accent" />
        <span className="font-syne font-bold text-lg text-white">Calvy</span>
        <span className="text-white/30 mx-2">·</span>
        <span className="text-white/60 text-sm">Alex Johnson Studio</span>
      </div>

      {/* Progress */}
      <div className="bg-white border-b border-[#e8e6e0]">
        <div className="max-w-2xl mx-auto px-4 py-4">
          <div className="flex items-center gap-2">
            {STEPS.map((s, i) => (
              <div key={s} className="flex items-center gap-2 flex-1 last:flex-none">
                <div className={cn("w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 transition-all", i < stepIndex ? "bg-accent text-white" : i === stepIndex ? "bg-[#0f0f1a] text-white" : "bg-[#f0ede8] text-[#6b6b80]")}>
                  {i < stepIndex ? <Check size={12} /> : i + 1}
                </div>
                <span className={cn("text-xs font-medium hidden sm:block", i === stepIndex ? "text-brand-900" : "text-[#6b6b80]")}>{STEP_LABELS[i]}</span>
                {i < STEPS.length - 1 && <div className={cn("flex-1 h-px hidden sm:block", i < stepIndex ? "bg-accent" : "bg-[#e8e6e0]")} />}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-2xl mx-auto px-4 py-8">
        {/* Step: Service */}
        {step === "service" && (
          <div>
            <h2 className="font-syne font-bold text-2xl mb-2">Choose a service</h2>
            <p className="text-[#6b6b80] mb-6">Select the service you&apos;d like to book.</p>
            <div className="space-y-3">
              {SERVICES.filter(s => s.isActive).map(svc => (
                <button key={svc.id} onClick={() => setSelectedService(svc.id)} className={cn("w-full bg-white rounded-2xl p-5 border-2 text-left transition-all hover:shadow-md flex items-center gap-4", selectedService === svc.id ? "border-accent shadow-md" : "border-[#e8e6e0] hover:border-[#c8c6c0]")}>
                  <div className="w-10 h-10 rounded-xl flex-shrink-0 flex items-center justify-center" style={{ background: svc.color + "20" }}>
                    <div className="w-4 h-4 rounded-full" style={{ background: svc.color }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-brand-900">{svc.name}</div>
                    <div className="text-sm text-[#6b6b80] mt-0.5">{svc.description}</div>
                    <div className="flex items-center gap-3 mt-2">
                      <div className="flex items-center gap-1 text-xs text-[#6b6b80]"><Clock size={11} /> {svc.duration} min</div>
                    </div>
                  </div>
                  <div className="font-syne font-bold text-lg text-accent">${svc.price}</div>
                  {selectedService === svc.id && <div className="w-5 h-5 rounded-full bg-accent flex items-center justify-center flex-shrink-0"><Check size={11} className="text-white" /></div>}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step: Staff */}
        {step === "staff" && (
          <div>
            <h2 className="font-syne font-bold text-2xl mb-2">Choose your provider</h2>
            <p className="text-[#6b6b80] mb-6">Select who you&apos;d like your appointment with.</p>
            <button onClick={() => setSelectedStaff("any")} className={cn("w-full bg-white rounded-2xl p-5 border-2 text-left transition-all mb-3 flex items-center gap-4", selectedStaff === "any" ? "border-accent shadow-md" : "border-[#e8e6e0]")}>
              <div className="w-11 h-11 rounded-full bg-[#f0ede8] flex items-center justify-center text-[#6b6b80] font-bold flex-shrink-0">?</div>
              <div><div className="font-semibold">No preference</div><div className="text-sm text-[#6b6b80]">We&apos;ll assign the best available provider</div></div>
              {selectedStaff === "any" && <div className="ml-auto w-5 h-5 rounded-full bg-accent flex items-center justify-center"><Check size={11} className="text-white" /></div>}
            </button>
            {STAFF.filter(s => service ? s.services.includes(service.id) : true).map(member => (
              <button key={member.id} onClick={() => setSelectedStaff(member.id)} className={cn("w-full bg-white rounded-2xl p-5 border-2 text-left transition-all mb-3 flex items-center gap-4 hover:shadow-md", selectedStaff === member.id ? "border-accent shadow-md" : "border-[#e8e6e0] hover:border-[#c8c6c0]")}>
                <div className="w-11 h-11 rounded-full flex items-center justify-center text-white font-syne font-bold flex-shrink-0" style={{ background: member.color }}>
                  {member.name.split(" ").map(n => n[0]).join("")}
                </div>
                <div className="flex-1">
                  <div className="font-semibold">{member.name}</div>
                  <div className="text-sm text-[#6b6b80]">{member.role}</div>
                  <div className="flex items-center gap-1 mt-1"><Star size={11} className="text-gold fill-gold" /><span className="text-xs text-[#6b6b80]">4.9 · {member.appointmentsToday * 12} reviews</span></div>
                </div>
                {selectedStaff === member.id && <div className="w-5 h-5 rounded-full bg-accent flex items-center justify-center"><Check size={11} className="text-white" /></div>}
              </button>
            ))}
          </div>
        )}

        {/* Step: Date & Time */}
        {step === "datetime" && (
          <div>
            <h2 className="font-syne font-bold text-2xl mb-2">Pick a date & time</h2>
            <p className="text-[#6b6b80] mb-6">Choose when you&apos;d like your appointment.</p>
            <div className="bg-white rounded-2xl border border-[#e8e6e0] p-5 mb-4">
              <div className="flex items-center justify-between mb-4">
                <button onClick={prevMonth} className="w-8 h-8 rounded-lg border border-[#e8e6e0] flex items-center justify-center text-[#6b6b80] hover:bg-[#f8f7f4] transition-colors"><ChevronLeft size={16} /></button>
                <span className="font-syne font-bold">{MONTHS[currentMonth]} {currentYear}</span>
                <button onClick={nextMonth} className="w-8 h-8 rounded-lg border border-[#e8e6e0] flex items-center justify-center text-[#6b6b80] hover:bg-[#f8f7f4] transition-colors"><ChevronRight size={16} /></button>
              </div>
              <div className="grid grid-cols-7 gap-1 mb-2">
                {DAYS_SHORT.map(d => <div key={d} className="text-center text-[11px] font-bold text-[#6b6b80] py-1">{d}</div>)}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {calCells.map((day, i) => {
                  const past = day ? isPastDay(day) : false;
                  const isSelected = day === selectedDate;
                  return (
                    <button key={i} disabled={!day || past} onClick={() => day && setSelectedDate(day)} className={cn("aspect-square rounded-xl text-sm transition-all", !day && "invisible", past && "text-[#d0cec8] cursor-not-allowed", !past && day && "hover:bg-[#f8f7f4] cursor-pointer", isSelected && "bg-[#0f0f1a] text-white font-bold hover:bg-[#0f0f1a]")}>
                      {day}
                    </button>
                  );
                })}
              </div>
            </div>
            {selectedDate && (
              <div className="bg-white rounded-2xl border border-[#e8e6e0] p-5">
                <p className="font-semibold text-sm mb-3">Available times — {MONTHS[currentMonth]} {selectedDate}</p>
                <div className="grid grid-cols-4 gap-2">
                  {timeSlots.map(slot => {
                    const isSelected = slot === selectedTime;
                    const isUnavailable = ["10:00", "11:30", "14:00"].includes(slot);
                    return (
                      <button key={slot} disabled={isUnavailable} onClick={() => setSelectedTime(slot)} className={cn("py-2 rounded-xl text-sm border transition-all font-medium", isUnavailable && "opacity-35 cursor-not-allowed bg-[#f8f7f4] border-transparent text-[#6b6b80]", isSelected && "bg-[#0f0f1a] text-white border-[#0f0f1a]", !isSelected && !isUnavailable && "border-[#e8e6e0] hover:border-accent hover:text-accent")}>
                        {slot}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step: Details */}
        {step === "details" && (
          <div>
            <h2 className="font-syne font-bold text-2xl mb-2">Your details</h2>
            <p className="text-[#6b6b80] mb-6">We&apos;ll use this to send your confirmation and reminders.</p>
            <div className="bg-white rounded-2xl border border-[#e8e6e0] p-6 space-y-4">
              <div className="grid sm:grid-cols-2 gap-4">
                <Input label="Full name" placeholder="Jane Smith" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
                <Input label="Phone number" placeholder="+1 555-0000" type="tel" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
              </div>
              <Input label="Email address" placeholder="jane@email.com" type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
              <div>
                <label className="text-sm font-medium text-brand-800 block mb-1.5">Notes (optional)</label>
                <textarea className="w-full rounded-xl border border-[#e8e6e0] px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent transition-all" rows={3} placeholder="Anything we should know?" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
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
              <div className="space-y-3">
                {[
                  { label: "Service", value: service?.name },
                  { label: "Provider", value: selectedStaff === "any" ? "No preference" : staff?.name },
                  { label: "Date", value: selectedDate ? `${MONTHS[currentMonth]} ${selectedDate}, ${currentYear}` : "—" },
                  { label: "Time", value: selectedTime || "—" },
                  { label: "Duration", value: service ? `${service.duration} min` : "—" },
                  { label: "Name", value: form.name || "—" },
                  { label: "Email", value: form.email || "—" },
                ].map(row => (
                  <div key={row.label} className="flex justify-between text-sm">
                    <span className="text-[#6b6b80]">{row.label}</span>
                    <span className="font-medium">{row.value}</span>
                  </div>
                ))}
                <div className="border-t border-[#f0ede8] pt-3 mt-3 flex justify-between">
                  <span className="font-bold">Total</span>
                  <span className="font-bold text-lg text-accent">{formatCurrency(service?.price || 0)}</span>
                </div>
              </div>
            </div>
            <div className="bg-blue-50 rounded-xl px-4 py-3 text-sm text-blue-700 mb-4">
              📧 A confirmation email will be sent to <strong>{form.email}</strong>, along with a reminder 24h before your appointment.
            </div>
          </div>
        )}

        {/* Navigation */}
        <div className="flex items-center justify-between mt-8">
          {stepIndex > 0 ? (
            <button onClick={back} className="flex items-center gap-2 text-[#6b6b80] hover:text-brand-800 transition-colors text-sm font-medium">
              <ChevronLeft size={16} /> Back
            </button>
          ) : <div />}
          {step === "confirm" ? (
            <Button onClick={() => setBooked(true)} size="lg" disabled={!form.name || !form.email} className="gap-2">
              <Check size={16} /> Confirm booking
            </Button>
          ) : (
            <Button onClick={next} size="md" disabled={
              (step === "service" && !selectedService) ||
              (step === "staff" && !selectedStaff) ||
              (step === "datetime" && (!selectedDate || !selectedTime))
            } className="gap-2">
              Continue <ChevronRight size={16} />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
