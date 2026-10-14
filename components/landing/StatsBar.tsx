import { Building2, CalendarCheck, Star, TrendingDown } from "lucide-react";

const STATS = [
  { num: "12,000+", label: "Businesses on Calvy", Icon: Building2 },
  { num: "3.2M", label: "Appointments booked", Icon: CalendarCheck },
  { num: "98%", label: "Customer satisfaction", Icon: Star },
  { num: "80%", label: "Fewer no-shows", Icon: TrendingDown },
];

export function StatsBar() {
  return (
    <div className="bg-gray-950 py-14">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-8 lg:gap-0 lg:divide-x lg:divide-white/10">
          {STATS.map((s) => (
            <div key={s.label} className="text-center px-8">
              <div className="flex justify-center mb-3">
                <s.Icon size={22} className="text-sky-400" />
              </div>
              <div className="font-syne font-extrabold text-4xl lg:text-5xl text-white mb-1.5">{s.num}</div>
              <div className="text-sm text-gray-400 font-medium">{s.label}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
