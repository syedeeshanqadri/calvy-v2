"use client";
import { useState, useEffect, useRef } from "react";
import { MessageCircle, X, Check, ChevronLeft, ChevronRight } from "lucide-react";
import { formatCurrencyAmount } from "@/lib/currency";
import { cn } from "@/lib/utils";
import { launchCheckout } from "@/lib/payments/launchCheckout";
import { HOLD_MINUTES } from "@/lib/holds";

interface Service {
  id: string; name: string; duration: number; price: number; color: string; capacity: number;
}
interface ChatBusiness {
  slug: string; name: string; primaryColor: string; currency: string; services: Service[];
}

type Step = "services" | "date" | "time" | "details" | "confirm" | "success";

interface Message {
  id: number; role: "bot" | "user"; text: string;
}

let _id = 0;
function msg(role: "bot" | "user", text: string): Message {
  return { id: ++_id, role, text };
}

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DAYS_SHORT = ["Su","Mo","Tu","We","Th","Fr","Sa"];

function bold(text: string) {
  return text.split("**").map((part, i) =>
    i % 2 === 1 ? <strong key={i}>{part}</strong> : <span key={i}>{part}</span>
  );
}

export function ChatWidget({ business }: { business: ChatBusiness }) {
  const color = business.primaryColor || "#0284c7";
  const [open, setOpen] = useState(false);
  const [started, setStarted] = useState(false);
  const [step, setStep] = useState<Step>("services");
  const [messages, setMessages] = useState<Message[]>([]);
  const [selectedServices, setSelectedServices] = useState<string[]>([]);
  const [viewMonth, setViewMonth] = useState(new Date().getMonth());
  const [viewYear, setViewYear] = useState(new Date().getFullYear());
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedTime, setSelectedTime] = useState("");
  const [slots, setSlots] = useState<string[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [details, setDetails] = useState({ name: "", email: "", phone: "" });
  const [submitting, setSubmitting] = useState(false);
  const [hoveredSlot, setHoveredSlot] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  function push(...msgs: Message[]) {
    setMessages(prev => [...prev, ...msgs]);
  }

  useEffect(() => {
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 60);
  }, [messages, step]);

  function start() {
    setOpen(true);
    if (!started) {
      setStarted(true);
      setMessages([
        msg("bot", `👋 Hi! Welcome to **${business.name}**.`),
        msg("bot", "I'm your booking assistant. Which service(s) would you like to book?"),
      ]);
      setStep("services");
    }
  }

  const selectedSvcs = business.services.filter(s => selectedServices.includes(s.id));
  const totalDuration = selectedSvcs.reduce((a, s) => a + s.duration, 0);
  const totalPrice = selectedSvcs.reduce((a, s) => a + s.price, 0);

  function toggleService(id: string) {
    setSelectedServices(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }

  function confirmServices() {
    if (!selectedServices.length) return;
    const names = selectedSvcs.map(s => s.name).join(" & ");
    push(
      msg("user", names),
      msg("bot", `Great choice! When would you like to come in?`),
    );
    setStep("date");
  }

  const todayStr = new Date().toISOString().split("T")[0];
  const firstDay = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const calCells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  function isPast(day: number) {
    const d = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    return d < todayStr;
  }

  function pickDate(day: number) {
    const d = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    setSelectedDate(d);
    setSelectedTime("");
    const label = new Date(d + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
    push(msg("user", label), msg("bot", "Let me check available times for you..."));
    setStep("time");
    setSlotsLoading(true);
    fetch(`/api/availability?slug=${business.slug}&date=${d}&duration=${totalDuration}&serviceId=${selectedServices[0]}&serviceIds=${selectedServices.join(",")}`)
      .then(r => r.json())
      .then(data => { setSlots(data.slots ?? []); setSlotsLoading(false); })
      .catch(() => { setSlots([]); setSlotsLoading(false); });
  }

  function pickTime(t: string) {
    setSelectedTime(t);
    push(msg("user", t), msg("bot", "Almost there! Just a few details to confirm your booking."));
    setStep("details");
  }

  function submitDetails() {
    if (!details.name || !details.email) return;
    const dateLabel = new Date(selectedDate + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
    const names = selectedSvcs.map(s => s.name).join(" & ");
    push(
      msg("user", `${details.name} · ${details.email}`),
      msg("bot",
        `Here's your booking summary:\n\n` +
        `📋 **${names}**\n` +
        `📅 ${dateLabel} at **${selectedTime}**\n` +
        `⏱ ${totalDuration} min · **${formatCurrencyAmount(totalPrice, business.currency)}**\n` +
        `👤 ${details.name}\n\n` +
        `Ready to confirm?`
      ),
    );
    setStep("confirm");
  }

  async function confirmBooking() {
    setSubmitting(true);
    try {
      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessSlug: business.slug,
          serviceIds: selectedServices,
          staffId: null,
          date: selectedDate,
          time: selectedTime,
          clientName: details.name,
          clientEmail: details.email,
          clientPhone: details.phone || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Booking failed");
      if (data.checkout) {
        push(msg("bot", `Taking you to the secure payment page. Your slot is held for ${HOLD_MINUTES} minutes...`));
        await launchCheckout(data.checkout);
      } else if (data.url) {
        push(msg("bot", "Redirecting you to payment..."));
        setTimeout(() => { window.location.href = data.url; }, 900);
      } else {
        push(msg("bot", `✅ **Booking confirmed!** A confirmation email has been sent to **${details.email}**. See you soon! 🎉`));
        setStep("success");
      }
    } catch (e) {
      push(msg("bot", `❌ ${(e as Error).message}. Please try again.`));
    } finally {
      setSubmitting(false);
    }
  }

  function restart() {
    setMessages([
      msg("bot", `👋 Hi again! Which service would you like to book?`),
    ]);
    setSelectedServices([]);
    setSelectedDate("");
    setSelectedTime("");
    setSlots([]);
    setDetails({ name: "", email: "", phone: "" });
    setStep("services");
  }

  function prevMonth() {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); } else setViewMonth(m => m - 1);
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); } else setViewMonth(m => m + 1);
  }

  return (
    <>
      {/* Chat window */}
      {open && (
        <div className="fixed bottom-20 right-4 sm:right-6 z-50 w-[min(calc(100vw-2rem),384px)] max-h-[80vh] bg-white rounded-3xl shadow-2xl border border-gray-100 flex flex-col overflow-hidden">

          {/* Header */}
          <div className="flex items-center gap-3 px-4 py-3.5 flex-shrink-0" style={{ background: color }}>
            <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center font-bold text-white text-sm flex-shrink-0">
              {business.name[0].toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white font-semibold text-sm leading-tight truncate">{business.name}</p>
              <p className="text-white/70 text-[11px]">Booking Assistant · Online</p>
            </div>
            <button onClick={() => setOpen(false)} className="p-1.5 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors">
              <X size={15} />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2 bg-[#f8f9fb]">
            {messages.map(m => (
              <div key={m.id} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
                <div className={cn(
                  "max-w-[82%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-line",
                  m.role === "user" ? "rounded-br-sm text-white" : "bg-white rounded-bl-sm shadow-sm text-gray-800"
                )} style={m.role === "user" ? { background: color } : {}}>
                  {bold(m.text)}
                </div>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>

          {/* Action panel */}
          <div className="flex-shrink-0 bg-white border-t border-gray-100">

            {/* ── Step: services ── */}
            {step === "services" && (
              <div className="p-3 space-y-2">
                <div className="max-h-44 overflow-y-auto space-y-1">
                  {business.services.map(svc => {
                    const sel = selectedServices.includes(svc.id);
                    return (
                      <button key={svc.id} onClick={() => toggleService(svc.id)}
                        className={cn("w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left border-2 transition-all text-sm",
                          sel ? "border-transparent" : "border-gray-100 hover:border-gray-200 bg-gray-50")}
                        style={sel ? { borderColor: color, background: color + "18" } : {}}>
                        <div className={cn("w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-all",
                          sel ? "border-transparent" : "border-gray-300")}
                          style={sel ? { background: color } : {}}>
                          {sel && <Check size={9} className="text-white" />}
                        </div>
                        <span className="flex-1 font-medium text-gray-800">{svc.name}</span>
                        <span className="text-[11px] text-gray-400">{svc.duration}m</span>
                        <span className="text-[11px] font-semibold" style={{ color }}>{formatCurrencyAmount(svc.price, business.currency)}</span>
                      </button>
                    );
                  })}
                </div>
                {selectedServices.length > 0 && (
                  <button onClick={confirmServices}
                    className="w-full py-2.5 rounded-xl text-sm font-semibold text-white hover:opacity-90 transition-opacity"
                    style={{ background: color }}>
                    {selectedServices.length > 1
                      ? `Continue — ${selectedServices.length} services · ${formatCurrencyAmount(totalPrice, business.currency)}`
                      : "Continue →"}
                  </button>
                )}
              </div>
            )}

            {/* ── Step: date ── */}
            {step === "date" && (
              <div className="p-3">
                <div className="flex items-center justify-between mb-2">
                  <button onClick={prevMonth} className="w-7 h-7 rounded-lg border border-gray-100 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors">
                    <ChevronLeft size={13} />
                  </button>
                  <span className="text-xs font-semibold text-gray-600">{MONTHS[viewMonth]} {viewYear}</span>
                  <button onClick={nextMonth} className="w-7 h-7 rounded-lg border border-gray-100 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors">
                    <ChevronRight size={13} />
                  </button>
                </div>
                <div className="grid grid-cols-7 gap-0.5 mb-1">
                  {DAYS_SHORT.map(d => <div key={d} className="text-center text-[9px] font-bold text-gray-300 py-0.5">{d}</div>)}
                </div>
                <div className="grid grid-cols-7 gap-0.5">
                  {calCells.map((day, i) => {
                    const past = day ? isPast(day) : false;
                    const today = day ? `${viewYear}-${String(viewMonth+1).padStart(2,"0")}-${String(day).padStart(2,"0")}` === todayStr : false;
                    return (
                      <button key={i} disabled={!day || past}
                        onClick={() => day && !past && pickDate(day)}
                        className={cn("aspect-square rounded-lg text-[11px] font-medium transition-all",
                          !day && "invisible",
                          past && "text-gray-200 cursor-not-allowed",
                          !past && day && "text-gray-700 hover:text-white cursor-pointer",
                          today && !past && "ring-2 ring-offset-1")}
                        onMouseEnter={e => { if (day && !past) (e.currentTarget as HTMLElement).style.background = color; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = ""; }}>
                        {day}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── Step: time ── */}
            {step === "time" && (
              <div className="p-3">
                {slotsLoading ? (
                  <div className="py-4 text-center text-xs text-gray-400 flex items-center justify-center gap-2">
                    <div className="w-3.5 h-3.5 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" style={{ borderTopColor: color }} />
                    Checking availability...
                  </div>
                ) : slots.length === 0 ? (
                  <div className="py-3 space-y-2 text-center">
                    <p className="text-xs text-gray-400">No slots available on this day.</p>
                    <button onClick={() => setStep("date")}
                      className="flex items-center gap-1 text-xs font-medium mx-auto hover:opacity-70 transition-opacity"
                      style={{ color }}>
                      <ChevronLeft size={12} /> Pick another date
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-4 gap-1.5">
                    {slots.map(slot => (
                      <button key={slot} onClick={() => pickTime(slot)}
                        onMouseEnter={() => setHoveredSlot(slot)}
                        onMouseLeave={() => setHoveredSlot("")}
                        className="py-2 rounded-xl text-[11px] font-semibold border-2 border-gray-100 transition-all text-gray-600"
                        style={hoveredSlot === slot ? { background: color, borderColor: color, color: "white" } : {}}>
                        {slot}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ── Step: details ── */}
            {step === "details" && (
              <div className="p-3 space-y-2">
                <input placeholder="Full name *" value={details.name}
                  onChange={e => setDetails(d => ({ ...d, name: e.target.value }))}
                  className="w-full h-9 rounded-xl border border-gray-200 px-3 text-sm focus:outline-none transition-colors"
                  style={{ focusBorderColor: color } as React.CSSProperties}
                  onFocus={e => (e.target.style.borderColor = color)}
                  onBlur={e => (e.target.style.borderColor = "")} />
                <input type="email" placeholder="Email address *" value={details.email}
                  onChange={e => setDetails(d => ({ ...d, email: e.target.value }))}
                  className="w-full h-9 rounded-xl border border-gray-200 px-3 text-sm focus:outline-none transition-colors"
                  onFocus={e => (e.target.style.borderColor = color)}
                  onBlur={e => (e.target.style.borderColor = "")} />
                <input type="tel" placeholder="Phone (optional)" value={details.phone}
                  onChange={e => setDetails(d => ({ ...d, phone: e.target.value }))}
                  className="w-full h-9 rounded-xl border border-gray-200 px-3 text-sm focus:outline-none transition-colors"
                  onFocus={e => (e.target.style.borderColor = color)}
                  onBlur={e => (e.target.style.borderColor = "")} />
                <button onClick={submitDetails} disabled={!details.name || !details.email}
                  className="w-full py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-40 hover:opacity-90 transition-opacity"
                  style={{ background: color }}>
                  Review Booking →
                </button>
              </div>
            )}

            {/* ── Step: confirm ── */}
            {step === "confirm" && (
              <div className="p-3 space-y-2">
                <button onClick={confirmBooking} disabled={submitting}
                  className="w-full py-3 rounded-xl text-sm font-bold text-white disabled:opacity-50 hover:opacity-90 transition-opacity"
                  style={{ background: color }}>
                  {submitting ? "Confirming…" : "✓ Confirm Booking"}
                </button>
                <button onClick={() => setStep("details")}
                  className="w-full py-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors flex items-center justify-center gap-1">
                  <ChevronLeft size={11} /> Edit details
                </button>
              </div>
            )}

            {/* ── Step: success ── */}
            {step === "success" && (
              <div className="p-3">
                <button onClick={restart}
                  className="w-full py-2.5 rounded-xl text-sm font-semibold border-2 border-gray-100 hover:border-gray-200 text-gray-600 transition-colors">
                  Book another appointment
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Floating button */}
      <button onClick={open ? () => setOpen(false) : start}
        className="fixed bottom-5 right-4 sm:right-6 z-50 w-14 h-14 rounded-full shadow-xl flex items-center justify-center transition-all hover:scale-110 active:scale-95"
        style={{ background: color }}>
        {open
          ? <X size={21} className="text-white" />
          : <MessageCircle size={21} className="text-white" />}
        {!open && !started && (
          <span className="absolute -top-1 -right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-white" />
        )}
      </button>
    </>
  );
}
