import { Check, Star } from "lucide-react";

/* Compact phone frame used to flank the hero carousel. */
function PhoneFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-gray-900 shadow-2xl overflow-hidden" style={{ borderRadius: 30, width: 128, height: 270, padding: 3 }}>
      <div className="bg-white h-full overflow-hidden flex flex-col" style={{ borderRadius: 27 }}>
        <div className="flex justify-center pt-2.5 pb-1">
          <div className="bg-gray-900 rounded-full" style={{ width: 52, height: 12 }} />
        </div>
        {children}
      </div>
    </div>
  );
}

/* Client-facing booking page */
export function ClientPhone() {
  const services = [
    { n: "Haircut & Style", d: "45 min", p: "$45" },
    { n: "Beard Trim", d: "20 min", p: "$20" },
    { n: "Hair Treatment", d: "30 min", p: "$35" },
  ];
  return (
    <PhoneFrame>
      <div className="bg-sky-600 px-3 py-2.5 text-center">
        <p className="text-sky-200 font-medium" style={{ fontSize: 7 }}>Glow Beauty Studio</p>
        <p className="text-white font-syne font-bold" style={{ fontSize: 11 }}>Book an appointment</p>
        <div className="flex items-center justify-center gap-0.5 mt-1">
          {Array(5).fill(0).map((_, i) => <Star key={i} size={6} className="text-amber-300 fill-amber-300" />)}
          <span className="text-sky-100 ml-0.5" style={{ fontSize: 6 }}>4.9</span>
        </div>
      </div>
      <div className="flex-1 p-2 space-y-1.5">
        {services.map((s, i) => (
          <div key={s.n} className={`rounded-lg p-1.5 border ${i === 0 ? "border-sky-300 bg-sky-50" : "border-gray-100"}`}>
            <div className="flex items-center justify-between">
              <span className="font-semibold text-gray-800" style={{ fontSize: 8 }}>{s.n}</span>
              <span className="font-bold text-sky-600" style={{ fontSize: 8 }}>{s.p}</span>
            </div>
            <span className="text-gray-400" style={{ fontSize: 6.5 }}>{s.d}</span>
          </div>
        ))}
      </div>
      <div className="p-2">
        <div className="bg-sky-600 text-white text-center rounded-lg py-1.5 font-semibold" style={{ fontSize: 8 }}>Continue</div>
      </div>
    </PhoneFrame>
  );
}

/* Owner mobile dashboard */
export function OwnerPhone() {
  const upcoming = [
    { name: "Sarah R.", time: "10:00 AM", color: "#0284c7" },
    { name: "Michael K.", time: "11:30 AM", color: "#0ea5e9" },
    { name: "Ana Lopez", time: "1:00 PM", color: "#ec4899" },
  ];
  return (
    <PhoneFrame>
      <div className="px-3 py-2.5">
        <p className="text-gray-400" style={{ fontSize: 6.5 }}>Thursday, Apr 24</p>
        <p className="font-syne font-bold text-gray-900" style={{ fontSize: 11 }}>Today</p>
      </div>
      <div className="px-2 grid grid-cols-2 gap-1.5">
        <div className="rounded-lg bg-green-50 p-1.5">
          <div className="font-syne font-bold text-green-700" style={{ fontSize: 11 }}>$640</div>
          <div className="text-green-600" style={{ fontSize: 6 }}>Revenue</div>
        </div>
        <div className="rounded-lg bg-sky-50 p-1.5">
          <div className="font-syne font-bold text-sky-700" style={{ fontSize: 11 }}>8</div>
          <div className="text-sky-600" style={{ fontSize: 6 }}>Bookings</div>
        </div>
      </div>
      <div className="flex-1 p-2 space-y-1">
        {upcoming.map(u => (
          <div key={u.name} className="flex items-center gap-1.5 rounded-lg bg-gray-50 p-1.5">
            <div className="w-4 h-4 rounded-full flex items-center justify-center text-white font-bold flex-shrink-0" style={{ background: u.color, fontSize: 6 }}>
              {u.name.split(" ").map(n => n[0]).join("")}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-gray-800 truncate" style={{ fontSize: 7.5 }}>{u.name}</div>
              <div className="text-gray-400" style={{ fontSize: 6 }}>{u.time}</div>
            </div>
            <Check size={9} className="text-green-500" />
          </div>
        ))}
      </div>
    </PhoneFrame>
  );
}
